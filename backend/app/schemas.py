"""Request and response models. These are the API contract."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TxnStatus(str, Enum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    PENDING = "PENDING"


class SortField(str, Enum):
    occurred_at = "occurred_at"
    amount = "amount"


class SortOrder(str, Enum):
    asc = "asc"
    desc = "desc"


class TransactionFilters(BaseModel):
    """
    Parsed query string for the transactions and analytics endpoints.

    Both endpoints take the identical filter set, which is what makes two-way
    cross-filtering possible without a second code path: a click on a chart slice
    and a change in the filter bar produce the same shaped request.
    """

    model_config = ConfigDict(extra="forbid")

    search: str | None = Field(default=None, max_length=100)
    categories: list[str] = Field(default_factory=list)
    statuses: list[TxnStatus] = Field(default_factory=list)
    payment_methods: list[str] = Field(default_factory=list)
    date_from: datetime | None = None
    date_to: datetime | None = None
    min_amount: Decimal | None = Field(default=None, ge=0)
    max_amount: Decimal | None = Field(default=None, ge=0)
    # Uncategorised rows are a real subset users may want to isolate, so it is a
    # filter of its own rather than a magic string in `categories`.
    uncategorised_only: bool = False
    include_outliers: bool = False
    include_refunds: bool = True

    @field_validator("search")
    @classmethod
    def _clean_search(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        return cleaned or None

    @model_validator(mode="after")
    def _check_ranges(self) -> TransactionFilters:
        if (
            self.min_amount is not None
            and self.max_amount is not None
            and self.min_amount > self.max_amount
        ):
            raise ValueError("min_amount cannot exceed max_amount")
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("date_from cannot be later than date_to")
        return self


class Transaction(BaseModel):
    id: int
    external_id: str
    occurred_at: datetime
    merchant: str
    category: str | None
    amount: Decimal
    currency: str
    status: TxnStatus
    payment_method: str
    coins_earned: int
    is_refund: bool
    is_amount_outlier: bool
    has_duplicate_external_id: bool


class PageMeta(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int


class TransactionPage(BaseModel):
    items: list[Transaction]
    meta: PageMeta
    # Totals for the filtered set, not just the page. The header can show
    # "Rs.4.2L across 812 payments" without a second request.
    filtered_total_amount: Decimal
    filtered_coins: int


class CategorySlice(BaseModel):
    category: str | None
    total_amount: Decimal
    transaction_count: int
    share: float


class MonthPoint(BaseModel):
    month: str  # YYYY-MM
    total_amount: Decimal
    transaction_count: int


class Analytics(BaseModel):
    by_category: list[CategorySlice]
    monthly: list[MonthPoint]
    total_amount: Decimal
    transaction_count: int
    excluded_outliers: int


class FilterOptions(BaseModel):
    categories: list[str]
    statuses: list[str]
    payment_methods: list[str]
    min_amount: Decimal
    max_amount: Decimal
    earliest: datetime | None
    latest: datetime | None


class CoinBalance(BaseModel):
    balance: int
    coins_earned: int
    coins_redeemed: int


class Reward(BaseModel):
    id: int
    sku: str
    title: str
    description: str
    kind: Literal["voucher", "cashback", "bill_credit"]
    coin_cost: int
    value_inr: Decimal
    affordable: bool


class RedeemRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reward_id: Annotated[int, Field(gt=0)]
    # Optional, but if supplied a retry returns the original redemption rather
    # than spending the coins a second time.
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=100)


class Redemption(BaseModel):
    id: int
    reward_id: int
    reward_title: str
    coin_cost: int
    created_at: datetime
    balance_after: int
    replayed: bool = False


class ErrorBody(BaseModel):
    """One error shape for the whole API, so the client has one thing to render."""

    code: str
    message: str
    detail: dict | None = None
