export function fmt(v?: number, unit?: string, toFixed = 2) {
  if (v == null || Number.isNaN(v)) return "—";
  const n = Number(v);
  if (unit === "%") return `${n.toFixed(1)}${unit ? " " + unit : ""}`;
  if (Math.abs(n) >= 1000) return `${Math.round(n)}${unit ? " " + unit : ""}`;
  return `${Number(n.toFixed(toFixed))}${unit ? " " + unit : ""}`;
}
