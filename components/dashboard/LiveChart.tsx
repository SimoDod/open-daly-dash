"use client";

import React from "react";
import type { Point } from "@/lib/types/bms";
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
import { Legend } from "recharts";
const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false }
);

export function LiveChart({
  data,
  showV,
  showI,
  showSoc,
}: {
  data: Point[];
  showV: boolean;
  showI: boolean;
  showSoc: boolean;
}) {
  return (
    <div className="w-full">
      <div className="h-64 sm:h-72 md:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="ts" minTickGap={20} />
            <YAxis yAxisId="voltage" />
            <YAxis yAxisId="current" orientation="right" />
            <YAxis
              yAxisId="soc"
              orientation="right"
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
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
}
