"use client";

import { useId } from "react";

import { categoryLabel } from "@/lib/format";
import type { Filters, FilterOptions, TxnStatus } from "@/lib/types";
import { countActiveFilters, EMPTY_FILTERS } from "@/lib/types";
import { Button } from "./ui/Button";

interface FilterBarProps {
  filters: Filters;
  onChange: (next: Filters) => void;
  options: FilterOptions | null;
  /** Number of rows the current filters match, for the summary line. */
  matchCount: number | null;
  busy?: boolean;
}

const STATUS_LABEL: Record<TxnStatus, string> = {
  SUCCESS: "Paid",
  PENDING: "Pending",
  FAILED: "Failed",
};

export function FilterBar({ filters, onChange, options, matchCount, busy }: FilterBarProps) {
  const searchId = useId();
  const activeCount = countActiveFilters(filters);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  const toggle = <K extends "categories" | "statuses" | "paymentMethods">(
    key: K,
    value: string,
  ) => {
    const current = filters[key] as string[];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ ...filters, [key]: next as Filters[K] });
  };

  return (
    <div className="filterbar">
      <style>{css}</style>

      {/* Search. Type-as-you-go; the request is debounced upstream, not the input. */}
      <div className="filterbar__row">
        <div className="filterbar__search">
          <label htmlFor={searchId} className="visually-hidden">
            Search merchants
          </label>
          <span className="filterbar__search-icon" aria-hidden="true">
            ⌕
          </span>
          <input
            id={searchId}
            type="search"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Search merchants"
            autoComplete="off"
            spellCheck={false}
          />
          {filters.search && (
            <button
              type="button"
              className="filterbar__clear-search"
              onClick={() => set("search", "")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="filterbar__summary" role="status" aria-live="polite">
          {matchCount === null ? (
            <span className="filterbar__muted">Loading…</span>
          ) : (
            <>
              <strong className="mono">{matchCount.toLocaleString("en-IN")}</strong>{" "}
              <span className="filterbar__muted">
                {matchCount === 1 ? "payment" : "payments"}
                {activeCount > 0 && ` · ${activeCount} filter${activeCount === 1 ? "" : "s"}`}
              </span>
            </>
          )}
        </div>

        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear all
          </Button>
        )}
      </div>

      {/* Status. Three values, so they are always visible as toggles rather than
          hidden behind a dropdown. */}
      <div className="filterbar__row">
        <Group label="Status">
          {(["SUCCESS", "PENDING", "FAILED"] as TxnStatus[]).map((status) => (
            <Pill
              key={status}
              active={filters.statuses.includes(status)}
              onClick={() => toggle("statuses", status)}
            >
              {STATUS_LABEL[status]}
            </Pill>
          ))}
        </Group>

        <Group label="Paid with">
          {(options?.payment_methods ?? []).map((method) => (
            <Pill
              key={method}
              active={filters.paymentMethods.includes(method)}
              onClick={() => toggle("paymentMethods", method)}
            >
              {method}
            </Pill>
          ))}
        </Group>
      </div>

      {/* Category. Ten values plus the uncategorised set, wrapping. */}
      <Group label="Category" block>
        {(options?.categories ?? []).map((category) => (
          <Pill
            key={category}
            active={filters.categories.includes(category)}
            onClick={() => toggle("categories", category)}
          >
            {category}
          </Pill>
        ))}
        <Pill
          active={filters.uncategorisedOnly}
          onClick={() => set("uncategorisedOnly", !filters.uncategorisedOnly)}
          title="200 payments arrived with no category"
          dashed
        >
          {categoryLabel(null)}
        </Pill>
      </Group>

      <div className="filterbar__row">
        <Group label="Date">
          <input
            type="date"
            className="filterbar__field"
            value={filters.dateFrom?.slice(0, 10) ?? ""}
            max={filters.dateTo?.slice(0, 10) ?? options?.latest?.slice(0, 10)}
            onChange={(e) =>
              set("dateFrom", e.target.value ? `${e.target.value}T00:00:00Z` : null)
            }
            aria-label="From date"
          />
          <span className="filterbar__muted" aria-hidden="true">
            to
          </span>
          <input
            type="date"
            className="filterbar__field"
            value={filters.dateTo?.slice(0, 10) ?? ""}
            min={filters.dateFrom?.slice(0, 10)}
            onChange={(e) =>
              // Inclusive end of day, so picking a single date returns that
              // whole day rather than only midnight.
              set("dateTo", e.target.value ? `${e.target.value}T23:59:59Z` : null)
            }
            aria-label="To date"
          />
        </Group>

        <Group label="Amount">
          <input
            type="number"
            inputMode="numeric"
            className="filterbar__field filterbar__field--num mono"
            placeholder="Min"
            min={0}
            value={filters.minAmount ?? ""}
            onChange={(e) => set("minAmount", e.target.value || null)}
            aria-label="Minimum amount in rupees"
          />
          <span className="filterbar__muted" aria-hidden="true">
            to
          </span>
          <input
            type="number"
            inputMode="numeric"
            className="filterbar__field filterbar__field--num mono"
            placeholder="Max"
            min={0}
            value={filters.maxAmount ?? ""}
            onChange={(e) => set("maxAmount", e.target.value || null)}
            aria-label="Maximum amount in rupees"
          />
        </Group>
      </div>

      {/* Data-quality switches. Off by default, but exposed rather than hidden:
          the dataset has 148 refunds and 3 impossible amounts, and a reviewer
          should be able to see what we excluded and put it back. */}
      <div className="filterbar__row filterbar__row--quiet">
        <Check
          checked={filters.includeRefunds}
          onChange={(v) => set("includeRefunds", v)}
          label="Include refunds"
          hint="148 payments have a negative amount"
        />
        <Check
          checked={filters.includeOutliers}
          onChange={(v) => set("includeOutliers", v)}
          label="Include extreme amounts"
          hint="3 payments above ₹1,00,000 look like data errors"
        />
        {busy && (
          <span className="filterbar__muted filterbar__busy" aria-hidden="true">
            updating…
          </span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Group({
  label,
  children,
  block,
}: {
  label: string;
  children: React.ReactNode;
  block?: boolean;
}) {
  return (
    <fieldset className={`filterbar__group${block ? " filterbar__group--block" : ""}`}>
      <legend>{label}</legend>
      <div className="filterbar__group-items">{children}</div>
    </fieldset>
  );
}

function Pill({
  active,
  onClick,
  children,
  title,
  dashed,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  dashed?: boolean;
}) {
  return (
    <button
      type="button"
      className="filterbar__pill"
      data-active={active || undefined}
      data-dashed={dashed || undefined}
      aria-pressed={active}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Check({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  const id = useId();
  return (
    <span className="filterbar__check">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} title={hint}>
        {label}
      </label>
    </span>
  );
}

const css = `
.filterbar{
  display:flex;
  flex-direction:column;
  gap:var(--space-4);
}
.filterbar__row{
  display:flex;
  align-items:flex-end;
  gap:var(--space-5);
  flex-wrap:wrap;
}
.filterbar__row--quiet{
  align-items:center;
  gap:var(--space-5);
  padding-top:var(--space-3);
  border-top:var(--rule);
}

/* --- Search --------------------------------------------------------------- */
.filterbar__search{
  position:relative;
  flex:1 1 240px;
  min-width:0;
  display:flex;
  align-items:center;
}
.filterbar__search-icon{
  position:absolute;
  left:var(--space-3);
  color:var(--paper-500);
  font-size:15px;
  pointer-events:none;
}
.filterbar__search input{
  width:100%;
  padding:var(--space-2) var(--space-8) var(--space-2) var(--space-8);
  background:var(--ink-900);
  border:var(--rule);
  border-radius:var(--radius-md);
  color:var(--paper-50);
  font-size:var(--text-sm);
  transition:border-color var(--dur-fast) var(--ease);
  min-height:38px;
}
.filterbar__search input::placeholder{color:var(--paper-500)}
.filterbar__search input:hover{border-color:var(--ink-600)}
.filterbar__search input:focus{border-color:var(--indigo-400);outline:none;box-shadow:0 0 0 3px rgba(107,118,232,0.16)}
.filterbar__search input::-webkit-search-cancel-button{display:none}
.filterbar__clear-search{
  position:absolute;
  right:var(--space-2);
  background:none;
  border:none;
  color:var(--paper-400);
  font-size:17px;
  line-height:1;
  cursor:pointer;
  padding:var(--space-1);
  border-radius:var(--radius-sm);
}
.filterbar__clear-search:hover{color:var(--paper-50)}

.filterbar__summary{font-size:var(--text-sm);white-space:nowrap;padding-bottom:var(--space-2)}
.filterbar__muted{color:var(--paper-500)}
.filterbar__busy{font-size:var(--text-xs);font-style:italic;margin-left:auto}

/* --- Groups --------------------------------------------------------------- */
.filterbar__group{
  border:none;
  padding:0;
  margin:0;
  min-width:0;
}
.filterbar__group--block{width:100%}
.filterbar__group legend{
  padding:0;
  font-size:var(--text-2xs);
  font-weight:600;
  letter-spacing:0.06em;
  text-transform:uppercase;
  color:var(--paper-500);
  margin-bottom:var(--space-2);
}
.filterbar__group-items{
  display:flex;
  align-items:center;
  gap:var(--space-2);
  flex-wrap:wrap;
}

/* --- Pills ---------------------------------------------------------------- */
.filterbar__pill{
  padding:var(--space-1) var(--space-3);
  background:var(--ink-800);
  border:1px solid var(--ink-700);
  border-radius:var(--radius-full);
  color:var(--paper-400);
  font-size:var(--text-xs);
  font-weight:450;
  cursor:pointer;
  transition:background var(--dur-fast) var(--ease),border-color var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease);
  min-height:28px;
}
.filterbar__pill[data-dashed]{border-style:dashed}
.filterbar__pill:hover{border-color:var(--ink-600);color:var(--paper-200)}
.filterbar__pill[data-active]{
  background:rgba(107,118,232,0.16);
  border-color:var(--indigo-400);
  color:var(--indigo-300);
  font-weight:500;
}

/* --- Fields --------------------------------------------------------------- */
.filterbar__field{
  padding:var(--space-1) var(--space-2);
  background:var(--ink-900);
  border:var(--rule);
  border-radius:var(--radius-sm);
  color:var(--paper-200);
  font-size:var(--text-xs);
  min-height:30px;
  min-width:0;
}
.filterbar__field--num{width:82px}
.filterbar__field:hover{border-color:var(--ink-600)}
.filterbar__field:focus{border-color:var(--indigo-400);outline:none}
/* The native date picker icon is near-invisible on a dark surface. */
.filterbar__field::-webkit-calendar-picker-indicator{filter:invert(0.65)}

/* --- Checks --------------------------------------------------------------- */
.filterbar__check{display:inline-flex;align-items:center;gap:var(--space-2)}
.filterbar__check input{accent-color:var(--indigo-400);width:14px;height:14px;cursor:pointer}
.filterbar__check label{font-size:var(--text-xs);color:var(--paper-400);cursor:pointer}
.filterbar__check label:hover{color:var(--paper-200)}

@media (max-width:560px){
  .filterbar__row{gap:var(--space-4)}
  .filterbar__summary{padding-bottom:0}
  .filterbar__field--num{width:72px}
  .filterbar__row--quiet{flex-direction:column;align-items:flex-start;gap:var(--space-2)}
  .filterbar__busy{margin-left:0}
}
`;
