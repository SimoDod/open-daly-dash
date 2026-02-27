/* eslint-disable @typescript-eslint/no-explicit-any */
// cspell:words Uart

import { EventEmitter } from "events";
import { connectBleUart } from "./bleUart";
import type { BleUartConnection } from "./bleUart";
import { DalyParser, defaultPollSet } from "./daly";
import { DalyState } from "./state";
import { getBmsSampleModel } from "../db/mongoose";

export type BmsSnapshot = ReturnType<DalyState["snapshot"]>;

type BmsEventPayload =
  | { event: "connecting" }
  | { event: "connected"; device: BleUartConnection["deviceInfo"] }
  | { event: "ready" }
  | { event: "no_data"; for_ms: number }
  | { event: "disconnected"; reason?: string }
  | { event: "state"; snapshot: BmsSnapshot }
  | { event: "tx"; hex: string }
  | { event: "tx_error"; message: string }
  | { event: "decoded"; data: import("./daly").Decoded };

export type BmsEvent = BmsEventPayload & { ts: string };

const POLL_MS = parseInt(process.env.POLL_MS || "10000", 10);
const SAMPLE_EVERY_MS = parseInt(process.env.SAMPLE_EVERY_MS || "15000", 10);
const RX_TIMEOUT_MS = parseInt(process.env.RX_TIMEOUT_MS || "60000", 10);
const CONNECT_TIMEOUT_MS = parseInt(
  process.env.CONNECT_TIMEOUT_MS || "60000",
  10,
);

const RATED_AH = Number(process.env.RATED_AH);
const TARGET_ADDR = (process.env.ADDR || "").toLowerCase();
const TARGET_NAME = (process.env.NAME || "").toLowerCase();

type BmsContext = {
  connection: BleUartConnection | null;
  state: DalyState;
  parser: DalyParser;
  lastRx: number;
  pollTimer: NodeJS.Timeout | null;
  rxWatchTimer: NodeJS.Timeout | null;
  persistTimer: NodeJS.Timeout | null;
  ready: boolean;
};

class BmsService extends EventEmitter {
  private started = false;
  private stopping = false;
  private ctx: BmsContext;

  constructor() {
    super();
    this.ctx = this.createContext();
  }

  private createContext(): BmsContext {
    const state = new DalyState({
      ratedAh: Number.isFinite(RATED_AH) ? RATED_AH : undefined,
    });

    const parser = new DalyParser(
      () => {},
      (decoded) => {
        state.update(decoded as any);

        if (typeof state.soc_pct === "number" && state.soc_pct !== 0) {
          const LOW_SOC = Number(
            process.env.SOC_PERCENTAGE_NOTIFICATION_TRIGGER,
          );
          if (state.soc_pct < LOW_SOC && !state._lowSocNotified) {
            fetch(process.env.PUSH_NOTIFICATION_URL!, { method: "GET" }).catch(
              () => {},
            );
            state._lowSocNotified = true;
          }
          if (state.soc_pct >= LOW_SOC) {
            state._lowSocNotified = false;
          }
        }

        const snapshot = state.snapshot();

        if (!this.ctx.ready) {
          this.ctx.ready = true;
          this.emitEvent({ event: "ready" });
        }

        this.emitEvent({ event: "decoded", data: decoded });
        this.emitEvent({ event: "state", snapshot });
      },
    );

    return {
      connection: null,
      state,
      parser,
      lastRx: 0,
      pollTimer: null,
      rxWatchTimer: null,
      persistTimer: null,
      ready: false,
    };
  }

  private emitEvent(payload: BmsEventPayload) {
    this.emit("evt", {
      ts: new Date().toISOString(),
      ...payload,
    });
  }

  getLastSnapshot(): BmsSnapshot | null {
    const snapshot = this.ctx.state.snapshot();
    return Object.keys(snapshot).length > 0 ? snapshot : null;
  }

  getDeviceInfo() {
    return this.ctx.connection?.deviceInfo ?? null;
  }

  getIsConnected() {
    return this.ctx.connection !== null;
  }

  getIsReady() {
    return this.ctx.ready;
  }

  getStatus() {
    return {
      ts: new Date().toISOString(),
      connected: this.getIsConnected(),
      ready: this.getIsReady(),
      device: this.getDeviceInfo(),
      snapshot: this.getLastSnapshot(),
    };
  }

  async ensureStarted() {
    if (this.started) return;
    this.started = true;
    void this.runLoop();
  }

  private async runLoop() {
    let backoffMs = 1000;

    while (!this.stopping) {
      this.emitEvent({ event: "connecting" });

      const conn = await this.connect();
      if (conn) {
        await this.setupContext(conn);
        backoffMs = 1000;

        await new Promise<void>((resolve) => {
          const handler = (evt: BmsEvent) => {
            if (evt.event === "disconnected") {
              this.off("evt", handler);
              resolve();
            }
          };
          this.on("evt", handler);
        });
      }

      if (this.stopping) break;

      await new Promise((r) => setTimeout(r, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 30000);
    }
  }

  private async connect(): Promise<BleUartConnection | null> {
    if (!TARGET_ADDR && !TARGET_NAME) {
      this.emitEvent({
        event: "disconnected",
        reason: "No ADDR or NAME configured",
      });
      return null;
    }

    let retryDelay = 2000;

    while (!this.stopping) {
      try {
        const conn = await this.withTimeout(
          connectBleUart(TARGET_ADDR || undefined, TARGET_NAME || undefined),
          CONNECT_TIMEOUT_MS,
          "BLE connect timeout",
        );
        this.emitEvent({ event: "connected", device: conn.deviceInfo });
        return conn;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes("BLE connect timeout")) {
          await new Promise((r) => setTimeout(r, retryDelay));
          retryDelay = Math.min(retryDelay * 1.5, 15000);
          continue;
        }

        this.emitEvent({ event: "disconnected", reason: message });
        return null;
      }
    }
    return null;
  }

  private async setupContext(conn: BleUartConnection) {
    const ctx = this.ctx;

    ctx.connection = conn;
    ctx.lastRx = Date.now();

    conn.onData((buf) => {
      ctx.lastRx = Date.now();
      ctx.parser.push(buf);
    });

    conn.onDisconnect(() => {
      this.emitEvent({
        event: "disconnected",
        reason: "Connection lost",
      });
      this.cleanupContext();
    });

    const frames = defaultPollSet();
    const sendPoll = async () => {
      for (const frame of frames) {
        try {
          await conn.write(frame);
          this.emitEvent({ event: "tx", hex: frame.toString("hex") });
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          this.emitEvent({
            event: "tx_error",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    };

    await sendPoll();
    ctx.pollTimer = setInterval(sendPoll, POLL_MS);

    ctx.rxWatchTimer = setInterval(
      () => {
        const idle = Date.now() - ctx.lastRx;
        if (idle >= RX_TIMEOUT_MS) {
          this.emitEvent({ event: "no_data", for_ms: idle });
          ctx.lastRx = Date.now();
        }
      },
      Math.max(1000, Math.floor(RX_TIMEOUT_MS / 3)),
    );

    if (Number.isFinite(SAMPLE_EVERY_MS) && SAMPLE_EVERY_MS > 0) {
      const persistOnce = async () => {
        try {
          const snapshot = ctx.state.snapshot();
          if (snapshot && Object.keys(snapshot).length > 0) {
            const Model = await getBmsSampleModel();
            await Model.create({
              ts: new Date(),
              snapshot,
            });
          }
        } catch {}
      };

      await persistOnce();
      ctx.persistTimer = setInterval(persistOnce, SAMPLE_EVERY_MS);
    }
  }

  private cleanupContext() {
    const ctx = this.ctx;

    if (ctx.pollTimer) clearInterval(ctx.pollTimer);
    if (ctx.rxWatchTimer) clearInterval(ctx.rxWatchTimer);
    if (ctx.persistTimer) clearInterval(ctx.persistTimer);

    ctx.pollTimer = ctx.rxWatchTimer = ctx.persistTimer = null;

    if (ctx.connection) {
      ctx.connection.disconnect().catch(() => {});
      ctx.connection = null;
      ctx.ready = false;
    }
  }

  private async withTimeout<T>(
    p: Promise<T>,
    ms: number,
    msg: string,
  ): Promise<T> {
    let to: NodeJS.Timeout;
    return await Promise.race<T>([
      p.finally(() => clearTimeout(to)),
      new Promise<T>((_, rej) => {
        to = setTimeout(() => rej(new Error(msg)), ms);
      }),
    ]);
  }

  stop() {
    this.stopping = true;
    this.cleanupContext();
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
