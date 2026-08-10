"""HTTP layer for coins, the rewards catalogue and redeeming."""

from __future__ import annotations

from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.db import get_conn
from app.schemas import CoinBalance, RedeemRequest, Redemption, Reward
from app.services import rewards as service
from app.services.rewards import InsufficientCoins, RewardInactive, RewardNotFound

router = APIRouter(prefix="/api", tags=["rewards"])


@router.get("/coins/balance", response_model=CoinBalance)
def get_balance(conn: Annotated[psycopg.Connection, Depends(get_conn)]) -> CoinBalance:
    return service.get_balance(conn)


@router.get("/rewards", response_model=list[Reward])
def list_rewards(
    conn: Annotated[psycopg.Connection, Depends(get_conn)],
) -> list[Reward]:
    return service.list_rewards(conn)


@router.post(
    "/redemptions",
    response_model=Redemption,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"description": "Reward does not exist"},
        409: {"description": "Balance too low, or reward no longer redeemable"},
    },
)
def redeem(
    payload: RedeemRequest,
    response: Response,
    conn: Annotated[psycopg.Connection, Depends(get_conn)],
) -> Redemption:
    """
    Redeem coins for a reward.

    Status codes are chosen to be actionable for the client:
      201  redeemed
      200  replay of an earlier request with the same idempotency key
      404  no such reward - a client bug or a stale catalogue
      409  the request was well formed but conflicts with current state
           (balance too low, or the reward was retired). Distinct from 422,
           which would mean the request body itself was malformed.

    The transaction is committed only on success. Any exception rolls the whole
    thing back, including the account lock, so a rejected redeem cannot leave the
    balance in a partial state.
    """
    try:
        result = service.redeem(
            conn,
            reward_id=payload.reward_id,
            idempotency_key=payload.idempotency_key,
        )
        conn.commit()
    except RewardNotFound:
        conn.rollback()
        raise HTTPException(
            status_code=404,
            detail={
                "code": "reward_not_found",
                "message": "That reward is no longer in the catalogue.",
            },
        )
    except RewardInactive:
        conn.rollback()
        raise HTTPException(
            status_code=409,
            detail={
                "code": "reward_inactive",
                "message": "That reward is no longer available to redeem.",
            },
        )
    except InsufficientCoins as exc:
        conn.rollback()
        raise HTTPException(
            status_code=409,
            detail={
                "code": "insufficient_coins",
                "message": (
                    f"You need {exc.shortfall:,} more coins to redeem this reward."
                ),
                "balance": exc.balance,
                "required": exc.required,
                "shortfall": exc.shortfall,
            },
        )
    except psycopg.Error:
        conn.rollback()
        raise HTTPException(
            status_code=503,
            detail={
                "code": "database_unavailable",
                "message": "Could not reach the database. Your coins were not spent.",
            },
        )

    if result.replayed:
        response.status_code = status.HTTP_200_OK
    return result


@router.get("/redemptions", response_model=list[Redemption])
def list_redemptions(
    conn: Annotated[psycopg.Connection, Depends(get_conn)],
) -> list[Redemption]:
    from app.repositories import rewards as repo

    balance = repo.fetch_balance(conn)["balance"]
    return [
        Redemption(
            id=row["id"],
            reward_id=row["reward_id"],
            reward_title=row["reward_title"],
            coin_cost=row["coin_cost"],
            created_at=row["created_at"],
            balance_after=balance,
        )
        for row in repo.fetch_history(conn)
    ]
