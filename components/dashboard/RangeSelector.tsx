import React from "react";
import type { RangeKey } from "@/lib/types/bms";

export function RangeSelector({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (value: RangeKey) => void;
}) {
  const btn = (key: RangeKey, label: string) => (
    <button
      key={key}
      onClick={() => onChange(key)}
      className={`px-2 py-1 text-xs rounded ${
        value === key ? "bg-foreground/8 font-semibold" : "bg-muted/5"
      }`}
      aria-pressed={value === key}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-1">
      {btn("1h", "1h")}
      {btn("6h", "6h")}
      {btn("24h", "24h")}
      {btn("1w", "1w")}
    </div>
  );
}
