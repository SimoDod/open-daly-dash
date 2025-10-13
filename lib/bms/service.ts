// cspell:words Uart
import { EventEmitter } from "events";
import { connectBleUart } from "./bleUart";
import type { BleUartConnection } from "./bleUart";
import { DalyParser, defaultPollSet } from "./daly";
import { DalyState } from "./state";
import { getBmsSampleModel } from "../db/mongoose";

export type BmsSnapshot = ReturnType<DalyState["snapshot"]>;
export type BmsEvent =
  | { ts: string; event: "hello" }
  | { ts: string; event: "connecting" }
  | { ts: string; event: "connected"; device: BleUartConnection["deviceInfo"] }
  | { ts: string; event: "ready" } // first valid decode received
  | { ts: string; event: "no_data"; for_ms: number } // link up but silent
  | { ts: string; event: "disconnected"; reason?: string }
  | { ts: string; event: "state"; snapshot: BmsSnapshot }
  | { ts: string; event: "tx"; hex: string }
  | { ts: string; event: "tx_error"; message: string }
  | { ts: string; event: "decoded"; data: import("./daly").Decoded };

const POLL_MS = parseInt(process.env.POLL_MS || "6000", 10);
const RATED_AH = Number(process.env.RATED_AH);
const TARGET_ADDR = (process.env.ADDR || "").toLowerCase();
const TARGET_NAME = (process.env.NAME || "").toLowerCase();
const SAMPLE_EVERY_MS = parseInt(process.env.SAMPLE_EVERY_MS || "15000", 10);

// Time without any incoming bytes before we declare "no_data" and drop the link (ms)
const RX_TIMEOUT_MS = parseInt(process.env.RX_TIMEOUT_MS || "15000", 10);
// Max time we allow for the initial BLE connect to complete (ms)
const CONNECT_TIMEOUT_MS = parseInt(
  process.env.CONNECT_TIMEOUT_MS || "15000",
  10
);

class BmsService extends EventEmitter {
  private started = false;
  private lastSnapshot: BmsSnapshot | null = null;
  private deviceInfo: BleUartConnection["deviceInfo"] | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private persistTimer: NodeJS.Timeout | null = null;
  private rxWatchTimer: NodeJS.Timeout | null = null;
  private stopping = false;

  private connected = false; // BLE transport connected
  private ready = false; // data decoded at least once

  getLastSnapshot() {
    return this.lastSnapshot;
  }
  getDeviceInfo() {
    return this.deviceInfo;
  }
  getIsConnected() {
    return this.connected;
  }
  getIsReady() {
    return this.ready;
  }

  async ensureStarted() {
    if (this.started) return;
    this.started = true;
    // Fire and forget the run loop; GET handler shouldn't block on BLE details
    void this.runLoop();
  }

  private async runLoop() {
    let backoffMs = 1000;

    while (!this.stopping) {
      // Announce connecting
      this.emit("evt", <BmsEvent>{
        ts: new Date().toISOString(),
        event: "connecting",
      });

      let ctx: Awaited<ReturnType<typeof connectBleUart>> | null = null;
      this.connected = false;
      this.ready = false;
      this.deviceInfo = null;

      try {
        // Only pass filters if present (avoid empty string surprises)
        const addr = TARGET_ADDR || undefined;
        const namePart = TARGET_NAME || undefined;

        ctx = await this.withTimeout(
          connectBleUart({ addr, namePart }),
          CONNECT_TIMEOUT_MS,
          "BLE connect timeout"
        );

        this.deviceInfo = ctx.deviceInfo;
        this.connected = true;
        this.emit("evt", <BmsEvent>{
          ts: new Date().toISOString(),
          event: "connected",
          device: this.deviceInfo,
        });

        const state = new DalyState({
          ratedAh: Number.isFinite(RATED_AH) ? RATED_AH : undefined,
        });

        const parser = new DalyParser(
          () => {},
          (d) => {
            state.update(d);
            this.lastSnapshot = state.snapshot();

            if (!this.ready) {
              this.ready = true;
              this.emit("evt", <BmsEvent>{
                ts: new Date().toISOString(),
                event: "ready",
              });
            }

            this.emit("evt", <BmsEvent>{
              ts: new Date().toISOString(),
              event: "decoded",
              data: d,
            });
            this.emit("evt", <BmsEvent>{
              ts: new Date().toISOString(),
              event: "state",
              snapshot: this.lastSnapshot!,
            });
          }
        );

        // Track last RX time for watchdog
        let lastRx = Date.now();

        ctx.onData((buf) => {
          lastRx = Date.now();
          parser.push(buf);
        });

        const frames = defaultPollSet();

        const sendPoll = async () => {
          for (const frame of frames) {
            try {
              await ctx!.write(frame);
              this.emit("evt", <BmsEvent>{
                ts: new Date().toISOString(),
                event: "tx",
                hex: frame.toString("hex"),
              });
              await new Promise((r) => setTimeout(r, 120));
            } catch (e) {
              this.emit("evt", <BmsEvent>{
                ts: new Date().toISOString(),
                event: "tx_error",
                message: e instanceof Error ? e.message : String(e),
              });
            }
          }
        };

        await sendPoll();
        this.pollTimer = setInterval(sendPoll, POLL_MS);

        // Persistence loop (Mongoose)
        if (Number.isFinite(SAMPLE_EVERY_MS) && SAMPLE_EVERY_MS > 0) {
          const persistOnce = async () => {
            try {
              if (this.lastSnapshot) {
                const Model = await getBmsSampleModel();
                await Model.create({
                  ts: new Date(),
                  snapshot: this.lastSnapshot,
                });
              }
            } catch {
              // ignore persistence errors, keep running
            }
          };
          await persistOnce();
          this.persistTimer = setInterval(persistOnce, SAMPLE_EVERY_MS);
        }

        // RX watchdog: if we don't see any bytes for RX_TIMEOUT_MS, declare no_data and drop link
        this.rxWatchTimer = setInterval(async () => {
          const idle = Date.now() - lastRx;
          if (idle >= RX_TIMEOUT_MS) {
            this.emit("evt", <BmsEvent>{
              ts: new Date().toISOString(),
              event: "no_data",
              for_ms: idle,
            });
            try {
              await ctx!.disconnect();
            } catch {}
          }
        }, Math.max(1000, Math.min(5000, Math.floor(RX_TIMEOUT_MS / 3))));

        ctx.onDisconnect(() => {
          this.cleanupTimers();
          if (this.stopping) return;
          this.connected = false;
          this.ready = false;
          this.emit("evt", <BmsEvent>{
            ts: new Date().toISOString(),
            event: "disconnected",
            reason: "BLE device disconnected",
          });
        });

        // Reset backoff after a successful connect
        backoffMs = 1000;

        // Wait here until we are disconnected (loop continues after onDisconnect)
        await new Promise<void>((resolve) => {
          const onDisc = () => resolve();
          ctx!.onDisconnect(onDisc);
        });
      } catch (e) {
        // Initial connect failed
        this.cleanupTimers();
        this.connected = false;
        this.ready = false;
        this.emit("evt", <BmsEvent>{
          ts: new Date().toISOString(),
          event: "disconnected",
          reason: e instanceof Error ? e.message : String(e),
        });
      }

      if (this.stopping) break;

      // Backoff before retry
      await new Promise((r) => setTimeout(r, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 30000);
    }
  }

  private cleanupTimers() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.persistTimer) clearInterval(this.persistTimer);
    if (this.rxWatchTimer) clearInterval(this.rxWatchTimer);
    this.pollTimer = this.persistTimer = this.rxWatchTimer = null;
  }

  private async withTimeout<T>(
    p: Promise<T>,
    ms: number,
    msg: string
  ): Promise<T> {
    let to: NodeJS.Timeout;
    return await Promise.race<T>([
      p.finally(() => clearTimeout(to)),
      new Promise<T>((_, rej) => {
        to = setTimeout(() => rej(new Error(msg)), ms);
      }),
    ]);
  }
}

type GlobalWithBms = typeof globalThis & { __bmsService?: BmsService };
declare const global: GlobalWithBms;

export function getBmsService(): BmsService {
  if (!global.__bmsService) {
    global.__bmsService = new BmsService();
  }
  return global.__bmsService;
}
