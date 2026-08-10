/** Display formatting. Kept in one place so money never renders two ways. */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrExact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const coins = new Intl.NumberFormat("en-IN");

/** Rupees, no paise. For table cells and chart axes where columns must align. */
export function money(value: string | number): string {
  return inr.format(Number(value));
}

/** Rupees with paise. For the detail view, where the exact figure matters. */
export function moneyExact(value: string | number): string {
  return inrExact.format(Number(value));
}

/**
 * Indian short scale: 1,00,000 -> 1L, 1,00,00,000 -> 1Cr.
 * Used for chart axes and summary figures, where "Rs.6.8Cr" is legible and
 * "Rs.6,84,07,240" is not.
 */
export function moneyCompact(value: string | number): string {
  const n = Number(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

export function coinCount(value: number): string {
  return coins.format(value);
}

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function shortDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  return `${dateFmt.format(d)}, ${timeFmt.format(d)}`;
}

/** "2026-03" -> "Mar 26". Compact enough for a 14-point axis on mobile. */
export function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const name = names[Number(m) - 1] ?? month;
  return `${name} ${year?.slice(2) ?? ""}`;
}

/** NULL category has to render as something. It renders as this, everywhere. */
export const UNCATEGORISED = "Uncategorised";

export function categoryLabel(category: string | null): string {
  return category ?? UNCATEGORISED;
}

/** Stable category -> chart colour, so a slice keeps its colour across filters. */
const CHART_VARS = [
  "var(--chart-1)","var(--chart-2)","var(--chart-3)","var(--chart-4)","var(--chart-5)",
  "var(--chart-6)","var(--chart-7)","var(--chart-8)","var(--chart-9)","var(--chart-10)",
];

export function categoryColour(category: string | null, index: number): string {
  if (category === null) return "var(--chart-null)";
  return CHART_VARS[index % CHART_VARS.length] ?? "var(--chart-1)";
}
