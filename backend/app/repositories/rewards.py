"""Data access for the coin balance, rewards catalogue and redemptions."""

from __future__ import annotations

from typing import Any

import psycopg

ACCOUNT_ID = 1


def fetch_balance(conn: psycopg.Connection) -> dict[str, int]:
    row = conn.execute(
        "SELECT coins_earned, coins_redeemed, balance FROM v_coin_balance "
        "WHERE account_id = %s",
        [ACCOUNT_ID],
    ).fetchone()
    return {
        "coins_earned": int(row["coins_earned"]),
        "coins_redeemed": int(row["coins_redeemed"]),
        "balance": int(row["balance"]),
    }


def fetch_catalogue(conn: psycopg.Connection) -> list[dict[str, Any]]:
    return conn.execute(
        """SELECT id, sku, title, description, kind, coin_cost, value_inr
           FROM rewards
           WHERE is_active = true
           ORDER BY coin_cost"""
    ).fetchall()


def fetch_reward(conn: psycopg.Connection, reward_id: int) -> dict[str, Any] | None:
    return conn.execute(
        """SELECT id, sku, title, description, kind, coin_cost, value_inr, is_active
           FROM rewards WHERE id = %s""",
        [reward_id],
    ).fetchone()


def find_by_idempotency_key(conn: psycopg.Connection, key: str) -> dict[str, Any] | None:
    return conn.execute(
        """SELECT r.id, r.reward_id, r.coin_cost, r.created_at, w.title AS reward_title
           FROM redemptions r
           JOIN rewards w ON w.id = r.reward_id
           WHERE r.idempotency_key = %s""",
        [key],
    ).fetchone()


def lock_account(conn: psycopg.Connection) -> None:
    """
    Take a row lock on the account for the rest of the transaction.

    This is the whole concurrency story. Without it, two redeem requests arriving
    together can both read a balance of 2,600, both decide a 2,500-coin reward is
    affordable, and both insert - leaving the balance at 100 coins short of zero.
    Serialising on this row makes the read-check-write sequence atomic.
    """
    conn.execute("SELECT id FROM accounts WHERE id = %s FOR UPDATE", [ACCOUNT_ID])


def insert_redemption(
    conn: psycopg.Connection,
    *,
    reward_id: int,
    coin_cost: int,
    idempotency_key: str | None,
) -> dict[str, Any]:
    return conn.execute(
        """INSERT INTO redemptions (account_id, reward_id, coin_cost, idempotency_key)
           VALUES (%s, %s, %s, %s)
           RETURNING id, reward_id, coin_cost, created_at""",
        [ACCOUNT_ID, reward_id, coin_cost, idempotency_key],
    ).fetchone()


def fetch_history(conn: psycopg.Connection, limit: int = 20) -> list[dict[str, Any]]:
    return conn.execute(
        """SELECT r.id, r.reward_id, r.coin_cost, r.created_at,
                  w.title AS reward_title
           FROM redemptions r
           JOIN rewards w ON w.id = r.reward_id
           WHERE r.account_id = %s AND r.status = 'CONFIRMED'
           ORDER BY r.created_at DESC
           LIMIT %s""",
        [ACCOUNT_ID, limit],
    ).fetchall()
