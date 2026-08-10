"""Business logic for transactions and analytics. No SQL, no HTTP."""

from __future__ import annotations

from decimal import Decimal

import psycopg

from app.repositories import transactions as repo
from app.schemas import (
    Analytics,
    CategorySlice,
    FilterOptions,
    MonthPoint,
    PageMeta,
    SortField,
    SortOrder,
    Transaction,
    TransactionFilters,
    TransactionPage,
)


def list_transactions(
    conn: psycopg.Connection,
    filters: TransactionFilters,
    *,
    page: int,
    page_size: int,
    sort: SortField,
    order: SortOrder,
) -> TransactionPage:
    rows, total, total_amount, total_coins = repo.fetch_page(
        conn, filters, page=page, page_size=page_size, sort=sort, order=order
    )
    total_pages = max(1, -(-total // page_size))  # ceiling division
    return TransactionPage(
        items=[Transaction(**row) for row in rows],
        meta=PageMeta(
            page=page, page_size=page_size, total=total, total_pages=total_pages
        ),
        filtered_total_amount=total_amount,
        filtered_coins=total_coins,
    )


def get_transaction(conn: psycopg.Connection, txn_id: int) -> Transaction | None:
    row = repo.fetch_by_id(conn, txn_id)
    if row is None:
        return None
    row.pop("raw_timestamp", None)
    return Transaction(**row)


def get_analytics(conn: psycopg.Connection, filters: TransactionFilters) -> Analytics:
    data = repo.fetch_analytics(conn, filters)

    # Share is computed over the absolute total so refunds cannot produce a
    # negative slice or push another slice above 100%.
    magnitude = sum(abs(Decimal(r["total_amount"])) for r in data["by_category"])

    by_category = [
        CategorySlice(
            category=row["category"],
            total_amount=row["total_amount"],
            transaction_count=row["transaction_count"],
            share=(
                float(abs(Decimal(row["total_amount"])) / magnitude)
                if magnitude
                else 0.0
            ),
        )
        for row in data["by_category"]
    ]

    monthly = [MonthPoint(**row) for row in data["monthly"]]

    return Analytics(
        by_category=by_category,
        monthly=monthly,
        total_amount=sum((Decimal(r["total_amount"]) for r in data["by_category"]), Decimal(0)),
        transaction_count=sum(r["transaction_count"] for r in data["by_category"]),
        excluded_outliers=data["excluded_outliers"],
    )


def get_filter_options(conn: psycopg.Connection) -> FilterOptions:
    return FilterOptions(**repo.fetch_filter_options(conn))
