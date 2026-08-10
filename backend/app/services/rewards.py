"""
Business logic for coins and redemptions.

Domain failures are raised as typed exceptions and translated to HTTP status
codes in the API layer, so this module stays testable without a web server.
"""

from __future__ import annotations

import psycopg

from app.repositories import rewards as repo
from app.schemas import CoinBalance, Redemption, Reward


class RewardNotFound(Exception):
    """The reward id does not exist, or has been retired. -> 404"""


class RewardInactive(Exception):
    """The reward exists but is no longer redeemable. -> 409"""


class InsufficientCoins(Exception):
    """The balance does not cover the reward. -> 409"""

    def __init__(self, balance: int, required: int):
        super().__init__(f"balance {balance} < required {required}")
        self.balance = balance
        self.required = required
        self.shortfall = required - balance


def get_balance(conn: psycopg.Connection) -> CoinBalance:
    return CoinBalance(**repo.fetch_balance(conn))


def list_rewards(conn: psycopg.Connection) -> list[Reward]:
    balance = repo.fetch_balance(conn)["balance"]
    return [
        Reward(**row, affordable=row["coin_cost"] <= balance)
        for row in repo.fetch_catalogue(conn)
    ]


def redeem(
    conn: psycopg.Connection,
    *,
    reward_id: int,
    idempotency_key: str | None = None,
) -> Redemption:
    """
    Spend coins on a reward.

    Ordering matters and is deliberate:
      1. Replay check first, before any lock, so a retried request is cheap.
      2. Lock the account row. Everything after this point is serialised, which
         is what makes the affordability check trustworthy.
      3. Re-read the balance *inside* the lock. Reading it before would defeat
         the lock entirely.
      4. Validate, then insert.

    The caller owns the transaction boundary: the API layer commits on success and
    rolls back on any exception, so a rejected redeem leaves no trace.
    """
    if idempotency_key:
        existing = repo.find_by_idempotency_key(conn, idempotency_key)
        if existing:
            balance = repo.fetch_balance(conn)["balance"]
            return Redemption(
                id=existing["id"],
                reward_id=existing["reward_id"],
                reward_title=existing["reward_title"],
                coin_cost=existing["coin_cost"],
                created_at=existing["created_at"],
                balance_after=balance,
                replayed=True,
            )

    repo.lock_account(conn)

    reward = repo.fetch_reward(conn, reward_id)
    if reward is None:
        raise RewardNotFound(f"reward {reward_id} does not exist")
    if not reward["is_active"]:
        raise RewardInactive(f"reward {reward_id} is not redeemable")

    balance = repo.fetch_balance(conn)["balance"]
    if balance < reward["coin_cost"]:
        raise InsufficientCoins(balance, reward["coin_cost"])

    row = repo.insert_redemption(
        conn,
        reward_id=reward["id"],
        coin_cost=reward["coin_cost"],
        idempotency_key=idempotency_key,
    )

    return Redemption(
        id=row["id"],
        reward_id=row["reward_id"],
        reward_title=reward["title"],
        coin_cost=row["coin_cost"],
        created_at=row["created_at"],
        balance_after=balance - reward["coin_cost"],
        replayed=False,
    )
