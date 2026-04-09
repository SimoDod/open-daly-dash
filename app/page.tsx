"use client";

import React from "react";
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
import { LiveChart } from "@/components/dashboard/LiveChart";
import { RangeSelector } from "@/components/dashboard/RangeSelector";
import BatteryWithPercentage from "@/components/battery-with-percentage";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBmsDashboard } from "@/lib/hooks/useBmsDashboard";
import { fmt } from "@/lib/utils/fmt";
import { cn } from "@/lib/utils";
import {
  Activity,
  Battery,
  Gauge,
  History,
  Loader2,
  Pause,
  Play,
  Plug,
  PlugZap,
  ShieldAlert,
  Thermometer,
  TriangleAlert,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";

type Tone = "emerald" | "amber" | "rose" | "sky" | "slate";

const toneDot: Record<Tone, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  sky: "bg-sky-500",
  slate: "bg-foreground/30",
};

const toneText: Record<Tone, string> = {
  emerald: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
  rose: "text-rose-600 dark:text-rose-400",
  sky: "text-sky-600 dark:text-sky-400",
  slate: "text-muted-foreground",
};

function StatusBadge({
  tone,
  spinning,
  children,
}: {
  tone: Tone;
  spinning?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-xs font-medium",
        toneText[tone],
      )}
    >
      {spinning ? (
        <Loader2 className="size-3 animate-spin text-amber-500" />
      ) : (
        <span className={cn("size-1.5 rounded-full", toneDot[tone])} />
      )}
      {children}
    </span>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  tone = "slate",
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "grid size-8 place-items-center rounded-lg bg-secondary",
            toneText[tone],
          )}
        >
          {icon}
        </span>
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function InfoRow({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 rounded-lg border bg-card px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 text-right text-sm font-medium break-words",
          toneText[tone],
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ToggleChip({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all",
        active
          ? "border-primary/30 bg-primary/10 text-primary shadow-sm"
          : "border-transparent bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export default function Page() {
  const {
    pass,
    setPass,
    connected,
    connecting,
    status,
    lastError,
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

  const power =
    snapshot?.voltage_V != null && snapshot?.current_A != null
      ? snapshot.voltage_V * snapshot.current_A
      : null;
  const temperatures = snapshot?.temps_C ?? [];
  const avgTemp = temperatures.length
    ? temperatures.reduce((sum, t) => sum + t, 0) / temperatures.length
    : null;
  const balanceCells = (snapshot?.balancingCells ?? []).map((cell) =>
    String(cell),
  );
  const cells = snapshot?.cells_V ?? [];
  const cellPairs = Array.from(
    { length: Math.ceil(cells.length / 2) },
    (_, index) => {
      const leftIndex = index * 2;
      const rightIndex = leftIndex + 1;

      return {
        leftIndex,
        leftValue: cells[leftIndex],
        rightIndex,
        rightValue: cells[rightIndex],
      };
    },
  );

  const connectionTone: Tone = connected
    ? "emerald"
    : connecting
      ? "amber"
      : lastError
        ? "rose"
        : "slate";

  const connectionStatusTone: Tone =
    status === "ready" || status === "connected"
      ? "emerald"
      : status === "connecting" || status === "degraded"
        ? "amber"
        : status === "disconnected"
          ? "rose"
          : "slate";

  const connectionStatusLabel =
    status === "ready"
      ? "Ready"
      : status === "connected"
        ? "Connected"
        : status === "connecting"
          ? "Connecting"
          : status === "degraded"
            ? "Degraded"
            : status === "disconnected"
              ? "Disconnected"
              : "Idle";

  const connectionHealthTone: Tone = connecting
    ? "amber"
    : connected
      ? "emerald"
      : lastError
        ? "rose"
        : "slate";

  const connectionHealthLabel = connecting
    ? "Connecting"
    : connected
      ? "Stable"
      : lastError
        ? lastError
        : "Waiting for stream";

  const healthTone: Tone =
    cellDelta?.deltaV == null
      ? "slate"
      : cellDelta.deltaV <= 0.015
        ? "emerald"
        : cellDelta.deltaV <= 0.03
          ? "amber"
          : "rose";

  const powerTone: Tone =
    power == null
      ? "slate"
      : power > 0
        ? "emerald"
        : power < 0
          ? "rose"
          : "sky";

  const headerStatus = device
    ? `${device.name} · ${device.flavor}`
    : "Live battery telemetry";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <PlugZap className="size-4" />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold tracking-tight">
              BMS Dashboard
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {headerStatus}
            </p>
          </div>

          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
        {/* Status bar */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={connectionHealthTone} spinning={connecting}>
            {connectionHealthLabel}
          </StatusBadge>
          <StatusBadge tone={healthTone}>
            Cell delta{" "}
            {cellDelta ? `${Math.round(cellDelta.deltaV * 1000)} mV` : "N/A"}
          </StatusBadge>
        </div>

        {/* Top metrics */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="col-span-2 flex flex-col items-center justify-center rounded-xl border bg-card p-5 lg:col-span-1">
            <BatteryWithPercentage
              socPercentage={snapshot?.soc_pct}
              size={88}
              className="mx-auto"
            />
            <div className="mt-1 text-center">
              <div className="text-2xl font-semibold tracking-tight">
                {fmt(snapshot?.soc_pct, "%", 0)}
              </div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                State of charge
              </div>
            </div>
          </div>

          <MetricCard
            icon={<Zap className="size-4" />}
            label="Power"
            value={
              power == null ? (
                "N/A"
              ) : (
                <span
                  className={cn(
                    power > 0 && "text-emerald-600 dark:text-emerald-400",
                    power < 0 && "text-rose-600 dark:text-rose-400",
                  )}
                >
                  {fmt(power, "W", 0)}
                </span>
              )
            }
            hint={
              power == null
                ? "Waiting for data"
                : power > 0
                  ? "Charging"
                  : power < 0
                    ? "Discharging"
                    : "Idle"
            }
            tone={powerTone}
          />

          <MetricCard
            icon={<Zap className="size-4" />}
            label="Voltage"
            value={fmt(snapshot?.voltage_V, "V", 1)}
            hint={
              snapshot?.packFromCells_V != null
                ? `Sum ${fmt(snapshot.packFromCells_V, "V", 3)}`
                : undefined
            }
            tone="sky"
          />

          <MetricCard
            icon={<Plug className="size-4" />}
            label="Current"
            value={fmt(snapshot?.current_A, "A", 1)}
            tone={powerTone}
          />

          <MetricCard
            icon={<Thermometer className="size-4" />}
            label="Thermal"
            value={avgTemp == null ? "N/A" : `${Math.round(avgTemp)}°C`}
            hint={
              temperatures.length
                ? `${temperatures.length} sensor${temperatures.length > 1 ? "s" : ""}`
                : undefined
            }
            tone={
              avgTemp == null
                ? "slate"
                : avgTemp >= 45
                  ? "rose"
                  : avgTemp >= 35
                    ? "amber"
                    : "emerald"
            }
          />
        </section>

        {/* Chart + Pack state */}
        <section className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <Card className="min-w-0 py-0">
            <CardHeader className="gap-3 px-5 pt-5 pb-0">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <History className="size-4 text-muted-foreground" />
                    Telemetry
                  </CardTitle>
                  <CardDescription className="mt-0.5 text-xs">
                    Live and historical data series
                  </CardDescription>
                </div>

                <div
                  className={cn(connecting && "pointer-events-none opacity-60")}
                  aria-disabled={connecting}
                >
                  <RangeSelector
                    value={range}
                    onChange={(nextRange) => {
                      setRange(nextRange);
                      loadHistory(nextRange);
                    }}
                  />
                </div>
              </div>

              <div
                className={cn(
                  "flex flex-wrap gap-1.5",
                  connecting && "pointer-events-none opacity-60",
                )}
                aria-disabled={connecting}
              >
                <ToggleChip
                  active={showV}
                  onClick={() => setShowV((current) => !current)}
                  icon={<Zap className="size-3.5" />}
                  label="V"
                  disabled={connecting}
                />
                <ToggleChip
                  active={showI}
                  onClick={() => setShowI((current) => !current)}
                  icon={<Plug className="size-3.5" />}
                  label="I"
                  disabled={connecting}
                />
                <ToggleChip
                  active={showSoc}
                  onClick={() => setShowSoc((current) => !current)}
                  icon={<Battery className="size-3.5" />}
                  label="SoC"
                  disabled={connecting}
                />
                <ToggleChip
                  active={paused}
                  onClick={togglePause}
                  icon={
                    paused ? (
                      <Play className="size-3.5" />
                    ) : (
                      <Pause className="size-3.5" />
                    )
                  }
                  label={paused ? "Resume" : "Pause"}
                  disabled={connecting}
                />
              </div>
            </CardHeader>

            <CardContent className="min-w-0 px-3 py-4 sm:px-5">
              <div className="overflow-hidden rounded-lg border bg-muted/30 p-2">
                {Array.isArray(chartData) && chartData.length ? (
                  <LiveChart
                    data={chartData}
                    showV={showV}
                    showI={showI}
                    showSoc={showSoc}
                  />
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground sm:h-72">
                    Connect the BMS to populate the timeline.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-0 py-0">
            <CardHeader className="px-5 pt-5 pb-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="size-4 text-muted-foreground" />
                Pack state
              </CardTitle>
              <CardDescription className="text-xs">
                Diagnostics and operating mode
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-2.5 px-5 py-4">
              <InfoRow
                label="Temperatures"
                value={
                  temperatures.length
                    ? temperatures.map((temp) => `${temp}°C`).join(", ")
                    : "No probes"
                }
                tone={
                  avgTemp == null
                    ? "slate"
                    : avgTemp >= 45
                      ? "rose"
                      : avgTemp >= 35
                        ? "amber"
                        : "emerald"
                }
              />
              <InfoRow
                label="Charging"
                value={snapshot?.charging ? "Active" : "Idle"}
                tone={snapshot?.charging ? "emerald" : "slate"}
              />
              <InfoRow
                label="Discharging"
                value={snapshot?.discharging ? "Active" : "Idle"}
                tone={snapshot?.discharging ? "rose" : "slate"}
              />
              <InfoRow
                label="Balancing"
                value={
                  snapshot?.balancingActive ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="size-3.5 animate-spin" />
                      Active
                    </span>
                  ) : (
                    "Idle"
                  )
                }
                tone={snapshot?.balancingActive ? "sky" : "slate"}
              />

              <div className="rounded-lg border bg-card p-4">
                <div className="mb-2.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <Activity className="size-3.5 text-primary" />
                  Balancing cells
                </div>
                {balanceCells.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {balanceCells.map((cell) => (
                      <span
                        key={cell}
                        className="rounded-md bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-600 dark:text-sky-400"
                      >
                        Cell {cell}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No active balancing targets.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Cell voltages + Connection */}
        <section className="grid items-start gap-5 xl:grid-cols-[1fr_380px]">
          <Card className="min-w-0 py-0">
            <CardHeader className="gap-3 px-5 pt-5 pb-0 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <CardTitle className="text-base">Cell voltages</CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Individual cell readings with min/max highlighting
                </CardDescription>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <StatusBadge tone={connectionStatusTone} spinning={connecting}>
                  {connectionStatusLabel}
                </StatusBadge>
                <StatusBadge tone={healthTone}>
                  Delta{" "}
                  {cellDelta
                    ? `${Math.round(cellDelta.deltaV * 1000)} mV`
                    : "N/A"}
                </StatusBadge>
                <StatusBadge tone="sky">
                  Sum {fmt(snapshot?.packFromCells_V, "V", 3)}
                </StatusBadge>
              </div>
            </CardHeader>

            <CardContent className="px-0 py-4">
              {/* Mobile cards */}
              <div className="grid gap-2 px-5 sm:hidden">
                {cellPairs.length ? (
                  cellPairs.map((pair) => {
                    const leftIsMin = pair.leftValue === snapshot?.cellMin_V;
                    const leftIsMax = pair.leftValue === snapshot?.cellMax_V;
                    const rightIsMin = pair.rightValue === snapshot?.cellMin_V;
                    const rightIsMax = pair.rightValue === snapshot?.cellMax_V;

                    return (
                      <div
                        key={pair.leftIndex}
                        className="grid grid-cols-2 gap-4 rounded-lg border bg-card p-3"
                      >
                        <div className="min-w-0">
                          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            Cell {pair.leftIndex + 1}
                          </div>
                          <div
                            className={cn(
                              "mt-0.5 text-sm font-semibold tabular-nums",
                              leftIsMin && "text-amber-600 dark:text-amber-400",
                              leftIsMax &&
                                "text-emerald-600 dark:text-emerald-400",
                            )}
                          >
                            {pair.leftValue?.toFixed(3) ?? "-"} V
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            {pair.rightValue != null
                              ? `Cell ${pair.rightIndex + 1}`
                              : "\u00A0"}
                          </div>
                          <div
                            className={cn(
                              "mt-0.5 text-sm font-semibold tabular-nums",
                              rightIsMin &&
                                "text-amber-600 dark:text-amber-400",
                              rightIsMax &&
                                "text-emerald-600 dark:text-emerald-400",
                            )}
                          >
                            {pair.rightValue?.toFixed(3) ?? "-"}
                            {pair.rightValue != null ? " V" : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                    No cell data available yet.
                  </div>
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto px-5 sm:block">
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Cell</TableHead>
                        <TableHead>Voltage (V)</TableHead>
                        <TableHead className="w-20">Cell</TableHead>
                        <TableHead>Voltage (V)</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {cellPairs.length ? (
                        cellPairs.map((pair) => {
                          const leftIsMin =
                            pair.leftValue === snapshot?.cellMin_V;
                          const leftIsMax =
                            pair.leftValue === snapshot?.cellMax_V;
                          const rightIsMin =
                            pair.rightValue === snapshot?.cellMin_V;
                          const rightIsMax =
                            pair.rightValue === snapshot?.cellMax_V;

                          return (
                            <TableRow key={pair.leftIndex}>
                              <TableCell className="font-medium tabular-nums">
                                {pair.leftIndex + 1}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "tabular-nums",
                                  leftIsMin &&
                                    "text-amber-600 dark:text-amber-400",
                                  leftIsMax &&
                                    "text-emerald-600 dark:text-emerald-400",
                                )}
                              >
                                {pair.leftValue?.toFixed(3) ?? "-"}
                              </TableCell>

                              <TableCell className="font-medium tabular-nums">
                                {pair.rightValue != null
                                  ? pair.rightIndex + 1
                                  : "-"}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "tabular-nums",
                                  rightIsMin &&
                                    "text-amber-600 dark:text-amber-400",
                                  rightIsMax &&
                                    "text-emerald-600 dark:text-emerald-400",
                                )}
                              >
                                {pair.rightValue?.toFixed(3) ?? "-"}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="py-10 text-center text-muted-foreground"
                          >
                            No cell data available yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>

                    <TableFooter className="bg-muted/30">
                      <TableRow>
                        <TableCell colSpan={3}>Sum of cells</TableCell>
                        <TableCell className="tabular-nums">
                          {fmt(snapshot?.packFromCells_V, "V", 3)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={3}>Cell spread</TableCell>
                        <TableCell className="tabular-nums">
                          {cellDelta
                            ? `${Math.round(cellDelta.deltaV * 1000)} mV`
                            : "-"}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </div>

              {cellDelta?.deltaV != null && cellDelta.deltaV > 0.03 ? (
                <div className="mt-4 px-5">
                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    Cell spread elevated. Check balancing and thermal
                    conditions.
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="min-w-0 self-start py-0">
            <CardHeader className="px-5 pt-5 pb-0">
              <CardTitle className="text-base">Connection</CardTitle>
              <CardDescription className="text-xs">
                Stream credentials and status
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3 px-5 py-4">
              <div className="rounded-lg border bg-card p-4">
                <Label htmlFor="pass" className="text-xs font-medium">
                  Access key
                </Label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="pass"
                    type="password"
                    placeholder="Enter key"
                    value={pass}
                    onChange={(event) => setPass(event.target.value)}
                    className="h-9"
                  />

                  {!connected ? (
                    <Button
                      type="button"
                      onClick={connect}
                      disabled={connecting || !pass.trim()}
                      className="h-9 sm:min-w-[100px]"
                    >
                      {connecting ? "Connecting..." : "Connect"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={disconnect}
                      disabled={connecting}
                      className="h-9 sm:min-w-[100px]"
                    >
                      Disconnect
                    </Button>
                  )}
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  Stored locally for auto-reconnect.
                </p>
              </div>

              <div className="grid gap-2">
                <InfoRow
                  label="State"
                  value={
                    connected
                      ? "Live"
                      : connecting
                        ? "Connecting"
                        : "Disconnected"
                  }
                  tone={connectionTone}
                />
                <InfoRow
                  label="Device"
                  value={device ? `${device.name} (${device.flavor})` : "None"}
                />
                <InfoRow
                  label="Health"
                  value={
                    lastError ? lastError : connected ? "Stable" : "Waiting"
                  }
                  tone={lastError ? "rose" : connected ? "emerald" : "slate"}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border bg-card p-3.5">
                  <div className="mb-1.5 flex items-center gap-2 text-xs font-medium">
                    {connected ? (
                      <Wifi className="size-3.5 text-emerald-500" />
                    ) : (
                      <WifiOff className="size-3.5 text-muted-foreground" />
                    )}
                    Stream
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {connected
                      ? "Live updates flowing."
                      : "Connect to start telemetry."}
                  </p>
                </div>

                <div className="rounded-lg border bg-card p-3.5">
                  <div className="mb-1.5 flex items-center gap-2 text-xs font-medium">
                    <ShieldAlert className="size-3.5 text-amber-500" />
                    Notice
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {lastError
                      ? lastError
                      : "Reconnect here if the stream stalls."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
