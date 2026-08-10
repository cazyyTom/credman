"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FilterBar } from "@/components/FilterBar";
import { RewardsPanel } from "@/components/RewardsPanel";
import { SpendCharts } from "@/components/SpendCharts";
import { TransactionDrawer } from "@/components/TransactionDrawer";
import { TransactionsPanel } from "@/components/TransactionsPanel";
import { Card } from "@/components/ui/Card";
import { useAsync } from "@/hooks/useTransactions";
import { useDebounced } from "@/hooks/useDebounced";
import { api } from "@/lib/api";
import type { Filters, SortField, SortOrder, Transaction } from "@/lib/types";
import { countActiveFilters, EMPTY_FILTERS } from "@/lib/types";

/**
 * Dashboard.
 *
 * All filter, sort and page state lives here, in one place, and flows down. The
 * table and both charts read from the same `Filters` object and hit endpoints
 * that accept an identical filter set, which is what makes cross-filtering
 * two-way for free: a chart click writes to the same state a filter pill does,
 * and everything re-reads it.
 *
 * State is plain useState rather than a store. There is exactly one owner and one
 * level of drilling, so a reducer or a context would add indirection without
 * removing any — see DECISIONS.md.
 */
export default function DashboardPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortField>("occurred_at");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Transaction | null>(null);

  // Only the search term is debounced. Everything else is a discrete choice that
  // should feel instant.
  const debouncedSearch = useDebounced(filters.search, 250);
  const effectiveFilters = useMemo<Filters>(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  );

  // Any filter change invalidates the current page number: page 7 of an
  // unfiltered list is not page 7 of a filtered one, and landing past the end
  // shows an empty table for no reason.
  const filterKey = useMemo(
    () => JSON.stringify(effectiveFilters),
    [effectiveFilters],
  );
  useEffect(() => {
    setPageNumber(1);
  }, [filterKey]);

  const transactions = useAsync(
    (signal) =>
      api.transactions(effectiveFilters, {
        page: pageNumber,
        pageSize,
        sort,
        order,
        signal,
      }),
    `txn:${filterKey}:${pageNumber}:${pageSize}:${sort}:${order}`,
  );

  // Analytics deliberately ignores page, size and sort: the charts describe the
  // whole filtered set, not the visible slice.
  const analytics = useAsync(
    (signal) => api.analytics(effectiveFilters, signal),
    `ana:${filterKey}`,
  );

  const options = useAsync((signal) => api.filterOptions(signal), "options");

  const handleSort = useCallback(
    (key: SortField) => {
      if (key === sort) {
        setOrder((current) => (current === "asc" ? "desc" : "asc"));
      } else {
        setSort(key);
        // Dates want newest first; amounts want largest first. Both are "desc",
        // which is why a fresh column always starts there.
        setOrder("desc");
      }
      setPageNumber(1);
    },
    [sort],
  );

  const toggleCategory = useCallback((category: string | null) => {
    setFilters((current) => {
      if (category === null) {
        return { ...current, uncategorisedOnly: !current.uncategorisedOnly };
      }
      const active = current.categories.includes(category);
      return {
        ...current,
        categories: active
          ? current.categories.filter((c) => c !== category)
          : [...current.categories, category],
      };
    });
  }, []);

  // Derived from the date range rather than stored separately, so the bar
  // highlight and the date inputs can never disagree.
  const selectedMonth = useMemo(() => {
    if (!filters.dateFrom || !filters.dateTo) return null;
    const from = filters.dateFrom.slice(0, 10);
    const to = filters.dateTo.slice(0, 10);
    const [year, month] = from.split("-");
    if (!year || !month) return null;
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const expectedTo = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
    return from === `${year}-${month}-01` && to === expectedTo
      ? `${year}-${month}`
      : null;
  }, [filters.dateFrom, filters.dateTo]);

  const toggleMonth = useCallback(
    (month: string) => {
      if (selectedMonth === month) {
        setFilters((current) => ({ ...current, dateFrom: null, dateTo: null }));
        return;
      }
      const [year, m] = month.split("-");
      if (!year || !m) return;
      const lastDay = new Date(Number(year), Number(m), 0).getDate();
      setFilters((current) => ({
        ...current,
        dateFrom: `${month}-01T00:00:00Z`,
        dateTo: `${month}-${String(lastDay).padStart(2, "0")}T23:59:59Z`,
      }));
    },
    [selectedMonth],
  );

  const hasFilters = countActiveFilters(filters) > 0;

  return (
    <>
      <style>{css}</style>

      <header className="dash__masthead">
        <div className="dash__brand">
          <span className="dash__mark" aria-hidden="true" />
          <div>
            <h1>CredMan</h1>
            <p>Your credit management companion</p>
          </div>
        </div>
        {analytics.data && !analytics.loading && (
          <dl className="dash__stats">
            <Stat
              label="Total spend"
              value={compact(analytics.data.total_amount)}
            />
            <Stat
              label="Payments"
              value={analytics.data.transaction_count.toLocaleString("en-IN")}
            />
            <Stat label="Months" value={String(analytics.data.monthly.length)} />
          </dl>
        )}
      </header>

      <div className="dash__grid">
        <div className="dash__main">
          <Card title="Find a payment" hint="Filters apply to the charts too">
            <FilterBar
              filters={filters}
              onChange={setFilters}
              options={options.data}
              matchCount={transactions.data?.meta.total ?? null}
              busy={transactions.refreshing && !transactions.loading}
            />
          </Card>

          <SpendCharts
            analytics={analytics.data}
            loading={analytics.loading}
            selectedCategories={filters.categories}
            uncategorisedOnly={filters.uncategorisedOnly}
            onToggleCategory={toggleCategory}
            selectedMonth={selectedMonth}
            onToggleMonth={toggleMonth}
          />

          <TransactionsPanel
            page={transactions.data}
            loading={transactions.loading}
            refreshing={transactions.refreshing}
            error={transactions.error}
            onRetry={transactions.reload}
            sort={sort}
            order={order}
            onSort={handleSort}
            pageNumber={pageNumber}
            onPageChange={setPageNumber}
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPageNumber(1);
            }}
            onSelect={setSelected}
            onClearFilters={() => setFilters(EMPTY_FILTERS)}
            hasFilters={hasFilters}
          />
        </div>

        <aside className="dash__side">
          <RewardsPanel />
        </aside>
      </div>

      <TransactionDrawer transaction={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="dash__stat">
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  );
}

function compact(value: string): string {
  const n = Math.abs(Number(value));
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const css = `
.dash__masthead{
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap:var(--space-6);
  padding-bottom:var(--space-5);
  margin-bottom:var(--space-5);
  border-bottom:var(--rule);
  flex-wrap:wrap;
}
.dash__brand{display:flex;align-items:center;gap:var(--space-3)}
/* Brand mark: a brass coin edge-on, which is the one motif this product owns. */
.dash__mark{
  width:30px;
  height:30px;
  border-radius:50%;
  background:radial-gradient(circle at 34% 30%,var(--brass-300),var(--brass-500) 70%);
  box-shadow:inset 0 1px 1px rgba(255,255,255,0.5),0 0 18px var(--brass-glow);
  flex-shrink:0;
}
.dash__brand h1{
  font-family:var(--font-display);
  font-size:var(--text-xl);
  font-weight:700;
  letter-spacing:-0.025em;
  line-height:1.1;
}
.dash__brand p{font-size:var(--text-xs);color:var(--paper-500);margin-top:1px}

.dash__stats{display:flex;gap:var(--space-6);margin:0;flex-wrap:wrap}
.dash__stat dt{
  font-size:var(--text-2xs);
  font-weight:600;
  letter-spacing:0.06em;
  text-transform:uppercase;
  color:var(--paper-500);
}
.dash__stat dd{
  margin:0;
  font-size:var(--text-lg);
  font-weight:600;
  color:var(--paper-50);
  letter-spacing:-0.01em;
}

/* Two columns on wide screens; the rewards rail collapses under the table
   below 1080px, where a 320px sidebar starts squeezing the amount column. */
.dash__grid{
  display:grid;
  grid-template-columns:minmax(0,1fr) 340px;
  gap:var(--space-4);
  align-items:start;
}
.dash__main{display:flex;flex-direction:column;gap:var(--space-4);min-width:0}
.dash__side{position:sticky;top:var(--space-4);min-width:0}

@media (max-width:1080px){
  .dash__grid{grid-template-columns:minmax(0,1fr)}
  .dash__side{position:static}
}
@media (max-width:560px){
  .dash__masthead{align-items:flex-start;gap:var(--space-4)}
  .dash__stats{gap:var(--space-5)}
  .dash__stat dd{font-size:var(--text-base)}
}
`;
