import type { TxnStatus } from "@/lib/types";

const STATUS_STYLE: Record<TxnStatus, { fg: string; bg: string; label: string }> = {
  SUCCESS: { fg: "var(--ok-400)", bg: "var(--ok-bg)", label: "Paid" },
  PENDING: { fg: "var(--wait-400)", bg: "var(--wait-bg)", label: "Pending" },
  FAILED: { fg: "var(--fail-400)", bg: "var(--fail-bg)", label: "Failed" },
};

/**
 * Status as a stamped mark, the way a passbook stamps a cleared entry.
 * Labelled in user language: the data says SUCCESS, a person says "Paid".
 */
export function StatusChip({ status }: { status: TxnStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "1px var(--space-2)",
        fontSize: "var(--text-2xs)",
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: s.fg,
        background: s.bg,
        border: `1px solid ${s.fg}33`,
        borderRadius: "var(--radius-sm)",
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

export function Tag({
  children,
  tone = "neutral",
  title,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warn" | "brass";
  title?: string;
}) {
  const tones = {
    neutral: { fg: "var(--paper-400)", bg: "var(--ink-750)", bd: "var(--ink-600)" },
    warn: { fg: "var(--wait-400)", bg: "var(--wait-bg)", bd: "var(--wait-400)" },
    brass: { fg: "var(--brass-300)", bg: "var(--brass-glow)", bd: "var(--brass-500)" },
  }[tone];

  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "1px var(--space-2)",
        fontSize: "var(--text-2xs)",
        fontWeight: 500,
        color: tones.fg,
        background: tones.bg,
        border: `1px solid ${tones.bd}55`,
        borderRadius: "var(--radius-sm)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
