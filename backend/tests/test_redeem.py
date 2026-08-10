"""
Tests for the redeem path - the one endpoint where a bug costs a user real coins.

The repository layer is replaced with an in-memory fake so these run without a
Postgres instance. What is being tested is the decision logic and its ordering,
which is where the interesting failures live.
"""

from __future__ import annotations

import pytest
from typing import Any, cast

from app.services import rewards as service
from app.services.rewards import InsufficientCoins, RewardInactive, RewardNotFound

CATALOGUE = {
    1: {
        "id": 1,
        "sku": "VCH-SWG-150",
        "title": "Swiggy Money",
        "description": "Rs.150 wallet top-up.",
        "kind": "voucher",
        "coin_cost": 1_500,
        "value_inr": 150,
        "is_active": True,
    },
    2: {
        "id": 2,
        "sku": "CB-BIG-2000",
        "title": "Rs.2,000 statement credit",
        "description": "The big one.",
        "kind": "bill_credit",
        "coin_cost": 20_000,
        "value_inr": 2000,
        "is_active": True,
    },
    3: {
        "id": 3,
        "sku": "VCH-DEAD-100",
        "title": "Retired voucher",
        "description": "No longer offered.",
        "kind": "voucher",
        "coin_cost": 100,
        "value_inr": 100,
        "is_active": False,
    },
}


class FakeRepo:
    """Records the call order so lock-before-read can be asserted."""

    def __init__(self, balance: int):
        self.earned = balance
        self.redeemed = 0
        self.rows: dict[int, dict] = {}
        self.by_key: dict[str, dict] = {}
        self.calls: list[str] = []
        self._next_id = 1

    def fetch_balance(self, conn):
        self.calls.append("fetch_balance")
        return {
            "coins_earned": self.earned,
            "coins_redeemed": self.redeemed,
            "balance": self.earned - self.redeemed,
        }

    def fetch_reward(self, conn, reward_id):
        self.calls.append("fetch_reward")
        return CATALOGUE.get(reward_id)

    def lock_account(self, conn):
        self.calls.append("lock_account")

    def find_by_idempotency_key(self, conn, key):
        self.calls.append("find_by_idempotency_key")
        return self.by_key.get(key)

    def insert_redemption(self, conn, *, reward_id, coin_cost, idempotency_key):
        self.calls.append("insert_redemption")
        row = {
            "id": self._next_id,
            "reward_id": reward_id,
            "coin_cost": coin_cost,
            "created_at": __import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            ),
            "reward_title": CATALOGUE[reward_id]["title"],
        }
        self._next_id += 1
        self.redeemed += coin_cost
        self.rows[row["id"]] = row
        if idempotency_key:
            self.by_key[idempotency_key] = row
        return row


@pytest.fixture
def repo(monkeypatch):
    fake = FakeRepo(balance=2_600)
    for name in (
        "fetch_balance",
        "fetch_reward",
        "lock_account",
        "find_by_idempotency_key",
        "insert_redemption",
    ):
        monkeypatch.setattr(service.repo, name, getattr(fake, name))
    return fake


@pytest.fixture
def dummy_conn() -> Any:
    """A fake connection to satisfy strict type checkers in tests."""
    return cast(Any, None)


def test_successful_redeem_debits_the_balance(repo, dummy_conn):
    result = service.redeem(dummy_conn, reward_id=1)
    assert result.coin_cost == 1_500
    assert result.balance_after == 1_100
    assert not result.replayed
    assert repo.fetch_balance(dummy_conn)["balance"] == 1_100


def test_unaffordable_redeem_is_rejected(repo, dummy_conn):
    with pytest.raises(InsufficientCoins) as exc:
        service.redeem(dummy_conn, reward_id=2)  # 20,000 coins, balance is 2,600
    assert exc.value.shortfall == 17_400
    # Nothing was written. This is the assertion that matters: a failed redeem
    # must not move the balance.
    assert "insert_redemption" not in repo.calls
    assert repo.fetch_balance(dummy_conn)["balance"] == 2_600


def test_unknown_reward_is_rejected(repo, dummy_conn):
    with pytest.raises(RewardNotFound):
        service.redeem(dummy_conn, reward_id=999)
    assert "insert_redemption" not in repo.calls


def test_retired_reward_is_rejected(repo, dummy_conn):
    with pytest.raises(RewardInactive):
        service.redeem(dummy_conn, reward_id=3)
    assert "insert_redemption" not in repo.calls


def test_balance_is_read_only_after_the_lock_is_taken(repo, dummy_conn):
    """
    Ordering test. If the affordability check reads the balance before locking the
    account row, the lock is decorative and two concurrent redeems can both pass.
    """
    service.redeem(dummy_conn, reward_id=1)
    assert "lock_account" in repo.calls
    assert repo.calls.index("lock_account") < repo.calls.index("insert_redemption")
    reads_after_lock = [
        i
        for i, call in enumerate(repo.calls)
        if call == "fetch_balance" and i > repo.calls.index("lock_account")
    ]
    assert reads_after_lock, "balance must be re-read inside the lock"


def test_replayed_request_does_not_spend_twice(repo, dummy_conn):
    first = service.redeem(dummy_conn, reward_id=1, idempotency_key="abc12345")
    second = service.redeem(dummy_conn, reward_id=1, idempotency_key="abc12345")

    assert second.replayed is True
    assert second.id == first.id
    # One debit, not two.
    assert repo.fetch_balance(dummy_conn)["balance"] == 1_100
    assert [c for c in repo.calls if c == "insert_redemption"] == ["insert_redemption"]


def test_exact_balance_is_affordable(repo, dummy_conn):
    """Boundary: cost == balance must succeed, not fail on an off-by-one."""
    repo.earned = 1_500
    result = service.redeem(dummy_conn, reward_id=1)
    assert result.balance_after == 0


def test_one_coin_short_is_rejected(repo, dummy_conn):
    repo.earned = 1_499
    with pytest.raises(InsufficientCoins):
        service.redeem(dummy_conn, reward_id=1)