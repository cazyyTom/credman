"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "coin";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const base: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-2)",
  fontFamily: "var(--font-body)",
  fontWeight: 500,
  border: "1px solid transparent",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  transition: "background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease), opacity var(--dur-fast) var(--ease)",
  whiteSpace: "nowrap",
};

const sizes: Record<Size, React.CSSProperties> = {
  sm: { padding: "var(--space-1) var(--space-3)", fontSize: "var(--text-xs)", minHeight: 30 },
  md: { padding: "var(--space-2) var(--space-4)", fontSize: "var(--text-sm)", minHeight: 38 },
};

const variants: Record<Variant, React.CSSProperties> = {
  primary: { background: "var(--indigo-500)", color: "#fff" },
  secondary: { background: "var(--ink-750)", color: "var(--paper-50)", borderColor: "var(--ink-600)" },
  ghost: { background: "transparent", color: "var(--paper-400)" },
  // Brass, for anything that spends coins. The colour is the affordance.
  coin: { background: "var(--brass-400)", color: "var(--ink-900)", fontWeight: 600 },
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  children,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...rest}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      data-variant={variant}
      style={{
        ...base,
        ...sizes[size],
        ...variants[variant],
        opacity: isDisabled ? 0.5 : 1,
        cursor: isDisabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <>
      <span
        aria-hidden="true"
        style={{
          width: 12,
          height: 12,
          border: "2px solid currentColor",
          borderTopColor: "transparent",
          borderRadius: "50%",
          animation: "spin 700ms linear infinite",
          flexShrink: 0,
        }}
      />
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </>
  );
}
