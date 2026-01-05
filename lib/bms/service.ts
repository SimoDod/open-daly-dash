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

export type BmsEvent = BmsEventPayload & { ts: string; bmsId: 1 | 2 };

const POLL_MS = parseInt(process.env.POLL_MS || "10000", 10); // Increased to 10s to reduce bursts
const SAMPLE_EVERY_MS = parseInt(process.env.SAMPLE_EVERY_MS || "15000", 10);
const RX_TIMEOUT_MS = parseInt(process.env.RX_TIMEOUT_MS || "60000", 10); // 60s
const CONNECT_TIMEOUT_MS = parseInt(
  process.env.CONNECT_TIMEOUT_MS || "60000",
  10
); // Increased to 60s

const RATED_AH1 = Number(process.env.RATED_AH1);
const TARGET_ADDR1 = (process.env.ADDR1 || "").toLowerCase();
const TARGET_NAME1 = (process.env.NAME1 || "").toLowerCase();

const RATED_AH2 = Number(process.env.RATED_AH2);
const TARGET_ADDR2 = (process.env.ADDR2 || "").toLowerCase();
const TARGET_NAME2 = (process.env.NAME2 || "").toLowerCase();

type BmsContext = {
  id: 1 | 2;
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

  private ctx1: BmsContext;
  private ctx2: BmsContext;

  constructor() {
    super();

    this.ctx1 = this.createContext(1, RATED_AH1);
    this.ctx2 = this.createContext(2, RATED_AH2);
  }

  private createContext(id: 1 | 2, ratedAh: number): BmsContext {
    const state = new DalyState({
      ratedAh: Number.isFinite(ratedAh) ? ratedAh : undefined,
    });

    const parser = new DalyParser(
      () => {},
      (decoded) => {
        state.update(decoded as any);
        const snapshot = state.snapshot();

        const ctx = this.getContext(id);
        if (!ctx.ready) {
          ctx.ready = true;
          this.emitEvent(id, { event: "ready" });
        }

        this.emitEvent(id, { event: "decoded", data: decoded });
        this.emitEvent(id, { event: "state", snapshot });
      }
    );

    return {
      id,
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

  private getContext(id: 1 | 2): BmsContext {
    return id === 1 ? this.ctx1 : this.ctx2;
  }

  private emitEvent(bmsId: 1 | 2, payload: BmsEventPayload) {
    this.emit("evt", {
      ts: new Date().toISOString(),
      bmsId,
      ...payload,
    });
  }

  getLastSnapshot(id: 1 | 2): BmsSnapshot | null {
    const snapshot = this.getContext(id).state.snapshot();
    return Object.keys(snapshot).length > 0 ? snapshot : null;
  }

  getDeviceInfo(id: 1 | 2) {
    return this.getContext(id).connection?.deviceInfo ?? null;
  }

  getIsConnected(id: 1 | 2) {
    return this.getContext(id).connection !== null;
  }

  getIsReady(id: 1 | 2) {
    return this.getContext(id).ready;
  }

  getStatus() {
    return {
      ts: new Date().toISOString(),
      bms: {
        1: {
          connected: this.getIsConnected(1),
          ready: this.getIsReady(1),
          device: this.getDeviceInfo(1),
          snapshot: this.getLastSnapshot(1),
        },
        2: {
          connected: this.getIsConnected(2),
          ready: this.getIsReady(2),
          device: this.getDeviceInfo(2),
          snapshot: this.getLastSnapshot(2),
        },
      },
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
      this.emitEvent(1, { event: "connecting" });
      this.emitEvent(2, { event: "connecting" });

      let connectedAny = false;

      const conn1 = await this.connectOne(1);
      if (conn1) {
        await this.setupContext(this.ctx1, conn1);
        connectedAny = true;
      }

      const conn2 = await this.connectOne(2);
      if (conn2) {
        await this.setupContext(this.ctx2, conn2);
        connectedAny = true;
      }

      if (connectedAny) backoffMs = 1000;

      if (this.getIsConnected(1) || this.getIsConnected(2)) {
        await new Promise<void>((resolve) => {
          const check = () => {
            if (!this.getIsConnected(1) && !this.getIsConnected(2)) {
              this.off("evt", handler);
              resolve();
            }
          };
          const handler = (evt: BmsEvent) =>
            evt.event === "disconnected" && check();
          this.on("evt", handler);
          check();
          setTimeout(() => {
            this.off("evt", handler);
            resolve();
          }, 60000);
        });
      }

      if (!connectedAny) {
        this.cleanupContext(this.ctx1);
        this.cleanupContext(this.ctx2);
      }

      if (this.stopping) break;

      await new Promise((r) => setTimeout(r, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 30000);
    }
  }

  private async connectOne(id: 1 | 2): Promise<BleUartConnection | null> {
    const addr = id === 1 ? TARGET_ADDR1 : TARGET_ADDR2;
    const namePart = id === 1 ? TARGET_NAME1 : TARGET_NAME2;

    if (!addr && !namePart) {
      this.emitEvent(id, {
        event: "disconnected",
        reason: "No ADDR or NAME configured",
      });
      return null;
    }

    // Retry loop for timeouts
    let retryDelay = 2000;
    while (!this.stopping) {
      try {
        const conn = await this.withTimeout(
          connectBleUart(addr || undefined, namePart || undefined),
          CONNECT_TIMEOUT_MS,
          `BLE connect timeout for BMS ${id}`
        );
        this.emitEvent(id, { event: "connected", device: conn.deviceInfo });
        return conn;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes("BLE connect timeout")) {
          // Silent retry
          await new Promise((r) => setTimeout(r, retryDelay));
          retryDelay = Math.min(retryDelay * 1.5, 15000); // gentle backoff
          continue;
        }

        this.emitEvent(id, { event: "disconnected", reason: message });
        return null;
      }
    }
    return null;
  }

  private async setupContext(ctx: BmsContext, conn: BleUartConnection) {
    ctx.connection = conn;
    ctx.lastRx = Date.now();

    conn.onData((buf) => {
      ctx.lastRx = Date.now();
      ctx.parser.push(buf);
    });

    conn.onDisconnect(() => {
      console.log(`BMS ${ctx.id}: connection lost`);
      this.emitEvent(ctx.id, {
        event: "disconnected",
        reason: "Connection lost",
      });
      this.cleanupContext(ctx);

      if (!this.stopping) {
        const retryDelay = 2000 + Math.random() * 2000; // jitter 2-4s
        setTimeout(async () => {
          if (this.stopping) return;
          const newConn = await this.connectOne(ctx.id);
          if (newConn) await this.setupContext(ctx, newConn);
        }, retryDelay);
      }
    });

    const frames = defaultPollSet();
    const sendPoll = async () => {
      for (const frame of frames) {
        try {
          await conn.write(frame);
          this.emitEvent(ctx.id, { event: "tx", hex: frame.toString("hex") });
          await new Promise((r) => setTimeout(r, 300)); // Increased delay to reduce burst
        } catch (e) {
          this.emitEvent(ctx.id, {
            event: "tx_error",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    };

    await sendPoll();
    ctx.pollTimer = setInterval(sendPoll, POLL_MS);

    ctx.rxWatchTimer = setInterval(() => {
      const idle = Date.now() - ctx.lastRx;
      if (idle >= RX_TIMEOUT_MS) {
        this.emitEvent(ctx.id, { event: "no_data", for_ms: idle });
        ctx.lastRx = Date.now(); // reset to avoid spam
      }
    }, Math.max(1000, Math.floor(RX_TIMEOUT_MS / 3)));

    if (Number.isFinite(SAMPLE_EVERY_MS) && SAMPLE_EVERY_MS > 0) {
      const persistOnce = async () => {
        try {
          const snapshot = ctx.state.snapshot();
          if (snapshot && Object.keys(snapshot).length > 0) {
            const Model = await getBmsSampleModel();
            await Model.create({
              ts: new Date(),
              bmsId: ctx.id,
              snapshot,
            });
          }
        } catch {
          // ignore
        }
      };

      await persistOnce();
      ctx.persistTimer = setInterval(persistOnce, SAMPLE_EVERY_MS);
    }
  }

  private cleanupContext(ctx: BmsContext) {
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

  stop() {
    this.stopping = true;
    this.cleanupContext(this.ctx1);
    this.cleanupContext(this.ctx2);
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
