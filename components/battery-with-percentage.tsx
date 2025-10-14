import React from "react";

type Props = {
  socPercentage?: number | null;
  size?: number; // in px, default 56
  className?: string;
  showLabel?: boolean; // show numeric text inside
};

export default function BatteryWithPercentage({
  socPercentage,
  size = 56,
  className = "",
  showLabel = true,
}: Props) {
  const raw = socPercentage == null ? null : Number(socPercentage);
  const pct =
    raw == null || Number.isNaN(raw) ? null : Math.max(0, Math.min(100, raw));

  const getColor = (p: number | null) => {
    if (p == null) return "#9ca3af"; // gray for unknown
    if (p > 60) return "#10b981"; // green
    if (p > 30) return "#f59e0b"; // amber
    return "#ef4444"; // red
  };

  const color = getColor(pct);

  // SVG circle math: circumference = 2πr
  // we'll make ring strokeWidth relative to size
  const strokeWidth = Math.max(2, Math.round(size * 0.12));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = pct == null ? 0 : (pct / 100) * circumference;

  const ariaLabel =
    pct == null
      ? "State of charge unknown"
      : `State of charge ${Math.round(pct)} percent`;

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      style={{ width: size, height: size }}
      className={`relative inline-grid place-items-center rounded-full ${className}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        focusable={false}
      >
        <defs>
          <linearGradient id="batteryGradient" x1="0%" x2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#batteryGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${Math.max(
            1,
            circumference - progress
          )}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: "stroke-dasharray 380ms ease, stroke 380ms ease",
          }}
          fill="none"
        />

        {/* small inner circle for subtle inset */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={Math.max(2, radius - strokeWidth * 0.6)}
          fill="#ffffff00"
          stroke="transparent"
        />
      </svg>

      {showLabel && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span
            className="leading-none text-sm font-bold"
            style={{
              color: pct == null ? "#6b7280" : color,
            }}
          >
            {pct == null ? "—" : `${pct.toFixed(1)}`}
          </span>
        </div>
      )}
    </div>
  );
}
