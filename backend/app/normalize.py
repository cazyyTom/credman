"""
Normalisation rules for the source dataset.

Kept as pure functions with no database or IO so they can be unit tested and so
the seed script and any future ingest path apply identical rules.

Every rule here exists because of something actually present in
data/transactions.json, not defensively. Counts as of the supplied file:

  timestamp   5,476 ISO-with-Z
              1,961 ISO with +05:30 offset
              1,007 integer epoch milliseconds
                841 "DD/MM/YYYY HH:MM:SS"
                715 bare "YYYY-MM-DD"
  amount      9,980 float, 20 numeric strings, 148 negative, 3 extreme outliers
  category      150 null, 50 empty string
  status         25 lowercase "success"
  id             40 IDs shared by two different transactions
"""

from __future__ import annotations

import re
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from zoneinfo import ZoneInfo

# The dataset is an INR consumer app with +05:30 offsets already present, so
# values carrying no timezone are read as India Standard Time rather than UTC.
# Reading them as UTC would shift 1,556 transactions back by 5h30m and move a
# chunk of them into the previous calendar day, distorting the monthly trend.
LOCAL_TZ = ZoneInfo("Asia/Kolkata")

# Above this, an amount is treated as a data-entry artefact rather than real
# spend. The genuine distribution tops out near Rs.55,000 (p99 ~ Rs.49,850);
# the three values above this threshold are 5.18L, 7.42L and 99,99,99,999.
AMOUNT_OUTLIER_THRESHOLD = Decimal("100000.00")

_ISO_DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DMY_DATETIME = re.compile(r"^(\d{2})/(\d{2})/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$")


class RowRejected(Exception):
    """Raised when a row cannot be salvaged and must be quarantined."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def parse_timestamp(value: Any) -> datetime:
    """Coerce any of the five observed timestamp shapes to an aware UTC datetime."""
    if value is None or value == "":
        raise RowRejected("timestamp_missing")

    # Integer epoch milliseconds. Seconds-vs-milliseconds is decided by
    # magnitude: this dataset sits in 2025-2026, so a seconds value would be
    # ~1.7e9 and a milliseconds value ~1.7e12.
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        seconds = float(value) / 1000.0 if abs(value) > 1e11 else float(value)
        try:
            return datetime.fromtimestamp(seconds, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            raise RowRejected("timestamp_out_of_range")

    if not isinstance(value, str):
        raise RowRejected("timestamp_unsupported_type")

    raw = value.strip()

    # Bare calendar date. No time of day exists, so it is anchored to local
    # midnight - an arbitrary but documented choice, and the only one that keeps
    # the transaction on the date the source claims.
    if _ISO_DATE_ONLY.match(raw):
        d = date.fromisoformat(raw)
        return datetime(d.year, d.month, d.day, tzinfo=LOCAL_TZ).astimezone(timezone.utc)

    # "DD/MM/YYYY HH:MM:SS". Day-first is not assumed: in this file the first
    # component reaches 31 while the second never exceeds 12, which rules
    # month-first out. Treated as local time.
    m = _DMY_DATETIME.match(raw)
    if m:
        day, month, year, hh, mm, ss = (int(g) for g in m.groups())
        try:
            return datetime(year, month, day, hh, mm, ss, tzinfo=LOCAL_TZ).astimezone(
                timezone.utc
            )
        except ValueError:
            raise RowRejected("timestamp_invalid_date")

    # ISO 8601, with Z or with an explicit offset.
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        raise RowRejected("timestamp_unparseable")

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=LOCAL_TZ)
    return parsed.astimezone(timezone.utc)


def parse_amount(value: Any) -> tuple[Decimal, bool, bool]:
    """
    Return (amount, is_refund, is_outlier).

    Negative amounts are kept. They look like refunds or reversals, and a
    spending view that silently drops money flowing back to the user is wrong.
    They are flagged so analytics can net them out deliberately.
    """
    if value is None or value == "":
        raise RowRejected("amount_missing")

    if isinstance(value, str):
        cleaned = value.strip().replace(",", "").replace("\u20b9", "")
        try:
            amount = Decimal(cleaned)
        except InvalidOperation:
            raise RowRejected("amount_unparseable")
    elif isinstance(value, bool):
        raise RowRejected("amount_unsupported_type")
    elif isinstance(value, (int, float)):
        # str() first: Decimal(float) would carry the float's binary error in.
        amount = Decimal(str(value))
    else:
        raise RowRejected("amount_unsupported_type")

    amount = amount.quantize(Decimal("0.01"))

    if amount == 0:
        raise RowRejected("amount_zero")

    return amount, amount < 0, abs(amount) > AMOUNT_OUTLIER_THRESHOLD


_VALID_STATUS = {"SUCCESS", "FAILED", "PENDING"}


def parse_status(value: Any) -> str:
    """Fold case so 'success' and 'SUCCESS' cannot become two different states."""
    if not isinstance(value, str) or not value.strip():
        raise RowRejected("status_missing")
    folded = value.strip().upper()
    if folded not in _VALID_STATUS:
        raise RowRejected(f"status_unknown:{folded[:32]}")
    return folded


_VALID_PAYMENT_METHODS = {
    "credit card": "Credit Card",
    "debit card": "Debit Card",
    "netbanking": "Netbanking",
    "upi": "UPI",
}


def parse_payment_method(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise RowRejected("payment_method_missing")
    key = " ".join(value.strip().lower().split())
    if key not in _VALID_PAYMENT_METHODS:
        raise RowRejected(f"payment_method_unknown:{value[:32]}")
    return _VALID_PAYMENT_METHODS[key]


def parse_category(value: Any) -> str | None:
    """
    None and "" both mean "we do not know". They collapse to NULL rather than to
    a synthetic 'Other' category, so the gap stays visible in the data instead of
    being laundered into a real-looking bucket.
    """
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def parse_merchant(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise RowRejected("merchant_missing")
    return " ".join(value.strip().split())


def parse_currency(value: Any) -> str:
    if value is None or value == "":
        return "INR"
    if not isinstance(value, str):
        raise RowRejected("currency_unsupported_type")
    code = value.strip().upper()
    if code != "INR":
        # Out of scope rather than impossible: with no FX rates supplied there is
        # no honest way to add a non-INR amount to an INR total.
        raise RowRejected(f"currency_unsupported:{code[:8]}")
    return code


def parse_external_id(value: Any) -> str:
    if value is None:
        raise RowRejected("id_missing")
    text = str(value).strip()
    if not text:
        raise RowRejected("id_missing")
    return text


COIN_RATE_RUPEES = Decimal("100")
COIN_CAP_PER_TXN = 100


def coins_for(amount: Decimal, status: str, is_outlier: bool = False) -> int:
    """
    Mirror of the coins_earned generated column in db/schema.sql.

    Duplicated deliberately so the API layer can explain a coin figure without a
    round trip, and so a drift between the two is a test failure rather than a
    silent inconsistency. tests/test_redeem.py asserts they agree.
    """
    if status != "SUCCESS" or amount <= 0 or is_outlier:
        return 0
    return min(int(amount // COIN_RATE_RUPEES), COIN_CAP_PER_TXN)


def normalize_row(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalise one source record. Raises RowRejected if it cannot be saved."""
    amount, is_refund, is_outlier = parse_amount(raw.get("amount"))
    return {
        "external_id": parse_external_id(raw.get("id")),
        "occurred_at": parse_timestamp(raw.get("timestamp")),
        "raw_timestamp": str(raw.get("timestamp")),
        "merchant": parse_merchant(raw.get("merchant")),
        "category": parse_category(raw.get("category")),
        "amount": amount,
        "currency": parse_currency(raw.get("currency")),
        "status": parse_status(raw.get("status")),
        "payment_method": parse_payment_method(raw.get("payment_method")),
        "is_refund": is_refund,
        "is_amount_outlier": is_outlier,
    }
