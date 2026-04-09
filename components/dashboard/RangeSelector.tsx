import React from "react";
import type { RangeKey } from "@/lib/types/bms";
import { cn } from "@/lib/utils";

export function RangeSelector({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (value: RangeKey) => void;
}) {
  const btn = (key: RangeKey, label: string) => (
    <button
      type="button"
      key={key}
      onClick={() => onChange(key)}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
        value === key
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
      aria-pressed={value === key}
    >
      {label}
    </button>
  );

  return (
    <div className="inline-flex gap-0.5 rounded-lg bg-secondary p-0.5">
      {btn("1h", "1h")}
      {btn("6h", "6h")}
      {btn("24h", "24h")}
      {btn("1w", "1w")}
    </div>
  );
}
