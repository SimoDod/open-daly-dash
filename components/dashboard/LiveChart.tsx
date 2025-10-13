/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React from "react";
import type { Point } from "@/lib/types/bms";
import dynamic from "next/dynamic";
import { extent } from "d3-array";

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
import { Legend } from "recharts";
const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false }
);
const Brush = dynamic(() => import("recharts").then((m) => m.Brush), {
  ssr: false,
});

function formatTimestamp(ts: string | number): string {
  let timestamp: number | Date;

  if (typeof ts === "string") {
    timestamp = new Date(ts); // Try direct parse for ISO or similar
    if (!isNaN(timestamp.getTime())) {
      return timestamp.toLocaleTimeString(); // Success: e.g., "2024-10-13T12:34:56"
    }
    // Fallback to numeric parse
    const num = Number(ts);
    if (isNaN(num)) {
      return ts; // Completely invalid, show original
    }
    timestamp = num;
  } else {
    timestamp = ts; // Already a number
  }

  const numTs = Number(timestamp);
  const digits = Math.floor(Math.log10(numTs) + 1);
  const adjustedTs = digits <= 11 && digits >= 9 ? numTs * 1000 : numTs;

  const date = new Date(adjustedTs);
  if (isNaN(date.getTime())) {
    return String(ts);
  }
  return date.toLocaleTimeString();
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-2 border border-gray-300 rounded shadow">
        <p className="font-bold">{formatTimestamp(label)}</p>
        {payload.map((entry: any) => (
          <p key={entry.name} style={{ color: entry.stroke }}>
            {`${entry.name}: ${entry.value.toFixed(2)}${
              entry.name.includes("SoC")
                ? "%"
                : entry.name.includes("Voltage")
                ? "V"
                : "A"
            }`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const LiveChartComponent = ({
  data,
  showV,
  showI,
  showSoc,
}: {
  data: Point[];
  showV: boolean;
  showI: boolean;
  showSoc: boolean;
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 sm:h-72 md:h-80 flex items-center justify-center text-gray-500">
        No data available
      </div>
    );
  }

  // Dynamic domains with padding
  const voltageExtent = extent(data, (d) => d.v) as [number, number];
  const currentExtent = extent(data, (d) => d.i) as [number, number];
  const voltageDomain = voltageExtent
    ? [voltageExtent[0] * 0.95, voltageExtent[1] * 1.05]
    : [0, 100];
  const currentDomain = currentExtent
    ? [currentExtent[0] * 0.95, currentExtent[1] * 1.05]
    : [-50, 50]; // Adjust based on expected ranges

  return (
    <div className="w-full" aria-label="Live Battery Metrics Chart">
      <div className="h-64 sm:h-72 md:h-80 ">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="ts"
              minTickGap={20}
              tickFormatter={formatTimestamp}
              label={{ position: "insideBottom", offset: -5 }}
            />
            {showV && (
              <YAxis
                yAxisId="voltage"
                domain={voltageDomain}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
            )}

            <YAxis
              yAxisId="current"
              orientation="left"
              domain={currentDomain}
              label={{
                angle: 90,
                position: "insideRight",
              }}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            <YAxis
              yAxisId="soc"
              orientation="right"
              domain={[0, 100]}
              x={30}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend layout="horizontal" verticalAlign="top" align="center" />
            {data.length > 100 && (
              <Brush dataKey="ts" height={20} stroke="#8884d8" />
            )}
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
                connectNulls={false}
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
                connectNulls={false}
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
                connectNulls={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const LiveChart = React.memo(LiveChartComponent);
