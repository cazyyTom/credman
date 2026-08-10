import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  /** Short line under the title. One job: say what the card is showing. */
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  style?: React.CSSProperties;
}

export function Card({ title, hint, action, children, padded = true, style }: CardProps) {
  return (
    <section
      style={{
        background: "var(--ink-850)",
        border: "var(--rule)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        overflow: "hidden",
        ...style,
      }}
    >
      {(title || action) && (
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "var(--space-3)",
            padding: "var(--space-4) var(--space-5)",
            borderBottom: "var(--rule)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && (
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--text-base)",
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                }}
              >
                {title}
              </h2>
            )}
            {hint && (
              <p style={{ fontSize: "var(--text-xs)", color: "var(--paper-500)", marginTop: 2 }}>
                {hint}
              </p>
            )}
          </div>
          {action}
        </header>
      )}
      <div
        style={{
          padding: padded ? "var(--space-5)" : 0,
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </section>
  );
}
