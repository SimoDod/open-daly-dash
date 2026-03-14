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

const toneStyles: Record<Tone, string> = {
  emerald:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  amber:
    "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  rose: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  sky: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  slate:
    "border-foreground/10 bg-foreground/[0.04] text-foreground/75 dark:text-foreground/80",
};

function StatusBadge({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide",
        toneStyles[tone],
      )}
    >
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
        "rounded-2xl border border-white/50 bg-background/70 p-4 shadow-sm shadow-black/5 backdrop-blur dark:border-white/10 dark:bg-background/40",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "grid size-9 place-items-center rounded-xl border",
            toneStyles[tone],
          )}
        >
          {icon}
        </span>
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? (
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
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
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-white/40 bg-background/70 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 dark:border-white/10 dark:bg-background/40">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 text-sm font-semibold sm:max-w-[65%] sm:text-right break-words",
          tone === "emerald" && "text-emerald-600 dark:text-emerald-300",
          tone === "amber" && "text-amber-600 dark:text-amber-300",
          tone === "rose" && "text-rose-600 dark:text-rose-300",
          tone === "sky" && "text-sky-600 dark:text-sky-300",
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
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary/20 bg-primary/12 text-foreground shadow-sm"
          : "border-border/70 bg-background/80 text-muted-foreground hover:bg-accent/60 hover:text-foreground",
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

  const connectionHealthTone: Tone = lastError
    ? "rose"
    : connected
      ? "emerald"
      : connecting
        ? "amber"
        : "slate";

  const connectionHealthLabel = lastError
    ? lastError
    : connected
      ? "Stable"
      : connecting
        ? "Negotiating stream"
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
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.14),transparent_38%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.9),transparent_60%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.18),transparent_30%),linear-gradient(180deg,rgba(0,0,0,0.28),transparent_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:linear-gradient(to_bottom,white,transparent_75%)]" />
      </div>

      <header className="sticky top-0 z-30 border-b border-white/50 bg-background/75 backdrop-blur-xl dark:border-white/10">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-3 sm:px-4 lg:px-6">
          <div className="grid size-10 place-items-center rounded-2xl border border-white/60 bg-white/70 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-white/5">
            <PlugZap className="size-5 text-primary" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight sm:text-base">
                BMS Dashboard
              </h1>
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {headerStatus}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-3 py-4 sm:gap-5 sm:px-4 sm:py-5 lg:px-6">
        <section>
          <Card className="relative min-w-0 overflow-hidden border-white/50 bg-card/85 py-0 shadow-xl shadow-black/5 backdrop-blur dark:border-white/10">
            <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-sky-400/10 blur-3xl" />
            <CardContent className="px-4 py-4 sm:px-5 sm:py-5">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={connectionHealthTone}>
                    Health Status: {connectionHealthLabel}
                  </StatusBadge>
                  <StatusBadge tone={healthTone}>
                    Cell delta{" "}
                    {cellDelta
                      ? `${Math.round(cellDelta.deltaV * 1000)} mV`
                      : "Unavailable"}
                  </StatusBadge>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex h-full min-w-0 flex-col justify-between rounded-[1.5rem] border border-white/60 bg-white/70 p-4 text-center shadow-lg shadow-black/5 dark:border-white/10 dark:bg-white/5">
                    <BatteryWithPercentage
                      socPercentage={snapshot?.soc_pct}
                      size={104}
                      className="mx-auto justify-center"
                    />
                    <div className="mt-2">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground sm:text-xs">
                        State of charge
                      </div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                        {fmt(snapshot?.soc_pct, "%", 0)}
                      </div>
                    </div>
                  </div>

                  <MetricCard
                    icon={<Zap className="size-4" />}
                    label="Power flow"
                    value={
                      power == null ? (
                        "N/A"
                      ) : (
                        <span
                          className={cn(
                            power > 0 &&
                              "text-emerald-600 dark:text-emerald-300",
                            power < 0 && "text-rose-600 dark:text-rose-300",
                          )}
                        >
                          {fmt(power, "W", 0)}
                        </span>
                      )
                    }
                    hint={
                      power == null
                        ? "Waiting for pack values"
                        : power > 0
                          ? "Pack is charging"
                          : power < 0
                            ? "Pack is discharging"
                            : "Pack is idle"
                    }
                    tone={powerTone}
                    className="h-full"
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <MetricCard
                    icon={<Zap className="size-4" />}
                    label="Pack voltage"
                    value={fmt(snapshot?.voltage_V, "V", 1)}
                    hint={
                      snapshot?.packFromCells_V != null
                        ? `Cell sum ${fmt(snapshot.packFromCells_V, "V", 3)}`
                        : "No summed cell voltage yet"
                    }
                    tone="sky"
                  />

                  <MetricCard
                    icon={<Plug className="size-4" />}
                    label="Current"
                    value={fmt(snapshot?.current_A, "A", 1)}
                    hint="Signed value for charge and discharge"
                    tone={powerTone}
                  />

                  <MetricCard
                    icon={<Thermometer className="size-4" />}
                    label="Thermal status"
                    value={avgTemp == null ? "N/A" : `${Math.round(avgTemp)}°C`}
                    hint={
                      temperatures.length
                        ? `${temperatures.length} sensors reporting`
                        : "No temperature probes reporting"
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
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
          <Card className="min-w-0 border-white/50 bg-card/85 py-0 shadow-xl shadow-black/5 backdrop-blur dark:border-white/10">
            <CardHeader className="gap-4 px-4 pt-4 pb-0 sm:px-5 sm:pt-5">
              <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-lg tracking-tight">
                    <History className="size-5" />
                    Telemetry timeline
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Switch time windows and data series without losing the live
                    chart context.
                  </CardDescription>
                </div>

                <div
                  className={cn(
                    "max-w-full overflow-x-auto rounded-2xl border border-white/50 bg-background/70 p-1 dark:border-white/10 dark:bg-background/40",
                    connecting && "pointer-events-none opacity-60",
                  )}
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
                  "flex flex-wrap gap-2",
                  connecting && "pointer-events-none opacity-60",
                )}
                aria-disabled={connecting}
              >
                <ToggleChip
                  active={showV}
                  onClick={() => setShowV((current) => !current)}
                  icon={<Zap className="size-4" />}
                  label="Voltage"
                  disabled={connecting}
                />
                <ToggleChip
                  active={showI}
                  onClick={() => setShowI((current) => !current)}
                  icon={<Plug className="size-4" />}
                  label="Current"
                  disabled={connecting}
                />
                <ToggleChip
                  active={showSoc}
                  onClick={() => setShowSoc((current) => !current)}
                  icon={<Battery className="size-4" />}
                  label="SoC"
                  disabled={connecting}
                />
                <ToggleChip
                  active={paused}
                  onClick={togglePause}
                  icon={
                    paused ? (
                      <Play className="size-4" />
                    ) : (
                      <Pause className="size-4" />
                    )
                  }
                  label={paused ? "Resume live" : "Pause live"}
                  disabled={connecting}
                />
              </div>
            </CardHeader>

            <CardContent className="min-w-0 px-2 py-4 sm:px-4 sm:py-5">
              <div className="overflow-hidden rounded-[1.5rem] border border-white/50 bg-background/80 px-2 py-4 shadow-inner shadow-black/5 dark:border-white/10 dark:bg-background/45">
                {Array.isArray(chartData) && chartData.length ? (
                  <LiveChart
                    data={chartData}
                    showV={showV}
                    showI={showI}
                    showSoc={showSoc}
                  />
                ) : (
                  <div className="flex h-72 items-center justify-center px-4 text-center text-sm text-muted-foreground sm:h-80">
                    No chart data available yet. Connect the BMS or wait for the
                    first snapshot to populate the timeline.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-0 border-white/50 bg-card/85 py-0 shadow-xl shadow-black/5 backdrop-blur dark:border-white/10">
            <CardHeader className="px-4 pt-4 pb-0 sm:px-5 sm:pt-5">
              <CardTitle className="flex items-center gap-2 text-lg tracking-tight">
                <Gauge className="size-5" />
                Pack state
              </CardTitle>
              <CardDescription>
                Quick diagnostics for thermal behavior, balancing activity, and
                operating mode.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3 px-4 py-4 sm:px-5 sm:py-5">
              <InfoRow
                label="Temperatures"
                value={
                  temperatures.length
                    ? temperatures.map((temp) => `${temp}°C`).join(", ")
                    : "No probe data"
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
                value={snapshot?.charging ? "Enabled" : "Idle"}
                tone={snapshot?.charging ? "emerald" : "slate"}
              />
              <InfoRow
                label="Discharging"
                value={snapshot?.discharging ? "Enabled" : "Idle"}
                tone={snapshot?.discharging ? "rose" : "slate"}
              />
              <InfoRow
                label="Balancing"
                value={
                  snapshot?.balancingActive ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      Active
                    </span>
                  ) : (
                    "Idle"
                  )
                }
                tone={snapshot?.balancingActive ? "sky" : "slate"}
              />

              <div className="rounded-2xl border border-white/40 bg-background/70 p-4 dark:border-white/10 dark:bg-background/40">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Activity className="size-4 text-primary" />
                  Balancing cells
                </div>
                {balanceCells.length ? (
                  <div className="flex flex-wrap gap-2">
                    {balanceCells.map((cell) => (
                      <span
                        key={cell}
                        className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300"
                      >
                        Cell {cell}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No balancing targets are currently active.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
          <Card className="min-w-0 border-white/50 bg-card/85 py-0 shadow-xl shadow-black/5 backdrop-blur dark:border-white/10">
            <CardHeader className="gap-4 px-4 pt-4 pb-0 sm:px-5 sm:pt-5 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <CardTitle className="text-lg tracking-tight">
                  Cell voltages
                </CardTitle>
                <CardDescription className="mt-1">
                  A denser but more readable view of individual cells, with pack
                  delta and summed voltage kept in the footer.
                </CardDescription>
              </div>

              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={connectionStatusTone}>
                  Connection {connectionStatusLabel}
                </StatusBadge>
                <StatusBadge tone={connectionHealthTone}>
                  Health {connectionHealthLabel}
                </StatusBadge>
                <StatusBadge tone={healthTone}>
                  Delta{" "}
                  {cellDelta
                    ? `${Math.round(cellDelta.deltaV * 1000)} mV`
                    : "Unavailable"}
                </StatusBadge>
                <StatusBadge tone="sky">
                  Sum {fmt(snapshot?.packFromCells_V, "V", 3)}
                </StatusBadge>
              </div>
            </CardHeader>

            <CardContent className="px-0 py-4 sm:py-5">
              <div className="grid gap-3 px-4 sm:hidden">
                {cellPairs.length ? (
                  cellPairs.map((pair) => {
                    const leftIsMin = pair.leftValue === snapshot?.cellMin_V;
                    const leftIsMax = pair.leftValue === snapshot?.cellMax_V;
                    const rightIsMin = pair.rightValue === snapshot?.cellMin_V;
                    const rightIsMax = pair.rightValue === snapshot?.cellMax_V;

                    return (
                      <div
                        key={pair.leftIndex}
                        className="rounded-2xl border border-white/40 bg-background/75 p-4 dark:border-white/10 dark:bg-background/45"
                      >
                        <div className="grid grid-cols-2 gap-4">
                          <div className="min-w-0">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                              Cell {pair.leftIndex + 1}
                            </div>
                            <div
                              className={cn(
                                "mt-1 text-base font-semibold",
                                leftIsMin &&
                                  "text-amber-600 dark:text-amber-300",
                                leftIsMax &&
                                  "text-emerald-600 dark:text-emerald-300",
                              )}
                            >
                              {pair.leftValue?.toFixed(3) ?? "-"} V
                            </div>
                          </div>

                          <div className="min-w-0">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                              {pair.rightValue != null
                                ? `Cell ${pair.rightIndex + 1}`
                                : "Cell"}
                            </div>
                            <div
                              className={cn(
                                "mt-1 text-base font-semibold",
                                rightIsMin &&
                                  "text-amber-600 dark:text-amber-300",
                                rightIsMax &&
                                  "text-emerald-600 dark:text-emerald-300",
                              )}
                            >
                              {pair.rightValue?.toFixed(3) ?? "-"}
                              {pair.rightValue != null ? " V" : ""}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-white/40 bg-background/75 px-4 py-8 text-center text-muted-foreground dark:border-white/10 dark:bg-background/45">
                    No cell data available yet.
                  </div>
                )}
              </div>

              <div className="hidden overflow-x-auto px-4 sm:block sm:px-5">
                <div className="overflow-hidden rounded-[1.5rem] border border-white/50 bg-background/75 dark:border-white/10 dark:bg-background/45">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/40 dark:border-white/10">
                        <TableHead className="w-24">Cell</TableHead>
                        <TableHead>Voltage (V)</TableHead>
                        <TableHead className="w-24">Cell</TableHead>
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
                            <TableRow
                              key={pair.leftIndex}
                              className="border-white/30 dark:border-white/10"
                            >
                              <TableCell className="font-medium">
                                {pair.leftIndex + 1}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  leftIsMin &&
                                    "text-amber-600 dark:text-amber-300",
                                  leftIsMax &&
                                    "text-emerald-600 dark:text-emerald-300",
                                )}
                              >
                                {pair.leftValue?.toFixed(3) ?? "-"}
                              </TableCell>

                              <TableCell className="font-medium">
                                {pair.rightValue != null
                                  ? pair.rightIndex + 1
                                  : "-"}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  rightIsMin &&
                                    "text-amber-600 dark:text-amber-300",
                                  rightIsMax &&
                                    "text-emerald-600 dark:text-emerald-300",
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
                        <TableCell>
                          {fmt(snapshot?.packFromCells_V, "V", 3)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={3}>Cell spread</TableCell>
                        <TableCell>
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
                <div className="mt-4 px-4 sm:px-5">
                  <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    Cell spread is elevated. Review balancing behavior and
                    thermal conditions if this persists.
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card className="min-w-0 self-start border-white/50 bg-card/85 py-0 shadow-xl shadow-black/5 backdrop-blur dark:border-white/10">
            <CardHeader className="px-4 pt-4 pb-0 sm:px-5 sm:pt-5">
              <CardTitle className="text-lg tracking-tight">
                Connection
              </CardTitle>
              <CardDescription>
                Keep the stream credentials, connection state, and main actions
                in one predictable place.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
              <div className="rounded-2xl border border-white/50 bg-background/70 p-4 dark:border-white/10 dark:bg-background/40">
                <Label htmlFor="pass" className="text-sm font-medium">
                  Access key
                </Label>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <Input
                    id="pass"
                    type="password"
                    placeholder="Enter dashboard key"
                    value={pass}
                    onChange={(event) => setPass(event.target.value)}
                    className="h-11 border-white/50 bg-white/80 dark:border-white/10 dark:bg-white/5"
                  />

                  {!connected ? (
                    <Button
                      type="button"
                      onClick={connect}
                      disabled={connecting || !pass.trim()}
                      className="h-11 sm:min-w-32"
                    >
                      {connecting ? "Connecting..." : "Connect"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={disconnect}
                      disabled={connecting}
                      className="h-11 sm:min-w-32"
                    >
                      Disconnect
                    </Button>
                  )}
                </div>

                <p className="mt-3 text-sm text-muted-foreground">
                  The dashboard stores the key locally so the stream can
                  reconnect automatically on refresh.
                </p>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <InfoRow
                  label="Connection state"
                  value={
                    connected
                      ? "Live stream active"
                      : connecting
                        ? "Connecting to BMS"
                        : "Disconnected"
                  }
                  tone={connectionTone}
                />
                <InfoRow
                  label="Device"
                  value={
                    device
                      ? `${device.name} (${device.flavor})`
                      : "No device reported yet"
                  }
                />
                <InfoRow
                  label="Network health"
                  value={
                    lastError
                      ? lastError
                      : connected
                        ? "Stable"
                        : "Waiting for connection"
                  }
                  tone={lastError ? "rose" : connected ? "emerald" : "slate"}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/40 bg-background/70 p-4 dark:border-white/10 dark:bg-background/40">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    {connected ? (
                      <Wifi className="size-4 text-emerald-500" />
                    ) : (
                      <WifiOff className="size-4 text-muted-foreground" />
                    )}
                    Stream
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {connected
                      ? "Live updates are flowing from the server-sent event stream."
                      : "Connect to start telemetry, history refresh, and pack state updates."}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/40 bg-background/70 p-4 dark:border-white/10 dark:bg-background/40">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <ShieldAlert className="size-4 text-amber-500" />
                    Attention
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {lastError
                      ? lastError
                      : "If the stream stalls, disconnect and reconnect from here instead of refreshing the whole page."}
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
