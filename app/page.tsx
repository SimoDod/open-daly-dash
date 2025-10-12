/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  PlugZap,
  Pause,
  Play,
  Trash2,
  History,
  Zap,
  Plug,
  Battery as BatteryIcon,
} from "lucide-react";
import dynamic from "next/dynamic";

const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), {
  ssr: false,
});
const Line = dynamic(() => import("recharts").then((m) => m.Line), {
  ssr: false,
});
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), {
  ssr: false,
});
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), {
  ssr: false,
});
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), {
  ssr: false,
});
const CartesianGrid = dynamic(
  () => import("recharts").then((m) => m.CartesianGrid),
  { ssr: false }
);
const Legend = dynamic(() => import("recharts").then((m) => m.Legend as any), {
  ssr: false,
});
const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false }
);

type Snapshot = {
  voltage_V?: number;
  current_A?: number;
  soc_pct?: number;
  temps_C?: number[];
  packFromCells_V?: number;
  cellMin_V?: number;
  cellMax_V?: number;
  ratedCapacity_Ah?: number;
  remainCapacity_Ah?: number;
  system_state?: number | string; // optional system state
};

type DeviceInfo = {
  address: string;
  id: string;
  name: string;
  flavor: string;
};

type Point = { ts: string; v?: number; i?: number; soc?: number };

const MAX_POINTS = 600;
const FLUSH_MS = 350;

export default function Page() {
  const [pass, setPass] = useState<string>(() => {
    try {
      return localStorage.getItem("dash_pass") || "";
    } catch {
      return "";
    }
  });
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [range, setRange] = useState<"1h" | "6h" | "24h" | "1w" | "1m">("24h");

  const [chartData, setChartData] = useState<Point[]>([]);
  const bufferRef = useRef<Point[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const evtRef = useRef<EventSource | null>(null);

  // which series to show
  const [showV, setShowV] = useState(true);
  const [showI, setShowI] = useState(true);
  const [showSoc, setShowSoc] = useState(true);

  useEffect(() => {
    try {
      if (pass) localStorage.setItem("dash_pass", pass);
      else localStorage.removeItem("dash_pass");
    } catch {
      // ignore
    }
  }, [pass]);

  useEffect(() => {
    if (!pass) return;
    loadHistory("24h");
    return () => {
      evtRef.current?.close();
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pass]);

  const scheduleFlush = () => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      setChartData((prev) => {
        const merged = prev.concat(bufferRef.current);
        bufferRef.current = [];
        return merged.length > MAX_POINTS ? merged.slice(-MAX_POINTS) : merged;
      });
    }, FLUSH_MS);
  };

  const connect = () => {
    if (!pass) return;
    localStorage.setItem("dash_pass", pass);
    evtRef.current?.close();
    setConnecting(true);
    setConnected(false);

    const es = new EventSource(
      `/api/bms/events?pass=${encodeURIComponent(pass)}`
    );
    evtRef.current = es;

    es.onopen = () => {
      setConnecting(false);
      setConnected(true);
    };

    es.onmessage = (msg) => {
      try {
        const evt = JSON.parse(msg.data);
        if (evt.event === "hello") {
          setConnected(true);
          setConnecting(false);
        } else if (evt.event === "state") {
          const s: Snapshot = evt.snapshot || {};
          setSnapshot(s);

          if (!paused) {
            const p: Point = {
              ts: new Date().toLocaleTimeString(),
              v: s.voltage_V,
              i: s.current_A,
              soc: s.soc_pct,
            };
            bufferRef.current.push(p);
            if (bufferRef.current.length > MAX_POINTS * 2) {
              bufferRef.current = bufferRef.current.slice(-MAX_POINTS);
            }
            scheduleFlush();
          }
        } else if (evt.event === "connected") {
          setDevice(evt.device as DeviceInfo);
        }
      } catch {
        // ignore malformed
      }
    };

    es.onerror = () => {
      setConnecting(false);
      setConnected(false);
    };
  };

  useEffect(() => {
    connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnect = () => {
    evtRef.current?.close();
    evtRef.current = null;
    setConnecting(false);
    setConnected(false);
  };

  const togglePause = () => setPaused((p) => !p);

  const clearChart = () => {
    bufferRef.current = [];
    setChartData([]);
  };

  const loadHistory = async (r: "1h" | "6h" | "24h" | "1w" | "1m") => {
    const now = new Date();
    let from: Date;
    switch (r) {
      case "1h":
        from = new Date(now.getTime() - 3600e3);
        break;
      case "6h":
        from = new Date(now.getTime() - 6 * 3600e3);
        break;
      case "24h":
        from = new Date(now.getTime() - 24 * 3600e3);
        break;
      case "1w":
        from = new Date(now.getTime() - 7 * 24 * 3600e3);
        break;
      case "1m":
        from = new Date(now.getTime() - 30 * 24 * 3600e3);
        break;
      default:
        from = new Date(now.getTime() - 24 * 3600e3);
    }
    const url = `/api/bms/history?from=${encodeURIComponent(
      from.toISOString()
    )}&to=${encodeURIComponent(now.toISOString())}&limit=15000`;
    try {
      const res = await fetch(url, { headers: { "x-pass": pass } });
      if (!res.ok) return;
      const js = await res.json();
      const pts: Point[] = (
        js.data as Array<{ ts: string; snapshot: Snapshot }>
      ).map((d) => ({
        ts: new Date(d.ts).toLocaleTimeString(),
        v: d.snapshot?.voltage_V,
        i: d.snapshot?.current_A,
        soc: d.snapshot?.soc_pct,
      }));
      bufferRef.current = [];
      setChartData(pts.slice(-MAX_POINTS));
    } catch {
      // ignore fetch errors
    }
  };

  const cellDelta = useMemo(() => {
    if (snapshot?.cellMin_V == null || snapshot?.cellMax_V == null) return null;
    const minV = snapshot.cellMin_V;
    const maxV = snapshot.cellMax_V;
    const deltaV = maxV - minV;
    return { minV, maxV, deltaV };
  }, [snapshot]);

  const combinedChart = useMemo(() => {
    return (
      <div className="w-full">
        <div className="h-64 sm:h-72 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ts" minTickGap={20} />
              <YAxis yAxisId="voltage" />
              <YAxis yAxisId="current" orientation="right" />
              <YAxis
                yAxisId="soc"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip />
              <Legend />
              {showV && (
                <Line
                  isAnimationActive={false}
                  yAxisId="voltage"
                  type="monotone"
                  dataKey="v"
                  name="Voltage (V)"
                  dot={false}
                  stroke="#2563eb"
                  strokeWidth={2}
                />
              )}
              {showI && (
                <Line
                  isAnimationActive={false}
                  yAxisId="current"
                  type="monotone"
                  dataKey="i"
                  name="Current (A)"
                  dot={false}
                  stroke="#059669"
                  strokeWidth={2}
                />
              )}
              {showSoc && (
                <Line
                  isAnimationActive={false}
                  yAxisId="soc"
                  type="monotone"
                  dataKey="soc"
                  name="SoC (%)"
                  dot={false}
                  stroke="#f59e0b"
                  strokeWidth={2}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }, [chartData, showV, showI, showSoc]);

  return (
    <div className="min-h-screen min-w-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b px-3">
        <div className="container flex items-center gap-3 py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md grid place-items-center bg-foreground/5">
              <PlugZap size={18} />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-medium">Daly BMS Dashboard</div>
              <div className="text-xs text-muted-foreground">
                {connected
                  ? device
                    ? `${device.name} • ${device.flavor}`
                    : "Connected"
                  : connecting
                  ? "Connecting..."
                  : "Not connected"}
              </div>
            </div>

            <div className="ml-2">
              {connecting ? (
                <span className="inline-flex items-center gap-2 text-xs">
                  <svg
                    className="w-4 h-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeOpacity="0.15"
                    />
                    <path
                      d="M22 12a10 10 0 00-10-10"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              ) : null}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2">
              <Label htmlFor="pass" className="sr-only">
                Pass
              </Label>
            </div>

            {!connected ? (
              <Button onClick={connect} aria-label="Connect">
                Connect
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={disconnect}
                aria-label="Disconnect"
              >
                Disconnect
              </Button>
            )}

            <ThemeToggle />
          </div>
        </div>
      </header>

      {!connected && (
        <div className="w-screen flex justify-end ml-[-5%]">
          <Input
            id="pass"
            aria-label="pass"
            type="password"
            placeholder="pass"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="w-36 items-end"
          />
        </div>
      )}

      <main className="min-w-screen container py-4">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History size={16} />
                Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <BatteryCard
                  label="State of Charge"
                  value={snapshot?.soc_pct ?? null}
                  hint={
                    snapshot?.remainCapacity_Ah
                      ? `Remain ${snapshot.remainCapacity_Ah} Ah`
                      : undefined
                  }
                />

                <StatCard
                  icon={<PlugZap />}
                  label="Power"
                  value={fmt(
                    snapshot?.voltage_V != null && snapshot?.current_A != null
                      ? snapshot.voltage_V * snapshot.current_A
                      : undefined,
                    "W"
                  )}
                  hint={
                    snapshot?.voltage_V != null && snapshot?.current_A != null
                      ? `${fmt(snapshot.voltage_V)} × ${fmt(
                          snapshot.current_A
                        )}`
                      : undefined
                  }
                />

                <StatCard
                  icon={<Plug />}
                  label="Current"
                  value={fmt(snapshot?.current_A, "A")}
                  hint={
                    snapshot?.ratedCapacity_Ah
                      ? `Rated ${snapshot.ratedCapacity_Ah} Ah`
                      : undefined
                  }
                />

                <StatCard
                  icon={<Zap />}
                  label="Voltage"
                  value={fmt(snapshot?.voltage_V, "V")}
                  hint={
                    snapshot?.packFromCells_V
                      ? `Cells sum: ${fmt(snapshot.packFromCells_V, "V")}`
                      : undefined
                  }
                />

                <Card className="relative">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Cell Spread</CardTitle>
                    <CardDescription>
                      Min, Max and Delta between cells.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg border w-10 h-10 grid place-items-center">
                        <div className="text-xs">C</div>
                      </div>
                      <div className="text-sm">
                        <div className="font-semibold">
                          Min:{" "}
                          {snapshot?.cellMin_V != null
                            ? fmt(snapshot.cellMin_V, "V")
                            : "—"}
                        </div>
                        <div className="font-semibold">
                          Max:{" "}
                          {snapshot?.cellMax_V != null
                            ? fmt(snapshot.cellMax_V, "V")
                            : "—"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Delta:{" "}
                          {cellDelta
                            ? `${fmt(cellDelta.deltaV, "V")} (${Math.round(
                                cellDelta.deltaV * 1000 || 0
                              )} mV)`
                            : "—"}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <History size={16} />
                  Live Telemetry
                </CardTitle>
              </div>

              <div>
                <button
                  onClick={() => {
                    setRange("1h");
                    loadHistory("1h");
                  }}
                  className={`px-2 py-1 text-xs rounded ${
                    range === "1h"
                      ? "bg-foreground/8 font-semibold"
                      : "bg-muted/5"
                  }`}
                >
                  1h
                </button>

                <button
                  onClick={() => {
                    setRange("6h");
                    loadHistory("6h");
                  }}
                  className={`px-2 py-1 text-xs rounded ${
                    range === "6h"
                      ? "bg-foreground/8 font-semibold"
                      : "bg-muted/5"
                  }`}
                >
                  6h
                </button>

                <button
                  onClick={() => {
                    setRange("24h");
                    loadHistory("24h");
                  }}
                  className={`px-2 py-1 text-xs rounded ${
                    range === "24h"
                      ? "bg-foreground/8 font-semibold"
                      : "bg-muted/5"
                  }`}
                >
                  24h
                </button>

                <button
                  onClick={() => {
                    setRange("1w");
                    loadHistory("1w");
                  }}
                  className={`px-2 py-1 text-xs rounded ${
                    range === "1w"
                      ? "bg-foreground/8 font-semibold"
                      : "bg-muted/5"
                  }`}
                >
                  1w
                </button>

                <button
                  onClick={() => {
                    setRange("1m");
                    loadHistory("1m");
                  }}
                  className={`px-2 py-1 text-xs rounded ${
                    range === "1m"
                      ? "bg-foreground/8 font-semibold"
                      : "bg-muted/5"
                  }`}
                >
                  1m
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowV((s) => !s)}
                  className={`p-2 rounded ${
                    showV ? "bg-foreground/10" : "bg-muted/5"
                  }`}
                  aria-pressed={showV}
                  aria-label="toggle-voltage"
                  title={undefined}
                >
                  <Zap size={16} />
                </button>

                <button
                  onClick={() => setShowI((s) => !s)}
                  className={`p-2 rounded ${
                    showI ? "bg-foreground/10" : "bg-muted/5"
                  }`}
                  aria-pressed={showI}
                  aria-label="toggle-current"
                  title={undefined}
                >
                  <Plug size={16} />
                </button>

                <button
                  onClick={() => setShowSoc((s) => !s)}
                  className={`p-2 rounded ${
                    showSoc ? "bg-foreground/10" : "bg-muted/5"
                  }`}
                  aria-pressed={showSoc}
                  aria-label="toggle-soc"
                  title={undefined}
                >
                  <BatteryIcon size={16} />
                </button>

                <button
                  onClick={togglePause}
                  className="p-2 rounded bg-muted/5"
                  aria-pressed={paused}
                  aria-label="pause"
                  title={undefined}
                >
                  {paused ? <Play size={16} /> : <Pause size={16} />}
                </button>

                <button
                  onClick={clearChart}
                  className="p-2 rounded bg-muted/5"
                  aria-label="clear"
                  title={undefined}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </CardHeader>

            <CardContent className="px-0">{combinedChart}</CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Telemetry</CardTitle>
              <CardDescription>
                Temperatures, sensors, device metadata and system state (icon
                only).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                <div>
                  <div className="text-sm text-muted-foreground">Temps</div>
                  <div className="mt-1 font-medium">
                    {snapshot?.temps_C?.length
                      ? snapshot.temps_C.map((t) => `${t}°C`).join(", ")
                      : "—"}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">Device</div>
                  <div className="mt-1 font-medium">
                    {device ? `${device.name} • ${device.address}` : "—"}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">
                    Connection
                  </div>
                  <div className="mt-1 font-medium">
                    {connected
                      ? "SSE Live"
                      : connecting
                      ? "Connecting..."
                      : "Disconnected"}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-sm text-muted-foreground">System</div>
                  <div aria-hidden>
                    {/* system state icon only; map numeric/string state to icon color */}
                    <SystemStateIcon state={snapshot?.system_state} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

/* helpers */

function fmt(v?: number, unit?: string) {
  if (v == null || Number.isNaN(v)) return "—";
  const n = Number(v);
  if (unit === "%") return `${n.toFixed(1)}${unit ? " " + unit : ""}`; // 1 decimal for soc when requested
  if (Math.abs(n) >= 1000) return `${Math.round(n)}${unit ? " " + unit : ""}`;
  return `${Number(n.toFixed(2))}${unit ? " " + unit : ""}`;
}

/* Stat cards */

function StatCard({
  icon,
  label,
  value,
  hint,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{label}</CardTitle>
        </div>
        {hint ? <CardDescription>{hint}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg border grid place-items-center">
            {icon}
          </div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/* Battery card: radial inline with single value, 1 decimal */
function BatteryCard({
  icon,
  label,
  value,
  hint,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number | null;
  hint?: string;
}) {
  const pct =
    value == null || Number.isNaN(Number(value))
      ? null
      : Math.max(0, Math.min(100, Number(value)));
  const display = pct == null ? "—" : `${pct.toFixed(1)}%`; // one decimal
  const angle = pct == null ? 0 : (pct / 100) * 360;
  const color =
    pct == null
      ? "#9ca3af"
      : pct > 60
      ? "#10b981"
      : pct > 30
      ? "#f59e0b"
      : "#ef4444";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{label}</CardTitle>
        </div>
        {hint ? <CardDescription>{hint}</CardDescription> : null}
      </CardHeader>

      <CardContent>
        <div className="flex items-center gap-3">
          {icon && (
            <div className="w-10 h-10 rounded-lg border grid place-items-center">
              {icon}
            </div>
          )}

          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full grid place-items-center text-xs font-semibold"
              style={{
                background: `conic-gradient(${color} ${angle}deg, #e5e7eb ${angle}deg)`,
                color: "#111827",
              }}
              aria-hidden
            >
              <div className="w-8 h-8 rounded-full grid place-items-center bg-white/90 dark:bg-neutral-900/90 text-sm font-medium"></div>
            </div>

            <div className="text-lg font-semibold">{display}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* System state icon mapping (icon-only) */
function SystemStateIcon({ state }: { state?: number | string | null }) {
  // simple mapping:
  // 0 / "ok" => green dot
  // 1 / "warn" => amber
  // 2 / "fault" => red
  // undefined/null => gray
  const s = state == null ? "unknown" : String(state).toLowerCase();
  const color =
    s === "0" || s === "ok"
      ? "bg-emerald-500"
      : s === "1" || s === "warn"
      ? "bg-amber-500"
      : s === "2" || s === "fault"
      ? "bg-red-600"
      : "bg-gray-400";

  return (
    <span
      className={`w-4 h-4 inline-block rounded-full ${color}`}
      aria-hidden
    />
  );
}
