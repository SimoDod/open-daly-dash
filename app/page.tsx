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
  Loader2,
} from "lucide-react";

import { useBmsDashboard } from "@/lib/hooks/useBmsDashboard";
import { LiveChart } from "@/components/dashboard/LiveChart";
import { RangeSelector } from "@/components/dashboard/RangeSelector";
import { SystemStateIcon } from "@/components/dashboard/SystemStateIcon";
import { fmt } from "@/lib/utils/fmt";
import BatteryWithPercentage from "@/components/battery-with-percentage";
import {
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  TableFooter,
  Table,
} from "@/components/ui/table";
import { ReactElement } from "react";

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
    status
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
                <span
                  className="inline-flex items-center gap-2 text-xs"
                  aria-hidden
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
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
                {connecting ? "Connecting…" : "Connect"}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={disconnect}
                aria-label="Disconnect"
                disabled={connecting}
              >
                Disconnect
              </Button>
            )}

            <ThemeToggle />
          </div>
        </div>
      </header>
      <div>{connecting} Status{status}</div>

      {!connected && !connecting && (
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
              <div className="flex w-full justify-evenly mb-5">
                <div className="flex flex-col items-center justify-between min-w-18 gap-1">
                  <BatteryWithPercentage socPercentage={snapshot?.soc_pct} />
                  <Label className="text-muted-foreground">SoC (%)</Label>
                </div>
                <div className="flex flex-col items-center justify-between min-w-18 gap-1">
                  <div className="flex items-center h-14">
                    <div className="font-semibold truncate">
                      {snapshot?.voltage_V != null &&
                      snapshot?.current_A != null
                        ? (() => {
                            const power =
                              snapshot.voltage_V * snapshot.current_A;
                            const color =
                              power > 0
                                ? "text-green-600"
                                : power < 0
                                ? "text-red-600"
                                : "text-gray-700";
                            return (
                              <span className={color}>
                                {fmt(power, "W", 0)}
                              </span>
                            );
                          })()
                        : "—"}
                    </div>
                  </div>
                  <Label className="text-muted-foreground">Power</Label>
                </div>
                <div className="flex flex-col items-center justify-between min-w-18 gap-1">
                  <div className="flex items-center h-14">
                    <div className="font-semibold truncate">
                      {fmt(snapshot?.current_A, "A", 1)}
                    </div>
                  </div>
                  <Label className="text-muted-foreground">Current</Label>
                </div>
                <div className="flex flex-col items-center justify-between min-w-18 gap-1">
                  <div className="flex items-center h-14">
                    <div className="font-semibold truncate">
                      {fmt(snapshot?.voltage_V, "V", 1)}
                    </div>
                  </div>
                  <Label className="text-muted-foreground">Voltage</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="px-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cell</TableHead>
                  <TableHead>Voltage (V)</TableHead>
                  <TableHead>Cell</TableHead>
                  <TableHead>Voltage (V)</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {snapshot?.cells_V &&
                  snapshot.cells_V.reduce<ReactElement[]>((rows, _, i, arr) => {
                    if (i % 2 === 0) {
                      const j = i + 1;
                      rows.push(
                        <TableRow key={i}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell>{arr[i]?.toFixed(3)}</TableCell>
                          {j < arr.length ? (
                            <>
                              <TableCell>{j + 1}</TableCell>
                              <TableCell>{arr[j]?.toFixed(3)}</TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell />
                              <TableCell />
                            </>
                          )}
                        </TableRow>
                      );
                    }
                    return rows;
                  }, [])}

                {(!snapshot?.cells_V || snapshot.cells_V.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No cell data available
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>

              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Sum of cells:</TableCell>
                  <TableCell>
                    {fmt(snapshot?.packFromCells_V, "V", 3)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3}>Delta:</TableCell>
                  <TableCell>
                    {cellDelta &&
                      `${Math.round(cellDelta.deltaV * 1000 || 0)} mV`}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Card>

          {/* Live Telemetry: content first */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <History size={16} />
                Live Telemetry
              </div>

              <div className="flex items-center gap-2">
                {/* RangeSelector wrapper */}
                <div
                  className={connecting ? "pointer-events-none opacity-50" : ""}
                  aria-disabled={connecting}
                >
                  <RangeSelector
                    value={range}
                    onChange={(r: any) => {
                      setRange(r);
                      loadHistory(r);
                    }}
                  />
                </div>

                {/* Control buttons */}
                <div
                  className={`flex items-center gap-2 ${
                    connecting ? "pointer-events-none opacity-50" : ""
                  }`}
                  aria-disabled={connecting}
                >
                  <button
                    onClick={() => setShowV((s: any) => !s)}
                    className={`p-2 rounded-md border ${
                      showV ? "bg-foreground/6" : "bg-muted/5"
                    }`}
                    aria-pressed={showV}
                    aria-label="toggle-voltage"
                    disabled={connecting}
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
                    disabled={connecting}
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
                    disabled={connecting}
                  >
                    <BatteryIcon size={16} />
                  </button>

                  <button
                    onClick={togglePause}
                    className="p-2 rounded-md border bg-muted/5"
                    aria-pressed={paused}
                    aria-label="pause"
                    disabled={connecting}
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
