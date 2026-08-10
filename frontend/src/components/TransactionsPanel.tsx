"use client";

import { coinCount, categoryLabel, money, moneyCompact, shortDate } from "@/lib/format";
import type {
  SortField,
  SortOrder,
  Transaction,
  TransactionPage,
} from "@/lib/types";
import { Column, DataTable } from "./DataTable";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { StatusChip, Tag } from "./ui/Chip";

interface Props {
  page: TransactionPage | null;
  loading: boolean;
  refreshing: boolean;
  error: { message: string } | null;
  onRetry: () => void;
  sort: SortField;
  order: SortOrder;
  onSort: (key: SortField) => void;
  pageNumber: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  onSelect: (txn: Transaction) => void;
  onClearFilters: () => void;
  hasFilters: boolean;
}

const columns: Column<Transaction>[] = [
  {
    key: "occurred_at",
    header: "Date",
    sortable: true,
    width: "108px",
    render: (t) => <span className="mono txn-date">{shortDate(t.occurred_at)}</span>,
  },
  {
    key: "merchant",
    header: "Merchant",
    render: (t) => (
      <span className="txn-merchant">
        <span className="txn-merchant__name">{t.merchant}</span>
        {t.has_duplicate_external_id && (
          <Tag tone="warn" title="Another payment shares this reference number">
            dup ref
          </Tag>
        )}
      </span>
    ),
  },
  {
    key: "category",
    header: "Category",
    hideBelow: 760,
    render: (t) => (
      <span className={t.category ? "txn-category" : "txn-category txn-category--none"}>
        {categoryLabel(t.category)}
      </span>
    ),
  },
  {
    key: "payment_method",
    header: "Paid with",
    hideBelow: 1024,
    render: (t) => <span className="txn-method">{t.payment_method}</span>,
  },
  {
    key: "status",
    header: "Status",
    width: "92px",
    render: (t) => <StatusChip status={t.status} />,
  },
  {
    key: "coins_earned",
    header: "Coins",
    align: "right",
    width: "72px",
    hideBelow: 560,
    render: (t) =>
      t.coins_earned > 0 ? (
        <span className="mono txn-coins">{coinCount(t.coins_earned)}</span>
      ) : (
        <span className="txn-coins txn-coins--none" aria-label="No coins earned">
          —
        </span>
      ),
  },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    sortable: true,
    width: "124px",
    render: (t) => (
      <span
        className="mono txn-amount"
        data-refund={t.is_refund || undefined}
        data-outlier={t.is_amount_outlier || undefined}
        title={t.is_amount_outlier ? "This amount looks like a data error" : undefined}
      >
        {money(t.amount)}
      </span>
    ),
  },
];

export function TransactionsPanel({
  page,
  loading,
  refreshing,
  error,
  onRetry,
  sort,
  order,
  onSort,
  pageNumber,
  onPageChange,
  pageSize,
  onPageSizeChange,
  onSelect,
  onClearFilters,
  hasFilters,
}: Props) {
  const meta = page?.meta;

  return (
    <Card
      title="Payments"
      hint={
        page && !loading
          ? `${moneyCompact(page.filtered_total_amount)} · ${coinCount(
              page.filtered_coins,
            )} coins earned`
          : undefined
      }
      padded={false}
      action={
        <label className="txn-pagesize">
          <span className="visually-hidden">Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {[25, 50, 100, 200].map((size) => (
              <option key={size} value={size}>
                {size} rows
              </option>
            ))}
          </select>
        </label>
      }
    >
      <style>{css}</style>

      <DataTable
        columns={columns}
        rows={page?.items ?? []}
        rowKey={(t) => t.id}
        caption="Your card payments. Select a row to see the full detail."
        onRowClick={onSelect}
        sortKey={sort}
        sortOrder={order}
        onSort={(key) => onSort(key as SortField)}
        loading={loading}
        refreshing={refreshing}
        error={error}
        onRetry={onRetry}
        skeletonRows={Math.min(pageSize, 12)}
        emptyTitle="No payments match"
        emptyHint={
          hasFilters
            ? "Try widening the date or amount range, or clear a filter."
            : "Once payments come through, they'll show up here."
        }
        emptyAction={
          hasFilters ? (
            <Button variant="secondary" size="sm" onClick={onClearFilters}>
              Clear all filters
            </Button>
          ) : null
        }
      />

      {meta && meta.total > 0 && (
        <nav className="txn-pager" aria-label="Pagination">
          <p className="txn-pager__count">
            <span className="mono">
              {((meta.page - 1) * meta.page_size + 1).toLocaleString("en-IN")}–
              {Math.min(meta.page * meta.page_size, meta.total).toLocaleString("en-IN")}
            </span>{" "}
            of <span className="mono">{meta.total.toLocaleString("en-IN")}</span>
          </p>

          <div className="txn-pager__controls">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(1)}
              disabled={meta.page <= 1}
              aria-label="First page"
            >
              ‹‹
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(meta.page - 1)}
              disabled={meta.page <= 1}
            >
              Previous
            </Button>
            <span className="txn-pager__position mono" aria-current="page">
              {meta.page} / {meta.total_pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(meta.page + 1)}
              disabled={meta.page >= meta.total_pages}
            >
              Next
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(meta.total_pages)}
              disabled={meta.page >= meta.total_pages}
              aria-label="Last page"
            >
              ››
            </Button>
          </div>
        </nav>
      )}
    </Card>
  );
}

const css = `
.txn-date{color:var(--paper-400);font-size:var(--text-xs);white-space:nowrap}

.txn-merchant{display:inline-flex;align-items:center;gap:var(--space-2);min-width:0}
.txn-merchant__name{
  color:var(--paper-50);
  font-weight:450;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.txn-category{color:var(--paper-400);font-size:var(--text-xs)}
.txn-category--none{color:var(--paper-500);font-style:italic}
.txn-method{color:var(--paper-500);font-size:var(--text-xs);white-space:nowrap}

.txn-coins{color:var(--brass-300);font-size:var(--text-xs);font-weight:500}
.txn-coins--none{color:var(--ink-600)}

.txn-amount{
  color:var(--paper-50);
  font-weight:500;
  white-space:nowrap;
}
/* A refund is money coming back. Signing and colouring it is the only way the
   column reads correctly at a glance. */
.txn-amount[data-refund]{color:var(--wait-400)}
.txn-amount[data-outlier]{
  color:var(--fail-400);
  text-decoration:underline dotted;
  text-underline-offset:3px;
  cursor:help;
}

.txn-pagesize select{
  padding:var(--space-1) var(--space-2);
  background:var(--ink-900);
  border:var(--rule);
  border-radius:var(--radius-sm);
  color:var(--paper-400);
  font-size:var(--text-xs);
  cursor:pointer;
  min-height:28px;
}
.txn-pagesize select:hover{border-color:var(--ink-600);color:var(--paper-200)}

.txn-pager{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:var(--space-4);
  padding:var(--space-3) var(--space-5);
  border-top:var(--rule);
  background:var(--ink-800);
  flex-wrap:wrap;
}
.txn-pager__count{font-size:var(--text-xs);color:var(--paper-500)}
.txn-pager__count .mono{color:var(--paper-200)}
.txn-pager__controls{display:flex;align-items:center;gap:var(--space-2)}
.txn-pager__position{
  font-size:var(--text-xs);
  color:var(--paper-400);
  padding-inline:var(--space-2);
  white-space:nowrap;
}

@media (max-width:560px){
  .txn-pager{justify-content:center}
  .txn-pager__count{width:100%;text-align:center}
  /* First/last jumps are the first thing to go when space is tight. */
  .txn-pager__controls button[aria-label="First page"],
  .txn-pager__controls button[aria-label="Last page"]{display:none}
}
`;
