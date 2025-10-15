/* Daly Smart BMS UART protocol over BLE UART bridges. */

const START = 0xa5;

function be16(bh: number, bl: number) {
  return ((bh & 0xff) << 8) | (bl & 0xff);
}
function s16(u16: number) {
  return u16 >= 0x8000 ? u16 - 0x10000 : u16;
}

const CURRENT_SIGN = (process.env.CURRENT_SIGN || "normal").toLowerCase(); // normal | invert
function applySign(v: number) {
  return CURRENT_SIGN === "invert" ? -v : v;
}

export function buildRequest(cmd: number) {
  const buf = Buffer.alloc(13, 0x00);
  buf[0] = START;
  buf[1] = 0x40;
  buf[2] = cmd & 0xff;
  buf[3] = 0x08;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum = (sum + buf[i]) & 0xff;
  buf[12] = sum;
  return buf;
}

/* ----------------- Decoded union ----------------- */
export type Decoded =
  | {
      type: "basic";
      cmd: number;
      voltage_V: number;
      current_A: number;
      capacityField_Ah_candidates: { by0p01: number; by0p1: number };
      soc_pct: number;
      raw: string;
    }
  | {
      type: "cell_stats";
      cmd: number;
      max_mV: number;
      max_V: number;
      max_idx: number;
      min_mV: number;
      min_V: number;
      min_idx: number;
      delta_mV: number;
      delta_V: number;
      raw: string;
    }
  | {
      type: "counts";
      cmd: number;
      cellCount: number;
      ntcCount: number;
      raw: string;
    }
  | { type: "temps"; cmd: number; temps_C: number[]; raw: string }
  | {
      type: "cells";
      cmd: number;
      page: number;
      cells_mV: number[];
      cells_V: number[];
      raw: string;
    }
  | {
      type: "status_0x93";
      cmd: number;
      state: number;
      chargeMos: number;
      dischargeMos: number;
      raw: string;
    }
  | {
      type: "balance_flags";
      cmd: number;
      mask?: number | null;
      perCell?: boolean[] | null;
      raw: string;
    };

/* ----------------- Frame type ----------------- */
export type Frame = { src: number; cmd: number; len: number; data: Buffer };

/* ----------------- Balancing detector ----------------- */

/*
  Deterministic BalancingDetector:
  - preferred source: explicit flags (mask / perCell) via settings/status (not implemented here)
  - fallback: trend-based detection using cell page samples
  - suppress trend-detection when absolute pack current > currentSuppressThreshold_A
*/
type BalancingReport = {
  balancing: boolean;
  activeCells: number[]; // 0-based indices
  reason: "flags" | "trend";
  timestamp: number;
};

class BalancingDetector {
  private history: Map<number, number[]> = new Map(); // idx -> recent mV samples
  private maxSamples: number;
  private dropThreshold_mV: number;
  private topK: number;
  private minSamplesToDecide: number;
  private current_A: number = 0;
  private currentSuppressThreshold_A: number;

  constructor(opts?: {
    maxSamples?: number;
    dropThreshold_mV?: number;
    topK?: number;
    minSamplesToDecide?: number;
    currentSuppressThreshold_A?: number;
  }) {
    this.maxSamples = opts?.maxSamples ?? 6;
    this.dropThreshold_mV = opts?.dropThreshold_mV ?? 3;
    this.topK = opts?.topK ?? 3;
    this.minSamplesToDecide = opts?.minSamplesToDecide ?? 3;
    this.currentSuppressThreshold_A = opts?.currentSuppressThreshold_A ?? 1; // suppress trend when |I| > 1A
  }

  setCurrent(current_A: number) {
    this.current_A = current_A;
  }

  // Preferred path when device supplies explicit flags
  detectFromFlags(mask?: number, perCell?: boolean[]): BalancingReport {
    const activeCells: number[] = [];
    if (Array.isArray(perCell) && perCell.length) {
      perCell.forEach((v, i) => {
        if (v) activeCells.push(i);
      });
    } else if (typeof mask === "number") {
      for (let i = 0; i < 32; i++) {
        if (mask & (1 << i)) activeCells.push(i);
      }
    }
    return {
      balancing: activeCells.length > 0,
      activeCells,
      reason: "flags",
      timestamp: Date.now(),
    };
  }

  // Feed a page of cells (page index, contiguous cells in that page)
  feedCellPage(page: number, cells_mV: number[]): BalancingReport | null {
    // Suppress trend-based detection when pack current is large
    if (Math.abs(this.current_A) > this.currentSuppressThreshold_A) return null;

    // Map page offset. Daly page sizing varies; assume 1 page = cells_mV.length
    const pageBase = page * cells_mV.length;
    for (let i = 0; i < cells_mV.length; i++) {
      const idx = pageBase + i;
      const arr = this.history.get(idx) ?? [];
      arr.push(cells_mV[i]);
      if (arr.length > this.maxSamples) arr.shift();
      this.history.set(idx, arr);
    }

    // Require enough cells with enough samples
    const deltas: { idx: number; delta: number; latest: number }[] = [];
    for (const [idx, samples] of this.history.entries()) {
      if (samples.length < this.minSamplesToDecide) continue;
      const latest = samples[samples.length - 1];
      const earliest = samples[0];
      deltas.push({ idx, delta: latest - earliest, latest });
    }

    if (deltas.length === 0) return null;

    // Take topK highest latest voltages as candidate balancing targets
    deltas.sort((a, b) => b.latest - a.latest);
    const top = deltas.slice(0, Math.min(this.topK, deltas.length));

    // Identify cells among top whose delta indicates a drop (balancing bleed)
    const balancingCells = top
      .filter((t) => t.delta <= -Math.abs(this.dropThreshold_mV))
      .map((t) => t.idx);

    const balancing = balancingCells.length >= Math.ceil(top.length / 2);

    return {
      balancing,
      activeCells: balancing ? balancingCells : [],
      reason: "trend",
      timestamp: Date.now(),
    };
  }

  // Clear history (call on reconnect/resync)
  reset() {
    this.history.clear();
  }
}

/* ----------------- DalyParser ----------------- */

export class DalyParser {
  private buf: Buffer = Buffer.alloc(0);
  private detector = new BalancingDetector();
  constructor(
    private onFrame: (f: Frame) => void,
    private onDecoded: (d: Decoded) => void
  ) {}

  push(chunk: Buffer) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 5) {
      const si = this.buf.indexOf(START);
      if (si < 0) {
        this.buf = Buffer.alloc(0);
        return;
      }
      if (si > 0) {
        this.buf = this.buf.slice(si);
        if (this.buf.length < 5) return;
      }
      const cmd = this.buf[2],
        len = this.buf[3],
        total = 4 + len + 1;
      if (this.buf.length < total) return;
      const frame = this.buf.slice(0, total);
      let sum = 0;
      for (let i = 0; i < total - 1; i++) sum = (sum + frame[i]) & 0xff;
      if (sum !== frame[total - 1]) {
        this.buf = this.buf.slice(1);
        continue;
      }
      const out: Frame = {
        src: this.buf[1],
        cmd,
        len,
        data: Buffer.from(this.buf.slice(4, 4 + len)),
      };
      try {
        this.onFrame(out);
      } catch {}

      try {
        const d = decodeDaly(out);
        if (d) {
          // propagate decoded frame
          this.onDecoded(d);

          // update detector with basic current frames
          if (d.type === "basic") {
            this.detector.setCurrent(d.current_A);
          }

          // feed cells into detector and emit balance_flags when available
          if (d.type === "cells") {
            const rep = this.detector.feedCellPage(d.page, d.cells_mV);
            if (rep) {
              const perCell: boolean[] = [];
              for (const idx of rep.activeCells) perCell[idx] = true;
              // normalize array: fill undefined -> false for contiguous indices
              const maxIdx = rep.activeCells.length
                ? Math.max(...rep.activeCells)
                : -1;
              if (maxIdx >= 0) {
                for (let i = 0; i <= maxIdx; i++)
                  if (!perCell[i]) perCell[i] = false;
              }
              // emit as Decoded balance_flags
              this.onDecoded({
                type: "balance_flags",
                cmd: 0xff, // synthetic cmd for detector-originated event
                mask: undefined,
                perCell: perCell.length ? perCell : null,
                raw: JSON.stringify({
                  reason: rep.reason,
                  timestamp: rep.timestamp,
                  activeCells: rep.activeCells,
                }),
              });
            }
          }
        }
      } catch {}

      this.buf = this.buf.slice(total);
    }
  }
}

/* ----------------- Decoding ----------------- */

function decodeCurrentSmart(iRaw: number) {
  if (iRaw === 0x0000 || iRaw === 0xffff) return 0;

  const c_offset = (iRaw - 30000) / 10; // Daly app rule
  const c_direct = iRaw / 10; // 0.1 A
  const c_signed = s16(iRaw) / 10; // 0.1 A signed

  const cands: number[] = [];
  if (iRaw >= 20000 && iRaw <= 40000) cands.push(c_offset);
  if (iRaw <= 5000) {
    cands.push(c_direct, c_signed);
  }
  cands.push(c_offset, c_direct, c_signed);

  const plausible = cands.filter(
    (v) => Number.isFinite(v) && Math.abs(v) <= 500
  );
  if (!plausible.length) return 0;

  let best = plausible[0];
  for (const v of plausible) if (Math.abs(v) < Math.abs(best)) best = v;

  return Number(applySign(Number(best.toFixed(2))));
}

function decodeDaly(frame: Frame): Decoded | null {
  const { cmd, data } = frame;

  if (cmd === 0x90 && data.length >= 8) {
    const vRaw = be16(data[0], data[1]);
    const capRaw = be16(data[2], data[3]);
    const iRaw = be16(data[4], data[5]);
    const soc0p1 = be16(data[6], data[7]);

    const voltage_V = Number((vRaw / 10).toFixed(2));
    const current_A = decodeCurrentSmart(iRaw);

    const capacityField_Ah_candidates = {
      by0p01: capRaw / 100,
      by0p1: capRaw / 10,
    };

    return {
      type: "basic",
      cmd,
      voltage_V,
      current_A,
      capacityField_Ah_candidates,
      soc_pct: Math.max(0, Math.min(100, soc0p1 / 10)),
      raw: data.toString("hex"),
    };
  }

  if (cmd === 0x91 && data.length >= 8) {
    const max_mV = be16(data[0], data[1]);
    const max_idx = data[2];
    const min_mV = be16(data[3], data[4]);
    const min_idx = data[5];
    const delta_mV = be16(data[6], data[7]);

    const ok = (v: number) => v >= 1500 && v <= 5000;
    if (ok(min_mV) && ok(max_mV) && delta_mV >= 0 && delta_mV <= 1000) {
      return {
        type: "cell_stats",
        cmd,
        max_mV,
        max_V: Number((max_mV / 1000).toFixed(3)),
        max_idx,
        min_mV,
        min_V: Number((min_mV / 1000).toFixed(3)),
        min_idx,
        delta_mV,
        delta_V: Number((delta_mV / 1000).toFixed(3)),
        raw: data.toString("hex"),
      };
    }
  }

  if (cmd === 0x93 && data.length >= 4) {
    const state = data[0];
    const chargeMos = data[1];
    const dischargeMos = data[2];

    return {
      type: "status_0x93",
      cmd,
      state,
      chargeMos,
      dischargeMos,

      raw: data.toString("hex"),
    };
  }

  if (cmd === 0x94 && data.length >= 2) {
    const cells = data[0],
      ntc = data[1];
    if (cells >= 1 && cells <= 32)
      return {
        type: "counts",
        cmd,
        cellCount: cells,
        ntcCount: ntc,
        raw: data.toString("hex"),
      };
  }

  if ((cmd === 0x96 || cmd === 0x92) && data.length >= 2) {
    // some variants use 0x96, others 0x92
    const temps_C: number[] = [];
    for (let i = 1; i < data.length; i++) {
      const b = data[i];
      if (b === 0xff || b === 0x00) continue;
      const tC = b - 40;
      if (tC > -50 && tC < 120) temps_C.push(Number(tC.toFixed(1)));
    }
    return { type: "temps", cmd, temps_C, raw: data.toString("hex") };
  }

  if (cmd === 0x95 && data.length >= 3) {
    const page = data[0];
    const cells_mV: number[] = [];
    for (let i = 1; i + 1 < data.length; i += 2) {
      const hi = data[i],
        lo = data[i + 1];
      if ((hi === 0x00 && lo === 0x00) || (hi === 0xff && lo === 0xff))
        continue;
      const mv = be16(hi, lo);
      if (mv >= 1500 && mv <= 5000) cells_mV.push(mv);
    }
    return {
      type: "cells",
      cmd,
      page,
      cells_mV,
      cells_V: cells_mV.map((v) => Number((v / 1000).toFixed(3))),
      raw: data.toString("hex"),
    };
  }

  return null;
}

export function defaultPollSet() {
  return [0x90, 0x91, 0x93, 0x94, 0x96, 0x95].map(buildRequest);
}
