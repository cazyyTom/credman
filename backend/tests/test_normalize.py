"""
Tests for the normalisation rules.

Each case is drawn from a shape that actually appears in data/transactions.json,
so a regression here means the seed would corrupt real rows.
"""

from __future__ import annotations

from datetime import timezone
from decimal import Decimal

import pytest

from app.normalize import (
    RowRejected,
    coins_for,
    normalize_row,
    parse_amount,
    parse_category,
    parse_status,
    parse_timestamp,
)


class TestTimestamps:
    def test_iso_utc(self):
        got = parse_timestamp("2025-10-03T21:03:27Z")
        assert (got.year, got.month, got.day, got.hour) == (2025, 10, 3, 21)
        assert got.tzinfo == timezone.utc

    def test_ist_offset_converts_to_utc(self):
        # 06:08 IST is 00:38 UTC the same day.
        got = parse_timestamp("2026-03-25T06:08:03+05:30")
        assert (got.hour, got.minute) == (0, 38)
        assert got.tzinfo == timezone.utc

    def test_epoch_millis(self):
        got = parse_timestamp(1768265109000)
        assert got.year == 2026
        assert got.tzinfo == timezone.utc

    def test_day_first_slash_format(self):
        # 12/10/2025 is 12 October, not 10 December: the dataset's first
        # component reaches 31, which rules out month-first.
        got = parse_timestamp("12/10/2025 16:24:49")
        assert (got.month, got.day) == (10, 12)

    def test_slash_format_with_day_above_twelve(self):
        got = parse_timestamp("31/12/2025 08:55:58")
        assert (got.month, got.day) == (12, 31)

    def test_date_only_anchors_to_local_midnight(self):
        # Midnight IST is 18:30 UTC on the previous day.
        got = parse_timestamp("2025-07-03")
        assert (got.month, got.day, got.hour, got.minute) == (7, 2, 18, 30)

    def test_missing_is_rejected(self):
        with pytest.raises(RowRejected):
            parse_timestamp(None)

    def test_garbage_is_rejected(self):
        with pytest.raises(RowRejected):
            parse_timestamp("not a date")


class TestAmounts:
    def test_float(self):
        amount, is_refund, is_outlier = parse_amount(912.62)
        assert amount == Decimal("912.62")
        assert not is_refund and not is_outlier

    def test_numeric_string(self):
        amount, _, _ = parse_amount("5065.00")
        assert amount == Decimal("5065.00")

    def test_negative_is_kept_and_flagged_as_refund(self):
        amount, is_refund, _ = parse_amount(-53652.71)
        assert amount == Decimal("-53652.71")
        assert is_refund, "refunds must be kept, not dropped"

    def test_extreme_value_is_flagged_not_dropped(self):
        amount, _, is_outlier = parse_amount(999999999.0)
        assert amount == Decimal("999999999.00")
        assert is_outlier

    def test_float_precision_is_not_carried_in(self):
        amount, _, _ = parse_amount(0.1 + 0.2)
        assert amount == Decimal("0.30")

    def test_zero_is_rejected(self):
        with pytest.raises(RowRejected):
            parse_amount(0)


class TestStatus:
    def test_lowercase_is_folded(self):
        assert parse_status("success") == "SUCCESS"

    def test_unknown_is_rejected(self):
        with pytest.raises(RowRejected):
            parse_status("REFUNDED")


class TestCategory:
    def test_null_and_empty_both_become_none(self):
        assert parse_category(None) is None
        assert parse_category("") is None
        assert parse_category("   ") is None

    def test_real_value_survives(self):
        assert parse_category("Food & Dining") == "Food & Dining"


class TestCoinRule:
    def test_one_coin_per_hundred_rupees(self):
        assert coins_for(Decimal("912.62"), "SUCCESS") == 9

    def test_partial_hundred_earns_nothing_extra(self):
        assert coins_for(Decimal("199.99"), "SUCCESS") == 1

    def test_capped_per_transaction(self):
        assert coins_for(Decimal("999999999"), "SUCCESS") == 100

    def test_failed_payment_earns_nothing(self):
        assert coins_for(Decimal("5000"), "FAILED") == 0

    def test_pending_payment_earns_nothing(self):
        assert coins_for(Decimal("5000"), "PENDING") == 0

    def test_refund_earns_nothing(self):
        assert coins_for(Decimal("-5000"), "SUCCESS") == 0

    def test_flagged_outlier_earns_nothing(self):
        # An amount we believe is a data error must not mint coins, even though
        # the per-transaction cap would limit it to 100. This also keeps the coin
        # balance consistent with the analytics totals, which exclude outliers.
        assert coins_for(Decimal("999999999"), "SUCCESS", True) == 0
        assert coins_for(Decimal("518900"), "SUCCESS", True) == 0

    def test_normal_amount_unaffected_by_the_outlier_flag(self):
        assert coins_for(Decimal("912.62"), "SUCCESS", False) == 9


class TestWholeRow:
    def test_dirty_row_normalises(self):
        row = normalize_row(
            {
                "id": "TXN2025000000",
                "timestamp": 1768265109000,
                "merchant": "  Cult.fit ",
                "category": "",
                "amount": "912.62",
                "currency": "INR",
                "status": "success",
                "payment_method": "credit card",
            }
        )
        assert row["merchant"] == "Cult.fit"
        assert row["category"] is None
        assert row["status"] == "SUCCESS"
        assert row["payment_method"] == "Credit Card"
        assert row["amount"] == Decimal("912.62")
        assert row["raw_timestamp"] == "1768265109000"
