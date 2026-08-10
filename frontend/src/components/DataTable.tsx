"use client";

import { useId, type ReactNode } from "react";

import { Button } from "./ui/Button";

export interface Column<T> {
  key: string;
  header: string;
  /** Cell content. Kept a render function so the table stays data-agnostic. */
  render: (row: T) => ReactNode;
  align?: "left" | "right";
  width?: string;
  sortable?: boolean;
  /**
   * Drop this column below the given viewport width. Columns are removed in
   * priority order rather than the table scrolling sideways: a horizontally
   * scrolling table on a phone hides the amount, which is the one thing the
   * user came to see.
   */
  hideBelow?: 560 | 760 | 1024;
  /** Header-only label for screen readers when the visible header is an icon. */
  srHeader?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  caption: string;
  onRowClick?: (row: T) => void;
  sortKey?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (key: string) => void;
  /** First load, nothing on screen yet. Renders skeleton rows. */
  loading?: boolean;
  /** Refetch with data still on screen. Dims slightly, does not unmount. */
  refreshing?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
  /** Rows rendered as skeletons during first load. */
  skeletonRows?: number;
  /** Caps the scroll area so the sticky header has something to stick to. */
  maxBodyHeight?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  onRowClick,
  sortKey,
  sortOrder = "desc",
  onSort,
  loading = false,
  refreshing = false,
  error = null,
  onRetry,
  emptyTitle = "Nothing here",
  emptyHint,
  emptyAction,
  skeletonRows = 12,
  maxBodyHeight = "min(60vh, 620px)",
}: DataTableProps<T>) {
  const scope = useId().replace(/[^a-zA-Z0-9]/g, "");
  const cls = `dt-${scope}`;

  // --- Error takes precedence over everything. A stale table above an error
  // message invites the user to trust numbers that may be wrong.
  if (error) {
    return (
      <Panel>
        <Glyph tone="fail">!</Glyph>
        <PanelTitle>Couldn&apos;t load these payments</PanelTitle>
        <PanelText>{error.message}</PanelText>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry} style={{ marginTop: "var(--space-4)" }}>
            Try again
          </Button>
        )}
      </Panel>
    );
  }

  const isEmpty = !loading && rows.length === 0;

  return (
    <div className={cls} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <style>{tableCss(cls, columns)}</style>

      <div
        className={`${cls}__scroll`}
        style={{ maxHeight: maxBodyHeight }}
        // Scrollable regions need to be reachable and scrollable by keyboard.
        tabIndex={0}
        role="region"
        aria-label={caption}
      >
        <table className={`${cls}__table`}>
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                const canSort = col.sortable && onSort;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    data-col={col.key}
                    data-align={col.align ?? "left"}
                    aria-sort={isSorted ? (sortOrder === "asc" ? "ascending" : "descending") : undefined}
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        className={`${cls}__sort`}
                        onClick={() => onSort(col.key)}
                        data-active={isSorted || undefined}
                      >
                        <span>{col.header}</span>
                        <span aria-hidden="true" className={`${cls}__arrow`}>
                          {isSorted ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                        <span className="visually-hidden">
                          {isSorted
                            ? `, sorted ${sortOrder === "asc" ? "ascending" : "descending"}. Activate to reverse.`
                            : ", not sorted. Activate to sort."}
                        </span>
                      </button>
                    ) : (
                      <>
                        <span aria-hidden={col.srHeader ? "true" : undefined}>{col.header}</span>
                        {col.srHeader && <span className="visually-hidden">{col.srHeader}</span>}
                      </>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody data-refreshing={refreshing || undefined}>
            {loading
              ? Array.from({ length: skeletonRows }, (_, i) => (
                  <tr key={`skeleton-${i}`} className={`${cls}__skeleton`} aria-hidden="true">
                    {columns.map((col) => (
                      <td key={col.key} data-col={col.key} data-align={col.align ?? "left"}>
                        {/* Varying widths so the placeholder reads as text, not as a
                            progress bar the user might wait on. */}
                        <span
                          className={`${cls}__shimmer`}
                          style={{ width: `${55 + ((i * 13 + col.key.length * 7) % 40)}%` }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => {
                  const interactive = Boolean(onRowClick);
                  return (
                    <tr
                      key={rowKey(row)}
                      onClick={interactive ? () => onRowClick!(row) : undefined}
                      onKeyDown={
                        interactive
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onRowClick!(row);
                              }
                            }
                          : undefined
                      }
                      // A row is the interactive element here, so it takes the
                      // button role and a tab stop rather than nesting a button
                      // inside every cell.
                      tabIndex={interactive ? 0 : undefined}
                      role={interactive ? "button" : undefined}
                      data-interactive={interactive || undefined}
                    >
                      {columns.map((col) => (
                        <td key={col.key} data-col={col.key} data-align={col.align ?? "left"}>
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>

        {isEmpty && (
          <Panel>
            <Glyph tone="neutral">∅</Glyph>
            <PanelTitle>{emptyTitle}</PanelTitle>
            {emptyHint && <PanelText>{emptyHint}</PanelText>}
            {emptyAction && <div style={{ marginTop: "var(--space-4)" }}>{emptyAction}</div>}
          </Panel>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Panel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "var(--space-12) var(--space-5)",
        minHeight: 240,
      }}
    >
      {children}
    </div>
  );
}

function Glyph({ children, tone }: { children: ReactNode; tone: "fail" | "neutral" }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 36,
        height: 36,
        display: "grid",
        placeItems: "center",
        borderRadius: "var(--radius-full)",
        marginBottom: "var(--space-3)",
        fontSize: 16,
        fontWeight: 700,
        color: tone === "fail" ? "var(--fail-400)" : "var(--paper-500)",
        background: tone === "fail" ? "var(--fail-bg)" : "var(--ink-750)",
        border: `1px solid ${tone === "fail" ? "var(--fail-400)" : "var(--ink-600)"}55`,
      }}
    >
      {children}
    </div>
  );
}

function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        fontFamily: "var(--font-display)",
        fontSize: "var(--text-base)",
        fontWeight: 600,
      }}
    >
      {children}
    </p>
  );
}

function PanelText({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        fontSize: "var(--text-sm)",
        color: "var(--paper-400)",
        marginTop: "var(--space-1)",
        maxWidth: "42ch",
      }}
    >
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------- */

function tableCss<T>(cls: string, columns: Column<T>[]): string {
  // Responsive column dropping, generated from the column definitions so the
  // breakpoints live with the data and cannot drift out of sync.
  const responsive = ([560, 760, 1024] as const)
    .map((breakpoint) => {
      const selectors = columns
        .filter((column) => column.hideBelow === breakpoint)
        .map((column) => `.${cls} [data-col="${column.key}"]`)
        .join(",");
      if (!selectors) return "";
      return `@media (max-width:${breakpoint - 1}px){${selectors}{display:none}}`;
    })
    .join("\n");

  return `
.${cls}__scroll{
  overflow:auto;
  border-radius:var(--radius-md);
  /* Contains the sticky header and gives the scroll region a paint boundary. */
  contain:paint;
}
.${cls}__table{
  width:100%;
  border-collapse:separate;
  border-spacing:0;
  font-size:var(--text-sm);
}

/* --- Header: sticky, and opaque so rows cannot show through as they pass --- */
.${cls}__table thead th{
  position:sticky;
  top:0;
  z-index:2;
  background:var(--ink-800);
  color:var(--paper-400);
  font-family:var(--font-body);
  font-size:var(--text-2xs);
  font-weight:600;
  letter-spacing:0.06em;
  text-transform:uppercase;
  text-align:left;
  padding:var(--space-3) var(--space-4);
  white-space:nowrap;
  /* box-shadow rather than border-bottom: a border on a sticky cell scrolls
     away with the cell in several browsers, leaving the header edgeless. */
  box-shadow:inset 0 -1px 0 var(--ink-600);
}
.${cls}__table thead th[data-align="right"]{text-align:right}

.${cls}__sort{
  display:inline-flex;
  align-items:center;
  gap:var(--space-1);
  background:none;
  border:none;
  padding:0;
  margin:0;
  font:inherit;
  letter-spacing:inherit;
  text-transform:inherit;
  color:inherit;
  cursor:pointer;
  border-radius:var(--radius-sm);
}
.${cls}__table thead th[data-align="right"] .${cls}__sort{flex-direction:row-reverse}
.${cls}__sort:hover{color:var(--paper-50)}
.${cls}__sort[data-active]{color:var(--paper-50)}
.${cls}__arrow{
  font-size:10px;
  opacity:0.45;
  transition:opacity var(--dur-fast) var(--ease);
}
.${cls}__sort[data-active] .${cls}__arrow{opacity:1;color:var(--indigo-300)}
.${cls}__sort:hover .${cls}__arrow{opacity:0.9}

/* --- Rows: hairline rules, the ledger's own device -------------------------- */
.${cls}__table tbody td{
  padding:var(--space-3) var(--space-4);
  border-bottom:1px solid var(--ink-750);
  color:var(--paper-200);
  vertical-align:middle;
}
.${cls}__table tbody td[data-align="right"]{text-align:right}
.${cls}__table tbody tr:last-child td{border-bottom:none}

.${cls}__table tbody tr[data-interactive]{
  cursor:pointer;
  transition:background var(--dur-fast) var(--ease);
}
.${cls}__table tbody tr[data-interactive]:hover{background:var(--ink-800)}
/* Focus is drawn as an inset ring on the cells: an outline on a <tr> is not
   reliably painted, since a table row has no box of its own to outline. */
.${cls}__table tbody tr[data-interactive]:focus{outline:none}
.${cls}__table tbody tr[data-interactive]:focus-visible td{
  background:var(--ink-800);
  box-shadow:inset 0 1px 0 var(--indigo-400),inset 0 -1px 0 var(--indigo-400);
}
.${cls}__table tbody tr[data-interactive]:focus-visible td:first-child{
  box-shadow:inset 1px 1px 0 var(--indigo-400),inset 0 -1px 0 var(--indigo-400);
}
.${cls}__table tbody tr[data-interactive]:focus-visible td:last-child{
  box-shadow:inset -1px 1px 0 var(--indigo-400),inset 0 -1px 0 var(--indigo-400);
}

/* --- Refreshing: dim, do not unmount --------------------------------------- */
.${cls}__table tbody[data-refreshing]{
  opacity:0.55;
  transition:opacity var(--dur-med) var(--ease);
}

/* --- Skeletons ------------------------------------------------------------- */
.${cls}__shimmer{
  display:block;
  height:11px;
  border-radius:var(--radius-sm);
  background:linear-gradient(90deg,var(--ink-750) 25%,var(--ink-700) 50%,var(--ink-750) 75%);
  background-size:200% 100%;
  animation:${cls}-shimmer 1.4s ease-in-out infinite;
}
.${cls}__skeleton td[data-align="right"] .${cls}__shimmer{margin-left:auto}
@keyframes ${cls}-shimmer{
  from{background-position:200% 0}
  to{background-position:-200% 0}
}
@media (prefers-reduced-motion:reduce){
  .${cls}__shimmer{animation:none;background:var(--ink-750)}
}

/* --- Narrow viewports ------------------------------------------------------ */
${responsive}
@media (max-width:560px){
  .${cls}__table thead th,.${cls}__table tbody td{
    padding:var(--space-3) var(--space-3);
  }
  .${cls}__table{font-size:var(--text-xs)}
}
/* 360px is the floor the brief asks for. Tighten padding rather than let the
   amount column wrap onto two lines. */
@media (max-width:380px){
  .${cls}__table thead th,.${cls}__table tbody td{
    padding:var(--space-2) var(--space-2);
  }
}
`;
}
