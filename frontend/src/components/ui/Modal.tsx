"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional line under the title. Rendered as the dialog's description. */
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** "drawer" slides in from the right on desktop, up from the bottom on mobile. */
  variant?: "modal" | "drawer";
}

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Hand-built dialog. No component library, deliberately.
 *
 * The four things a dialog has to get right, and how each is handled:
 *
 *  - Escape closes it. Listener is on the panel, not the document, and the
 *    keydown does not bubble - so a dialog opened from inside another dialog
 *    closes only itself.
 *  - Focus is trapped. Tab and Shift+Tab wrap at the ends of the focusable set,
 *    which is recomputed on each press because the content can change while open
 *    (a button becoming disabled mid-redeem would otherwise leave a stale trap).
 *  - Focus is restored. The element that opened the dialog is remembered and
 *    refocused on close, so keyboard position is never lost.
 *  - The page behind cannot scroll, and the scrollbar's width is compensated so
 *    the layout does not shift as it disappears.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "modal",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Remember the trigger before focus moves into the dialog.
  useEffect(() => {
    if (open) restoreFocusTo.current = document.activeElement as HTMLElement | null;
  }, [open]);

  // Lock the page behind, compensating for the scrollbar to prevent a shift.
  useEffect(() => {
    if (!open) return;
    const { body, documentElement } = document;
    const scrollbar = window.innerWidth - documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
    };
  }, [open]);

  // Move focus in, and hand it back on close.
  useEffect(() => {
    if (!open) {
      restoreFocusTo.current?.focus?.();
      return;
    }
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus();
  }, [open]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      // Recomputed every press: the focusable set is not stable while open.
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open || typeof document === "undefined") return null;

  const isDrawer = variant === "drawer";

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: isDrawer ? "var(--z-drawer)" : "var(--z-modal)",
        display: "flex",
        alignItems: isDrawer ? "stretch" : "center",
        justifyContent: isDrawer ? "flex-end" : "center",
        padding: isDrawer ? 0 : "var(--space-4)",
      }}
    >
      {/* Backdrop. A div, not the panel's parent click handler, so a click that
          starts inside the panel and ends outside does not close it. */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(6, 9, 13, 0.72)",
          backdropFilter: "blur(2px)",
          animation: "modal-fade var(--dur-med) var(--ease)",
        }}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{
          position: "relative",
          background: "var(--ink-850)",
          border: "var(--rule-strong)",
          borderRadius: isDrawer ? 0 : "var(--radius-lg)",
          boxShadow: "var(--shadow-pop)",
          width: "100%",
          maxWidth: isDrawer ? 420 : 460,
          maxHeight: isDrawer ? "100%" : "min(90vh, 720px)",
          display: "flex",
          flexDirection: "column",
          outline: "none",
          animation: `${isDrawer ? "drawer-in" : "modal-in"} var(--dur-med) var(--ease)`,
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--space-3)",
            padding: "var(--space-5)",
            borderBottom: "var(--rule)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              id={titleId}
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--text-lg)",
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </h2>
            {description && (
              <p
                id={descriptionId}
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--paper-400)",
                  marginTop: "var(--space-1)",
                }}
              >
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--paper-400)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: "var(--space-1)",
              borderRadius: "var(--radius-sm)",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </header>

        <div style={{ padding: "var(--space-5)", overflowY: "auto", flex: 1 }}>
          {children}
        </div>

        {footer && (
          <footer
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "var(--space-2)",
              padding: "var(--space-4) var(--space-5)",
              borderTop: "var(--rule)",
              background: "var(--ink-800)",
            }}
          >
            {footer}
          </footer>
        )}
      </div>

      <style>{`
        @keyframes modal-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes modal-in {
          from { opacity: 0; transform: translateY(8px) scale(0.98) }
          to { opacity: 1; transform: none }
        }
        @keyframes drawer-in {
          from { transform: translateX(24px); opacity: 0 }
          to { transform: none; opacity: 1 }
        }
        @media (max-width: 560px) {
          @keyframes drawer-in {
            from { transform: translateY(24px); opacity: 0 }
            to { transform: none; opacity: 1 }
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
