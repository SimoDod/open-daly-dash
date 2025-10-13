export type Snapshot = {
  voltage_V?: number;
  current_A?: number;
  soc_pct?: number;
  temps_C?: number[];
  packFromCells_V?: number;
  cellMin_V?: number;
  cellMax_V?: number;
  ratedCapacity_Ah?: number;
  remainCapacity_Ah?: number;
  system_state?: number | string;
};

export type DeviceInfo = {
  address: string;
  id: string;
  name: string;
  flavor: string;
};

export type Point = { ts: string; v?: number; i?: number; soc?: number };

export type RangeKey = "1h" | "6h" | "24h" | "1w" | "1m";
