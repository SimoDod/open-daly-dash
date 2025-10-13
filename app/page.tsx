/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  PlugZap,
  Pause,
  Play,
  History,
  Zap,
  Plug,
  Battery as BatteryIcon,
  Diff,
} from "lucide-react";

import { useBmsDashboard } from "@/lib/hooks/useBmsDashboard";
import { LiveChart } from "@/components/dashboard/LiveChart";
import { RangeSelector } from "@/components/dashboard/RangeSelector";
import { SystemStateIcon } from "@/components/dashboard/SystemStateIcon";
import { fmt } from "@/lib/utils/fmt";
import SmallStat from "@/components/dashboard/SmallStat";

export default function Page() {
  const {
    pass,
    setPass,
    connected,
    connecting,
    connect,
    disconnect,
    snapshot,
    device,
    range,
    setRange,
    loadHistory,
    chartData,
    showV,
    setShowV,
    showI,
    setShowI,
    showSoc,
    setShowSoc,
    paused,
    togglePause,
    cellDelta,
  } = useBmsDashboard();

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
              <Button
                disabled={connecting}
                onClick={connect}
                aria-label="Connect"
              >
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
          <Card className="gap-0">
            <CardHeader className="px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <History size={16} />
                Overview
              </div>
              <div className="text-xs text-muted-foreground">Updated live</div>
            </CardHeader>
            <CardContent className="px-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <SmallStat
                  label="Charge"
                  value={
                    snapshot?.soc_pct != null ? `${snapshot.soc_pct}%` : "—"
                  }
                  hint={
                    snapshot?.remainCapacity_Ah
                      ? `${snapshot.remainCapacity_Ah.toFixed(
                          1
                        )}a / ${snapshot?.ratedCapacity_Ah?.toFixed(1)}a`
                      : undefined
                  }
                  icon={(() => {
                    const raw = snapshot?.soc_pct;
                    const pct =
                      raw == null || Number.isNaN(Number(raw))
                        ? null
                        : Math.max(0, Math.min(100, Number(raw)));
                    const fillColor =
                      pct == null
                        ? "#9ca3af"
                        : pct > 60
                        ? "#10b981"
                        : pct > 30
                        ? "#f59e0b"
                        : "#ef4444";
                    const angle = pct == null ? 0 : pct * 3.6;
                    return (
                      <div
                        className="relative w-7 h-7 rounded-full grid place-items-center shrink-0"
                        role="img"
                        aria-label={
                          pct == null
                            ? "SOC unknown"
                            : `State of charge ${Math.round(pct)} percent`
                        }
                        style={{
                          background:
                            pct == null
                              ? "#e5e7eb"
                              : `conic-gradient(${fillColor} ${angle}deg, #e5e7eb ${angle}deg)`,
                        }}
                      ></div>
                    );
                  })()}
                />
                <SmallStat
                  icon={<PlugZap />}
                  label="Power"
                  value={
                    snapshot?.voltage_V != null && snapshot?.current_A != null
                      ? (() => {
                          const power = snapshot.voltage_V * snapshot.current_A;
                          const color =
                            power > 0
                              ? "text-green-600"
                              : power < 0
                              ? "text-red-600"
                              : "text-gray-700";
                          return (
                            <span className={color}>{fmt(power, "W", 0)}</span>
                          );
                        })()
                      : "—"
                  }
                  hint={
                    snapshot?.voltage_V != null && snapshot?.current_A != null
                      ? `${fmt(snapshot.voltage_V)}v × ${fmt(
                          snapshot.current_A
                        )}a`
                      : undefined
                  }
                />

                <SmallStat
                  icon={<Diff />}
                  label="Cells D"
                  value={
                    <>
                      <div>
                        Min:{" "}
                        {snapshot?.cellMin_V != null
                          ? fmt(snapshot.cellMin_V, "V")
                          : "—"}
                      </div>
                      <div>
                        Max:{" "}
                        {snapshot?.cellMax_V != null
                          ? fmt(snapshot.cellMax_V, "V")
                          : "—"}
                      </div>
                    </>
                  }
                  hint={
                    <>
                      <div>
                        {cellDelta
                          ? `Delta: ${fmt(cellDelta.deltaV, "V")} (${Math.round(
                              cellDelta.deltaV * 1000 || 0
                            )} mV)`
                          : "—"}
                      </div>
                      <div>
                        {snapshot?.packFromCells_V
                          ? `Cells sum: ${fmt(snapshot.packFromCells_V, "V")}`
                          : undefined}
                      </div>
                    </>
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Live Telemetry: content first */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <History size={16} />
                Live Telemetry
              </div>

              <div className="flex items-center gap-2">
                <RangeSelector
                  value={range}
                  onChange={(r: any) => {
                    setRange(r);
                    loadHistory(r);
                  }}
                />

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowV((s: any) => !s)}
                    className={`p-2 rounded-md border ${
                      showV ? "bg-foreground/6" : "bg-muted/5"
                    }`}
                    aria-pressed={showV}
                    aria-label="toggle-voltage"
                  >
                    <Zap size={16} />
                  </button>

                  <button
                    onClick={() => setShowI((s: any) => !s)}
                    className={`p-2 rounded-md border ${
                      showI ? "bg-foreground/6" : "bg-muted/5"
                    }`}
                    aria-pressed={showI}
                    aria-label="toggle-current"
                  >
                    <Plug size={16} />
                  </button>

                  <button
                    onClick={() => setShowSoc((s: any) => !s)}
                    className={`p-2 rounded-md border ${
                      showSoc ? "bg-foreground/6" : "bg-muted/5"
                    }`}
                    aria-pressed={showSoc}
                    aria-label="toggle-soc"
                  >
                    <BatteryIcon size={16} />
                  </button>

                  <button
                    onClick={togglePause}
                    className="p-2 rounded-md border bg-muted/5"
                    aria-pressed={paused}
                    aria-label="pause"
                  >
                    {paused ? <Play size={16} /> : <Pause size={16} />}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {Array.isArray(chartData) && chartData.length ? (
                <LiveChart
                  data={chartData}
                  showV={showV}
                  showI={showI}
                  showSoc={showSoc}
                />
              ) : (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No chart data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Telemetry card: content first */}
          <Card>
            <CardHeader className="px-4 py-2">
              <CardTitle>Telemetry</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                <div>
                  <div className="text-sm text-muted-foreground">Temps</div>
                  <div className="mt-1 font-medium">
                    {snapshot?.temps_C?.length
                      ? snapshot.temps_C.map((t: any) => `${t}°C`).join(", ")
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
