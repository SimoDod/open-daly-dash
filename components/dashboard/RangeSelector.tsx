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
        "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
        value === key
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
      )}
      aria-pressed={value === key}
    >
      {label}
    </button>
  );

  return (
    <div className="grid grid-cols-2 gap-1 rounded-[1rem] bg-background/80 p-1 sm:flex sm:flex-wrap dark:bg-background/50">
      {btn("1h", "1h")}
      {btn("6h", "6h")}
      {btn("24h", "24h")}
      {btn("1w", "1w")}
    </div>
  );
}
