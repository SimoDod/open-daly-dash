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
              tickFormatter={(ts: string) => {
                const match = ts.match(/^(\d{1,2}):(\d{2}):\d{2} (\w{2})$/);
                if (!match) return ts;
                const [, hoursStr, minutes, period] = match;
                let h = parseInt(hoursStr, 10);
                if (period === "PM" && h < 12) h += 12;
                if (period === "AM" && h === 12) h = 0;
                return `${h.toString().padStart(2, "0")}:${minutes}`;
              }}
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
            <Tooltip />
            <Legend layout="horizontal" verticalAlign="top" align="center" />

            {showV && (
              <Line
                isAnimationActive={false}
                yAxisId="voltage"
                type="monotone"
                dataKey="v"
                name="Voltage (V)"
                dot={false}
                stroke="#2563eb"
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
