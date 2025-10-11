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
    };

export type Frame = { src: number; cmd: number; len: number; data: Buffer };

export class DalyParser {
  private buf: Buffer = Buffer.alloc(0);
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
        if (d) this.onDecoded(d);
      } catch {}

      this.buf = this.buf.slice(total);
    }
  }
}

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

  if (cmd === 0x96 && data.length >= 2) {
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
  return [0x90, 0x91, 0x94, 0x96, 0x95].map(buildRequest);
}
