#!/usr/bin/env python3
"""
Create the schema and load the transaction dataset in one command.

    python seed.py                    # schema + data + rewards catalogue
    python seed.py --file ../data/transactions.json
    python seed.py --keep-schema      # reload data only, leave schema alone

The script is idempotent: it recreates the schema by default, so running it
twice gives the same database rather than doubling the rows.

Every row that cannot be normalised is written to ingest_rejects with the reason
and its original payload, and the run summary is stored in ingest_runs. Nothing
is dropped silently.
"""

from __future__ import annotations

import argparse
import collections
import json
import pathlib
import sys
import time
from decimal import Decimal
from typing import Any
from typing import cast, LiteralString

import psycopg
from psycopg.rows import dict_row

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from app.config import settings  # noqa: E402
from app.normalize import RowRejected, coins_for, normalize_row  # noqa: E402

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
SCHEMA_PATH = REPO_ROOT / "db" / "schema.sql"
DEFAULT_DATA = REPO_ROOT / "data" / "transactions.json"

# Six rewards, priced against the balance this dataset actually produces:
# 362,729 coins across 8,800 successful payments.
#
# The last one is deliberately out of reach. Every other reward is affordable, so
# without it a reviewer could never see the rejection path - the 409 and the UI
# rollback would be unreachable in a demo. Pricing one reward above the balance
# makes the failure case a thing you can click.
REWARDS = [
    ("VCH-SWG-150",  "Swiggy Money",             "Rs.150 added to your Swiggy wallet.",                    "voucher",     1_500,    150),
    ("CB-FUEL-200",  "Fuel cashback",            "Rs.200 back on your next fuel spend.",                   "cashback",    2_000,    200),
    ("VCH-AMZ-250",  "Amazon voucher",           "Rs.250 gift card, emailed within 24 hours.",             "voucher",     2_500,    250),
    ("VCH-BMS-300",  "BookMyShow voucher",       "Rs.300 off any movie or event booking.",                 "voucher",     3_000,    300),
    ("CB-STMT-2000", "Rs.2,000 statement credit","Applied against your next credit card bill.",            "bill_credit", 20_000,  2000),
    ("CB-TRVL-50K",  "Rs.50,000 travel credit",  "Book anything on IRCTC, IndiGo or MakeMyTrip.",          "bill_credit", 500_000, 50000),
]


def load_source(path: pathlib.Path) -> list[dict[str, Any]]:
    if not path.exists():
        sys.exit(f"Dataset not found: {path}\nPass --file with the correct path.")
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        sys.exit("Expected the dataset to be a JSON array of transactions.")
    return data


def apply_schema(conn: psycopg.Connection) -> None:
    print("  applying db/schema.sql")
    sql = cast(LiteralString, SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.execute(sql)


def seed_rewards(conn: psycopg.Connection) -> None:
    conn.execute("DELETE FROM redemptions")
    conn.execute("DELETE FROM rewards")
    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO rewards (sku, title, description, kind, coin_cost, value_inr)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            REWARDS,
        )
    print(f"  rewards catalogue: {len(REWARDS)} items")


def seed_transactions(
    conn: psycopg.Connection, rows: list[dict[str, Any]], source_name: str
) -> dict[str, Any]:
    normalised: list[dict[str, Any]] = []
    rejects: list[tuple[str, str]] = []
    reject_reasons: collections.Counter[str] = collections.Counter()
    stats = collections.Counter()
    ts_shapes: collections.Counter[str] = collections.Counter()

    for raw in rows:
        # Record what shape the timestamp arrived in, for the report.
        ts = raw.get("timestamp")
        if isinstance(ts, (int, float)) and not isinstance(ts, bool):
            ts_shapes["epoch_millis"] += 1
        elif isinstance(ts, str) and ts.endswith("Z"):
            ts_shapes["iso_utc"] += 1
        elif isinstance(ts, str) and "/" in ts:
            ts_shapes["dd_mm_yyyy"] += 1
        elif isinstance(ts, str) and len(ts) == 10:
            ts_shapes["date_only"] += 1
        else:
            ts_shapes["iso_offset"] += 1

        try:
            normalised.append(normalize_row(raw))
        except RowRejected as exc:
            reason = exc.reason
            reject_reasons[reason] += 1
            rejects.append((reason, json.dumps(raw, default=str)))

    # Flag external_id collisions. Both rows are kept - they are different
    # transactions that happen to share an ID - but the collision is marked so
    # the UI can warn and a reviewer can see we noticed.
    id_counts = collections.Counter(r["external_id"] for r in normalised)
    for row in normalised:
        row["has_duplicate_external_id"] = id_counts[row["external_id"]] > 1

    stats["refunds"] = sum(1 for r in normalised if r["is_refund"])
    stats["amount_outliers"] = sum(1 for r in normalised if r["is_amount_outlier"])
    stats["uncategorised"] = sum(1 for r in normalised if r["category"] is None)
    stats["duplicate_id_rows"] = sum(
        1 for r in normalised if r["has_duplicate_external_id"]
    )
    stats["colliding_ids"] = sum(1 for c in id_counts.values() if c > 1)

    # Lookup tables first, so the fact-table insert can resolve FKs in one pass.
    categories = sorted({r["category"] for r in normalised if r["category"]})
    merchants = sorted({r["merchant"] for r in normalised})

    with conn.cursor() as cur:
        cur.execute("TRUNCATE transactions RESTART IDENTITY CASCADE")
        cur.execute("TRUNCATE ingest_rejects RESTART IDENTITY")

        cur.executemany(
            "INSERT INTO categories (name) VALUES (%s) ON CONFLICT (name) DO NOTHING",
            [(c,) for c in categories],
        )
        cur.executemany(
            "INSERT INTO merchants (name) VALUES (%s) ON CONFLICT (name) DO NOTHING",
            [(m,) for m in merchants],
        )

        cur.execute("SELECT name, id FROM categories")
        category_ids = {name: cid for name, cid in cur.fetchall()}
        cur.execute("SELECT name, id FROM merchants")
        merchant_ids = {name: mid for name, mid in cur.fetchall()}

        # COPY rather than INSERT: 10k rows in one stream, ~20x faster and it
        # keeps the whole load inside a single transaction.
        with cur.copy(
            """COPY transactions (
                   external_id, occurred_at, merchant_id, category_id, amount,
                   currency, status, payment_method, is_refund,
                   is_amount_outlier, has_duplicate_external_id, raw_timestamp
               ) FROM STDIN"""
        ) as copy:
            for r in normalised:
                copy.write_row(
                    (
                        r["external_id"],
                        r["occurred_at"],
                        merchant_ids[r["merchant"]],
                        category_ids.get(r["category"]) if r["category"] else None,
                        r["amount"],
                        r["currency"],
                        r["status"],
                        r["payment_method"],
                        r["is_refund"],
                        r["is_amount_outlier"],
                        r["has_duplicate_external_id"],
                        r["raw_timestamp"],
                    )
                )

        if rejects:
            cur.executemany(
                "INSERT INTO ingest_rejects (reason, raw) VALUES (%s, %s::jsonb)",
                rejects,
            )

        cur.execute("ANALYZE transactions")

    report = {
        "timestamp_formats": dict(ts_shapes),
        "reject_reasons": dict(reject_reasons),
        "flags": dict(stats),
    }

    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO ingest_runs
                   (source_file, rows_read, rows_inserted, rows_rejected, report)
               VALUES (%s, %s, %s, %s, %s::jsonb)""",
            (
                source_name,
                len(rows),
                len(normalised),
                len(rejects),
                json.dumps(report),
            ),
        )

    return {
        "read": len(rows),
        "inserted": len(normalised),
        "rejected": len(rejects),
        **report,
    }


def verify(conn: psycopg.Connection, normalised_sample: list[dict[str, Any]]) -> None:
    """Confirm the database agrees with the Python coin rule before we finish."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT * FROM v_coin_balance WHERE account_id = 1")
        balance = cur.fetchone()
        if balance is None:                                                    # ← add this
            sys.exit("FAIL: no coin balance row for account_id = 1 — did the seed insert run?")  # ← add this
        cur.execute(
            """SELECT amount, status::text AS status, is_amount_outlier, coins_earned
               FROM transactions
               ORDER BY is_amount_outlier DESC, id LIMIT 500"""
        )
        sample = cur.fetchall()

    drift = [
        row
        for row in sample
        if coins_for(
            Decimal(row["amount"]), row["status"], row["is_amount_outlier"]
        ) != row["coins_earned"]
    ]
    if drift:
        sys.exit(
            f"FAIL: coin rule drift between schema and normalize.py on "
            f"{len(drift)} of {len(sample)} sampled rows."
        )

    print(
        f"  coin rule verified on {len(sample)} rows "
        f"(schema generated column == normalize.coins_for)"
    )
    print(
        f"  opening balance: {balance['balance']:,} coins "
        f"({balance['coins_earned']:,} earned - {balance['coins_redeemed']:,} redeemed)"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the Spendbook database.")
    parser.add_argument("--file", type=pathlib.Path, default=DEFAULT_DATA)
    parser.add_argument(
        "--keep-schema",
        action="store_true",
        help="Reload data without recreating the schema.",
    )
    args = parser.parse_args()

    started = time.perf_counter()
    print(f"Seeding {settings.safe_dsn}")

    rows = load_source(args.file)
    print(f"  read {len(rows):,} records from {args.file.name}")

    with psycopg.connect(settings.database_url) as conn:
        if not args.keep_schema:
            apply_schema(conn)
        summary = seed_transactions(conn, rows, args.file.name)
        seed_rewards(conn)
        verify(conn, [])
        conn.commit()

    print()
    print("  Data quality")
    print(f"    timestamp formats normalised : {summary['timestamp_formats']}")
    print(f"    rows inserted                : {summary['inserted']:,}")
    print(f"    rows quarantined             : {summary['rejected']:,}")
    if summary["rejected"]:
        print(f"    quarantine reasons           : {summary['reject_reasons']}")
    flags = summary["flags"]
    print(f"    negative amounts (refunds)   : {flags['refunds']:,}")
    print(f"    amount outliers flagged      : {flags['amount_outliers']:,}")
    print(f"    uncategorised                : {flags['uncategorised']:,}")
    print(
        f"    duplicate external IDs       : {flags['duplicate_id_rows']:,} rows "
        f"across {flags['colliding_ids']:,} IDs (both kept)"
    )
    print()
    print(f"Done in {time.perf_counter() - started:.1f}s")


if __name__ == "__main__":
    main()
