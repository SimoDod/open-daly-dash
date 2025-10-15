// state.ts - DalyState with status_0x93, balance_flags, and MOS fields

type CapacityCandidates = { by0p01?: number; by0p1?: number };

export class DalyState {
  ratedAhCfg?: number;
  cellCount?: number;
  voltage_V?: number;
  current_A?: number; // direct from BMS (0x90)
  currentSource: "direct" | "none" = "none";
  soc_pct?: number;
  ratedCapacity_Ah?: number;
  remainCapacity_Ah?: number;
  temps_C: number[] = [];
  cellPages = new Map<number, number[]>();
  cells_mV: number[] = [];
  cellMin_mV?: number;
  cellMax_mV?: number;
  cellDelta_mV?: number;
  cellMin_V?: number;
  cellMax_V?: number;
  cellDelta_V?: number;

  balancingActive: boolean = false;
  balancingCells: number[] = [];

  // MOS / charge-discharge
  chargeMos?: number | null; // raw byte(s) from 0x93
  dischargeMos?: number | null; // raw byte(s) from 0x93
  charging: boolean = false; // derived
  discharging: boolean = false; // derived

  constructor(opts: { ratedAh?: number } = {}) {
    this.ratedAhCfg = Number.isFinite(opts.ratedAh)
      ? Number(opts.ratedAh)
      : undefined;
    this.ratedCapacity_Ah = this.ratedAhCfg;
  }

  static pickCapacityCandidate(cand?: CapacityCandidates) {
    const c1 = cand?.by0p01,
      c2 = cand?.by0p1;
    const ok = (v?: number) =>
      Number.isFinite(v) && (v as number) >= 5 && (v as number) <= 1000;
    const pos = [c1, c2].filter(ok) as number[];
    if (!pos.length) return undefined;
    let best = pos[0];
    for (const v of pos) {
      const fBest = Math.abs(Math.round(best) - best);
      const f = Math.abs(Math.round(v) - v);
      if (f < fBest) best = v;
    }
    return best;
  }

  update(decoded: import("./daly").Decoded) {
    if (!decoded) return;

    if (decoded.type === "counts") {
      this.cellCount = decoded.cellCount;
    }

    if (decoded.type === "basic") {
      this.voltage_V = decoded.voltage_V;

      if (Number.isFinite(decoded.current_A)) {
        this.current_A = decoded.current_A;
        this.currentSource = "direct";
      } else {
        this.current_A = undefined;
        this.currentSource = "none";
      }

      if (Number.isFinite(decoded.soc_pct))
        this.soc_pct = Math.max(0, Math.min(100, decoded.soc_pct ?? 0));

      if (!this.ratedCapacity_Ah) {
        const pick = DalyState.pickCapacityCandidate(
          decoded.capacityField_Ah_candidates
        );
        if (Number.isFinite(pick))
          this.ratedCapacity_Ah = Number((pick as number).toFixed(2));
      }

      if (this.ratedCapacity_Ah && Number.isFinite(this.soc_pct)) {
        this.remainCapacity_Ah = Number(
          (this.ratedCapacity_Ah * ((this.soc_pct as number) / 100)).toFixed(2)
        );
      }
    }

    if (decoded.type === "cell_stats") {
      this.cellMax_mV = decoded.max_mV;
      this.cellMax_V = decoded.max_V;
      this.cellMin_mV = decoded.min_mV;
      this.cellMin_V = decoded.min_V;
      this.cellDelta_mV = decoded.delta_mV;
      this.cellDelta_V = decoded.delta_V;
    }

    if (decoded.type === "temps" && Array.isArray(decoded.temps_C))
      this.temps_C = decoded.temps_C;

    if (decoded.type === "cells") {
      if (typeof decoded.page === "number" && Array.isArray(decoded.cells_mV)) {
        this.cellPages.set(decoded.page, decoded.cells_mV.slice());
      }
      const pages = [...this.cellPages.keys()].sort((a, b) => a - b);
      const flat: number[] = [];
      for (const p of pages)
        for (const mv of this.cellPages.get(p) || []) flat.push(mv);
      this.cells_mV =
        typeof this.cellCount === "number"
          ? flat.slice(0, this.cellCount)
          : flat;

      if (this.cells_mV.length) {
        const min = Math.min(...this.cells_mV),
          max = Math.max(...this.cells_mV);
        this.cellMin_mV = min;
        this.cellMax_mV = max;
        this.cellDelta_mV = max - min;
        this.cellMin_V = Number((min / 1000).toFixed(3));
        this.cellMax_V = Number((max / 1000).toFixed(3));
        this.cellDelta_V = Number(((max - min) / 1000).toFixed(3));
      }
    }

    // status_0x93 handler (cycles + remaining mAh + MOS bytes)
    if (decoded.type === "status_0x93") {
      // store raw MOS bytes
      this.chargeMos = Number.isFinite(decoded.chargeMos as number)
        ? (decoded.chargeMos as number)
        : null;
      this.dischargeMos = Number.isFinite(decoded.dischargeMos as number)
        ? (decoded.dischargeMos as number)
        : null;

      this.charging = !!this.chargeMos && (this.chargeMos as number) !== 0;
      this.discharging =
        !!this.dischargeMos && (this.dischargeMos as number) !== 0;
    }

    // balance_flags handler (from detector or device)
    if (decoded.type === "balance_flags") {
      const activeCells: number[] = [];
      if (Array.isArray(decoded.perCell) && decoded.perCell.length) {
        for (let i = 0; i < decoded.perCell.length; i++) {
          if (decoded.perCell[i]) activeCells.push(i);
        }
      } else if (typeof decoded.mask === "number") {
        for (let i = 0; i < 32; i++) {
          if (decoded.mask & (1 << i)) activeCells.push(i);
        }
      }
      this.balancingActive = activeCells.length > 0;
      this.balancingCells = activeCells;
    }
  }

  snapshot() {
    const cells_mV = this.cells_mV;
    const cells_V = cells_mV.map((v) => Number((v / 1000).toFixed(3)));
    const packFromCells_V = cells_V.length
      ? Number(cells_V.reduce((a, b) => a + b, 0).toFixed(2))
      : undefined;
    let soc = this.soc_pct;
    if (Number.isFinite(soc)) soc = Number((soc as number).toFixed(1));

    return {
      voltage_V: this.voltage_V,
      current_A: this.current_A,
      currentSource: this.currentSource,
      ratedCapacity_Ah: this.ratedCapacity_Ah,
      remainCapacity_Ah: this.remainCapacity_Ah,
      soc_pct: soc,
      temps_C: this.temps_C,
      cells_mV,
      cells_V,
      packFromCells_V,
      cellMin_mV: this.cellMin_mV,
      cellMax_mV: this.cellMax_mV,
      cellDelta_mV: this.cellDelta_mV,
      cellMin_V: this.cellMin_V,
      cellMax_V: this.cellMax_V,
      cellDelta_V: this.cellDelta_V,
      chargeMos: this.chargeMos ?? null,
      dischargeMos: this.dischargeMos ?? null,
      charging: this.charging,
      discharging: this.discharging,
      balancingActive: this.balancingActive,
      balancingCells: this.balancingCells.slice(),
    };
  }
}
