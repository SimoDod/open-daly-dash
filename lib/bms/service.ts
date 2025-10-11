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
  | { ts: string; event: "state"; snapshot: BmsSnapshot }
  | {
      ts: string;
      event: "connected";
      device: BleUartConnection["deviceInfo"];
    }
  | { ts: string; event: "tx"; hex: string }
  | { ts: string; event: "tx_error"; message: string }
  | { ts: string; event: "decoded"; data: import("./daly").Decoded };

const POLL_MS = parseInt(process.env.POLL_MS || "6000", 10);
const RATED_AH = Number(process.env.RATED_AH);
const TARGET_ADDR = (process.env.ADDR || "").toLowerCase();
const TARGET_NAME = (process.env.NAME || "").toLowerCase();
const SAMPLE_EVERY_MS = parseInt(process.env.SAMPLE_EVERY_MS || "15000", 10);

class BmsService extends EventEmitter {
  private started = false;
  private lastSnapshot: BmsSnapshot | null = null;
  private deviceInfo: BleUartConnection["deviceInfo"] | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private persistTimer: NodeJS.Timeout | null = null;
  private stopping = false;

  getLastSnapshot() {
    return this.lastSnapshot;
  }
  getDeviceInfo() {
    return this.deviceInfo;
  }

  async ensureStarted() {
    if (this.started) return;
    this.started = true;

    const ctx = await connectBleUart({
      addr: TARGET_ADDR,
      namePart: TARGET_NAME,
    });
    this.deviceInfo = ctx.deviceInfo;
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

    ctx.onData((buf) => parser.push(buf));

    const frames = defaultPollSet();

    const sendPoll = async () => {
      for (const frame of frames) {
        try {
          await ctx.write(frame);
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
            message: e instanceof Error ? e.message : (e as unknown as string),
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
            await Model.create({ ts: new Date(), snapshot: this.lastSnapshot });
          }
        } catch {
          // ignore persistence errors, keep running
        }
      };
      await persistOnce();
      this.persistTimer = setInterval(persistOnce, SAMPLE_EVERY_MS);
    }

    ctx.onDisconnect(() => {
      if (this.stopping) return;
      if (this.pollTimer) clearInterval(this.pollTimer);
      if (this.persistTimer) clearInterval(this.persistTimer);
      this.started = false;
    });

    process.on("SIGINT", async () => {
      try {
        this.stopping = true;
        if (this.pollTimer) clearInterval(this.pollTimer);
        if (this.persistTimer) clearInterval(this.persistTimer);
        await ctx.disconnect();
      } catch {}
      process.exit(0);
    });
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
