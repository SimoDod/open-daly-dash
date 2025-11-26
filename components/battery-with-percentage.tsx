"use client";

import React from "react";

type Props = {
  socPercentage?: number | null;
  size?: number; // width in px, default 48
  className?: string;
  showLabel?: boolean;
};

export default function BatteryReal({
  socPercentage,
  size = 60,
  className = "",
  showLabel = true,
}: Props) {
  const raw = socPercentage == null ? null : Number(socPercentage);
  const pct =
    raw == null || Number.isNaN(raw) ? null : Math.max(0, Math.min(100, raw));

  const level = pct == null ? 0 : pct;

  const getColorClass = (p: number | null) => {
    if (p == null) return "bg-gray-400";
    if (p > 60) return "bg-green-500/60";
    if (p > 30) return "bg-amber-500/60";
    return "bg-red-500/50";
  };

  const fillColor = getColorClass(pct);

  // proportions
  const height = Math.round(size * 0.42); // battery body height
  const capWidth = Math.max(2, Math.round(size * 0.04));

  const ariaLabel =
    pct == null
      ? "Battery state unknown"
      : `Battery ${Math.round(pct)} percent`;

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      style={{ width: size, height }}
      className={`relative flex items-center my-4 ${className}`}
    >
      {/* Battery body */}
      <div
        className={`relative flex-1 h-full rounded-[4px] border border-muted-foreground/30 bg-muted/10 overflow-hidden`}
        style={{ marginRight: capWidth }}
      >
        {/* Background track */}
        <div className="absolute inset-0 bg-transparent" />

        {/* Fill */}
        <div
          className={`absolute left-0 top-0 bottom-0 ${fillColor}`}
          style={{ width: `${level}%`, transition: "width 360ms ease" }}
        />

        {/* Inner gloss / stripe for 'real' look */}
        <div
          aria-hidden
          className="absolute left-0 top-0 bottom-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.00))",
            mixBlendMode: "overlay",
          }}
        />

        {/* Percentage text */}
        {showLabel && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="font-semibold leading-none text-foreground">
              {pct == null ? "—" : `${pct}`}
            </span>
          </div>
        )}
      </div>

      {/* Battery cap */}
      <div
        aria-hidden
        style={{ width: capWidth, height: Math.round(height * 0.62) }}
        className="rounded-sm border border-muted-foreground/30 bg-muted/10"
      />
    </div>
  );
}
