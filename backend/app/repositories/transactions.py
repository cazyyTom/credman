"""
Data access for transactions. SQL lives here and nowhere else.

The filter matrix is built as a list of predicate fragments plus a parallel list
of parameters, so every user-supplied value goes to Postgres as a bound
parameter. No f-string ever touches a filter value.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import psycopg
from psycopg import sql

from app.schemas import SortField, SortOrder, TransactionFilters

# Sort is the one place a user value reaches the SQL text, so it is resolved
# through this whitelist rather than interpolated.
_SORT_COLUMNS: dict[SortField, sql.Identifier] = {
    SortField.occurred_at: sql.Identifier("t", "occurred_at"),
    SortField.amount: sql.Identifier("t", "amount"),
}

_BASE_FROM = """
    FROM transactions t
    JOIN merchants  m ON m.id = t.merchant_id
    LEFT JOIN categories c ON c.id = t.category_id
"""


def _where(filters: TransactionFilters) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []

    if filters.search:
        # Only 49 distinct merchants, so this resolves against the small table
        # and is backed by the trigram index on merchants.name.
        clauses.append("m.name ILIKE %s")
        params.append(f"%{filters.search}%")

    if filters.categories:
        clauses.append("c.name = ANY(%s)")
        params.append(filters.categories)

    if filters.uncategorised_only:
        clauses.append("t.category_id IS NULL")

    if filters.statuses:
        clauses.append("t.status = ANY(%s::txn_status[])")
        params.append([s.value for s in filters.statuses])

    if filters.payment_methods:
        clauses.append("t.payment_method = ANY(%s::payment_method[])")
        params.append(filters.payment_methods)

    if filters.date_from:
        clauses.append("t.occurred_at >= %s")
        params.append(filters.date_from)

    if filters.date_to:
        clauses.append("t.occurred_at <= %s")
        params.append(filters.date_to)

    # Amount filters compare magnitude, so a refund of -Rs.900 still matches a
    # "Rs.500 to Rs.1,000" range. Comparing the signed value would put every
    # refund below every minimum, which is not what the user means.
    if filters.min_amount is not None:
        clauses.append("ABS(t.amount) >= %s")
        params.append(filters.min_amount)

    if filters.max_amount is not None:
        clauses.append("ABS(t.amount) <= %s")
        params.append(filters.max_amount)

    if not filters.include_outliers:
        clauses.append("t.is_amount_outlier = false")

    if not filters.include_refunds:
        clauses.append("t.is_refund = false")

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return where, params


def fetch_page(
    conn: psycopg.Connection,
    filters: TransactionFilters,
    *,
    page: int,
    page_size: int,
    sort: SortField,
    order: SortOrder,
) -> tuple[list[dict], int, Decimal, int]:
    """Return (rows, total_count, filtered_total_amount, filtered_coins)."""
    where, params = _where(filters)

    # One aggregate round trip for the page footer and the pagination control.
    # Cheaper than a second request and it can never disagree with the page.
    totals = conn.execute(
        f"""SELECT COUNT(*)                        AS total,
                   COALESCE(SUM(t.amount), 0)      AS total_amount,
                   COALESCE(SUM(t.coins_earned),0) AS total_coins
            {_BASE_FROM} {where}""",
        params,
    ).fetchone()

    direction = sql.SQL("DESC") if order is SortOrder.desc else sql.SQL("ASC")
    # id is the tiebreaker: without it, rows sharing a timestamp can reappear on
    # two pages or vanish entirely, because Postgres has no obligation to order
    # ties consistently between queries.
    query = sql.SQL(
        """SELECT t.id, t.external_id, t.occurred_at, m.name AS merchant,
                  c.name AS category, t.amount, t.currency, t.status::text AS status,
                  t.payment_method::text AS payment_method, t.coins_earned,
                  t.is_refund, t.is_amount_outlier, t.has_duplicate_external_id
           {base} {where}
           ORDER BY {sort_col} {direction}, t.id DESC
           LIMIT %s OFFSET %s"""
    ).format(
        base=sql.SQL(_BASE_FROM),
        where=sql.SQL(where),
        sort_col=_SORT_COLUMNS[sort],
        direction=direction,
    )

    rows = conn.execute(
        query, [*params, page_size, (page - 1) * page_size]
    ).fetchall()

    return rows, totals["total"], totals["total_amount"], totals["total_coins"]


def fetch_by_id(conn: psycopg.Connection, txn_id: int) -> dict | None:
    return conn.execute(
        f"""SELECT t.id, t.external_id, t.occurred_at, m.name AS merchant,
                   c.name AS category, t.amount, t.currency, t.status::text AS status,
                   t.payment_method::text AS payment_method, t.coins_earned,
                   t.is_refund, t.is_amount_outlier, t.has_duplicate_external_id,
                   t.raw_timestamp
            {_BASE_FROM}
            WHERE t.id = %s""",
        [txn_id],
    ).fetchone()


def fetch_analytics(
    conn: psycopg.Connection, filters: TransactionFilters
) -> dict[str, Any]:
    """
    Category breakdown and monthly trend for the filtered set.

    Aggregated in Postgres, not the browser. The whole point of the server-side
    approach is that adding a filter costs one indexed query instead of shipping
    10,000 rows and recomputing in JavaScript.
    """
    where, params = _where(filters)

    by_category = conn.execute(
        f"""SELECT c.name AS category,
                   SUM(t.amount)  AS total_amount,
                   COUNT(*)       AS transaction_count
            {_BASE_FROM} {where}
            GROUP BY c.name
            ORDER BY SUM(t.amount) DESC NULLS LAST""",
        params,
    ).fetchall()

    monthly = conn.execute(
        f"""SELECT to_char(date_trunc('month', t.occurred_at), 'YYYY-MM') AS month,
                   SUM(t.amount) AS total_amount,
                   COUNT(*)      AS transaction_count
            {_BASE_FROM} {where}
            GROUP BY 1
            ORDER BY 1""",
        params,
    ).fetchall()

    # Reported so the UI can say "3 extreme values excluded" rather than quietly
    # showing a total that does not match the raw file.
    excluded = conn.execute(
        f"""SELECT COUNT(*) AS n {_BASE_FROM}
            WHERE t.is_amount_outlier = true"""
    ).fetchone()["n"]

    return {"by_category": by_category, "monthly": monthly, "excluded_outliers": excluded}


def fetch_filter_options(conn: psycopg.Connection) -> dict[str, Any]:
    """Drive the filter controls from the data, so they can never list a dead option."""
    categories = [
        r["name"] for r in conn.execute("SELECT name FROM categories ORDER BY name")
    ]
    bounds = conn.execute(
        """SELECT MIN(ABS(amount)) AS min_amount,
                  MAX(ABS(amount)) AS max_amount,
                  MIN(occurred_at) AS earliest,
                  MAX(occurred_at) AS latest
           FROM transactions
           WHERE is_amount_outlier = false"""
    ).fetchone()
    methods = [
        r["payment_method"]
        for r in conn.execute(
            "SELECT DISTINCT payment_method::text AS payment_method "
            "FROM transactions ORDER BY 1"
        )
    ]
    return {
        "categories": categories,
        "statuses": ["SUCCESS", "PENDING", "FAILED"],
        "payment_methods": methods,
        "min_amount": bounds["min_amount"] or Decimal("0"),
        "max_amount": bounds["max_amount"] or Decimal("0"),
        "earliest": bounds["earliest"],
        "latest": bounds["latest"],
    }
