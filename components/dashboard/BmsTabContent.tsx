// components/dashboard/BmsTabContent.tsx
import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Thermometer,
  Activity,
  Battery,
  BatteryCharging,
  Loader2,
  Zap,
} from "lucide-react";
import BatteryWithPercentage from "@/components/battery-with-percentage";
import { LiveChart } from "@/components/dashboard/LiveChart";
import { fmt } from "@/lib/utils/fmt";
import type { Point, Snapshot } from "@/lib/types/bms";

type BmsTabContentProps = {
  bmsId: 1 | 2;
  snapshot: Snapshot | null;
  device: { name: string; flavor: string } | null;
  chartData: Point[];
  showV: boolean;
  showI: boolean;
  showSoc: boolean;
  cellDelta: { minV: number; maxV: number; deltaV: number } | null;
  connecting: boolean;
  connected: boolean;
};

export function BmsTabContent({
  bmsId,
  snapshot,
  device,
  chartData,
  showV,
  showI,
  showSoc,
  cellDelta,
  connecting,
  connected,
}: BmsTabContentProps) {
  const power =
    snapshot?.voltage_V != null && snapshot?.current_A != null
      ? snapshot.voltage_V * snapshot.current_A
      : null;

  return (
    <main className="flex flex-col gap-2">
      {/* Overview Card */}
      <Card>
        <CardHeader className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            Overview • BMS {bmsId}
          </div>
          <div className="text-xs text-muted-foreground">
            {device
              ? `${device.name} `
              : connected
              ? "Connected"
              : "Not connected"}
          </div>
        </CardHeader>
        <CardContent className="px-4 py-4">
          <div className="flex w-full justify-evenly mb-5">
            <div className="flex flex-col items-center">
              <BatteryWithPercentage socPercentage={snapshot?.soc_pct} />
              <span className="text-muted-foreground text-xs">SoC (%)</span>
            </div>
            <div className="flex flex-col items-center gap-1 min-w-18">
              <div className="font-semibold text-lg">
                {power != null ? (
                  <span
                    className={
                      power > 0
                        ? "text-green-500"
                        : power < 0
                        ? "text-red-500/90"
                        : ""
                    }
                  >
                    {fmt(power, "W", 0)}
                  </span>
                ) : (
                  "—"
                )}
              </div>
              <span className="text-muted-foreground text-xs">Power</span>
            </div>
            <div className="flex flex-col items-center gap-1 min-w-18">
              <div className="font-semibold text-lg">
                {fmt(snapshot?.current_A, "A", 1)}
              </div>
              <span className="text-muted-foreground text-xs">Current</span>
            </div>
            <div className="flex flex-col items-center gap-1 min-w-18">
              <div className="font-semibold text-lg">
                {fmt(snapshot?.voltage_V, "V", 1)}
              </div>
              <span className="text-muted-foreground text-xs">Voltage</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cell Voltages Table */}
      <Card>
        <CardHeader className="px-4 py-2">
          <div className="text-sm font-medium">Cell Voltages</div>
        </CardHeader>
        <CardContent className="px-0">
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
              {snapshot?.cells_V && snapshot.cells_V.length > 0 ? (
                snapshot.cells_V.reduce<React.ReactElement[]>(
                  (rows, _, i, arr) => {
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
                  },
                  []
                )
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground"
                  >
                    No cell data
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter className="bg-muted/25">
              <TableRow>
                <TableCell colSpan={3}>Sum of cells:</TableCell>
                <TableCell>{fmt(snapshot?.packFromCells_V, "V", 3)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={3}>Delta:</TableCell>
                <TableCell>
                  {cellDelta
                    ? `${Math.round(cellDelta.deltaV * 1000)} mV`
                    : "—"}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {/* Live Chart */}
      <Card>
        <CardHeader className="px-4 py-2">
          <div className="text-sm font-medium">Live Telemetry</div>
        </CardHeader>
        <CardContent className="px-0">
          {chartData.length > 0 ? (
            <LiveChart
              data={chartData}
              showV={showV}
              showI={showI}
              showSoc={showSoc}
            />
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              {connected ? "Waiting for data..." : "Not connected"}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Telemetry Details */}
      <Card>
        <CardHeader className="px-4 py-2">
          <div className="text-sm font-medium">Status</div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-7 px-4 py-4">
          <div className="flex flex-col">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Thermometer className="w-4 h-4" /> Temps
            </div>
            <div className="mt-1 font-medium">
              {snapshot?.temps_C?.length
                ? snapshot.temps_C.map((t: number) => `${t}°C`).join(", ")
                : "—"}
            </div>
          </div>

          <div className="flex flex-col">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Activity className="w-4 h-4" /> Connection
            </div>
            <div className="mt-1 font-medium">
              {connected
                ? "Live"
                : connecting
                ? "Connecting..."
                : "Disconnected"}
            </div>
          </div>

          <div className="flex flex-col">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Battery className="w-4 h-4" /> Battery State
            </div>
            <div className="mt-2 flex flex-col gap-2">
              <div
                className={`flex items-center gap-1 font-medium ${
                  snapshot?.charging
                    ? "text-green-500"
                    : "text-muted-foreground"
                }`}
              >
                <BatteryCharging
                  className={`w-4 h-4 ${
                    snapshot?.charging ? "animate-pulse" : ""
                  }`}
                />
                Charging {snapshot?.charging ? "Enabled" : "Disabled"}
              </div>
              <div
                className={`flex items-center gap-1 font-medium ${
                  snapshot?.discharging
                    ? "text-red-500/90"
                    : "text-muted-foreground"
                }`}
              >
                <Zap
                  className={`w-4 h-4 ${
                    snapshot?.discharging ? "animate-pulse" : ""
                  }`}
                />
                Discharging {snapshot?.discharging ? "Enabled" : "Disabled"}
              </div>
              {snapshot?.balancingActive ? (
                <div className="flex items-center gap-1 text-blue-600 font-medium">
                  <Loader2 className="w-4 h-4 animate-spin" /> Balancing Active
                </div>
              ) : (
                <div className="flex items-center gap-1 text-muted-foreground font-medium">
                  <Loader2 className="w-4 h-4" /> Balance Idle
                </div>
              )}
              {snapshot?.balancingCells?.length ? (
                <div className="text-xs text-muted-foreground mt-1">
                  Cells: {snapshot.balancingCells.join(", ")}
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
