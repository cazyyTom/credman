"""HTTP layer for transactions. Parses and validates input, delegates, returns."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import settings
from app.db import get_conn
from app.schemas import (
    Analytics,
    FilterOptions,
    SortField,
    SortOrder,
    Transaction,
    TransactionFilters,
    TransactionPage,
    TxnStatus,
)
from app.services import transactions as service

router = APIRouter(prefix="/api", tags=["transactions"])


def filter_params(
    search: Annotated[str | None, Query(max_length=100)] = None,
    category: Annotated[list[str] | None, Query()] = None,
    status: Annotated[list[TxnStatus] | None, Query()] = None,
    payment_method: Annotated[list[str] | None, Query()] = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    min_amount: Annotated[Decimal | None, Query(ge=0)] = None,
    max_amount: Annotated[Decimal | None, Query(ge=0)] = None,
    uncategorised_only: bool = False,
    include_outliers: bool = False,
    include_refunds: bool = True,
) -> TransactionFilters:
    """
    Shared dependency, so /transactions and /analytics accept an identical filter
    set. That symmetry is what lets the charts and the table filter each other
    without a second implementation.
    """
    try:
        return TransactionFilters(
            search=search,
            categories=category or [],
            statuses=status or [],
            payment_methods=payment_method or [],
            date_from=date_from,
            date_to=date_to,
            min_amount=min_amount,
            max_amount=max_amount,
            uncategorised_only=uncategorised_only,
            include_outliers=include_outliers,
            include_refunds=include_refunds,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_filters", "message": str(exc)},
        )


@router.get("/transactions", response_model=TransactionPage)
def list_transactions(
    filters: Annotated[TransactionFilters, Depends(filter_params)],
    conn: Annotated[psycopg.Connection, Depends(get_conn)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=settings.max_page_size)] = 50,
    sort: SortField = SortField.occurred_at,
    order: SortOrder = SortOrder.desc,
) -> TransactionPage:
    return service.list_transactions(
        conn, filters, page=page, page_size=page_size, sort=sort, order=order
    )


@router.get("/transactions/{txn_id}", response_model=Transaction)
def get_transaction(
    txn_id: int,
    conn: Annotated[psycopg.Connection, Depends(get_conn)],
) -> Transaction:
    txn = service.get_transaction(conn, txn_id)
    if txn is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": f"No transaction {txn_id}"},
        )
    return txn


@router.get("/analytics", response_model=Analytics)
def get_analytics(
    filters: Annotated[TransactionFilters, Depends(filter_params)],
    conn: Annotated[psycopg.Connection, Depends(get_conn)],
) -> Analytics:
    return service.get_analytics(conn, filters)


@router.get("/filter-options", response_model=FilterOptions)
def get_filter_options(
    conn: Annotated[psycopg.Connection, Depends(get_conn)],
) -> FilterOptions:
    return service.get_filter_options(conn)
