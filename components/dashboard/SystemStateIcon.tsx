import React from "react";

export function SystemStateIcon({ state }: { state?: number | string | null }) {
  const s = state == null ? "unknown" : String(state).toLowerCase();
  const color =
    s === "0" || s === "ok"
      ? "bg-emerald-500"
      : s === "1" || s === "warn"
      ? "bg-amber-500"
      : s === "2" || s === "fault"
      ? "bg-red-600"
      : "bg-gray-400";

  return (
    <span
      className={`w-4 h-4 inline-block rounded-full ${color}`}
      aria-hidden
    />
  );
}
