# CredMan - Credit Management App

A transactions and rewards dashboard for a credit-card app. 10,000 payments, spend
analytics, and reward coins you can redeem — React/Next.js frontend, FastAPI
backend, PostgreSQL.

Built as a take-home for Digital Alpha Technologies.

 · walkthrough video `<URL>`

---

## What it does

- **Payments table** over the full 10k rows — filter by category, status, payment
  method, date range and amount range (all combinable), search merchants as you
  type, sort by date or amount. Pagination, filtering and sorting all happen in
  Postgres, so the browser only ever holds one page.
- **Spend analytics** — category breakdown and a 14-month trend. Both filter the
  table, and the table's filters reshape both charts. Two-way.
- **Reward coins** — 1 coin per ₹100 on successful payments, capped per
  transaction. Balance always visible. Redeem against six rewards with an
  optimistic balance update and a clean rollback if the call fails.
- **Dirty data handled properly.** The dataset has four timestamp formats,
  string amounts, negative amounts, absurd outliers, missing categories,
  inconsistent status casing and colliding IDs. All of it is normalised at ingest
  — see [ASSUMPTIONS.md](./ASSUMPTIONS.md).

## Stack

| | |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript strict, Recharts |
| Backend | FastAPI, psycopg 3, pydantic v2 |
| Database | PostgreSQL 18 |
| Styling | CSS custom-property design tokens. No UI library — table and modal are hand-built |

---

## Local setup

Needs Docker (or any Postgres 16+), Python 3.11+, and Node 20+.

```bash
git clone https://github.com/cazyyTom/credman && cd CredMan
```

### 1. Database

```bash
contains docker.compose.example, coty that and make your own
```

Postgres 18 on `localhost:5432`, database/user/password all `credman`.

Already have Postgres? Skip this and point `DATABASE_URL` at it instead.

### 2. Backend and seed

```bash
cd backend
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env

python seed.py
```

**`python seed.py` is the one command.** It creates the schema, normalises and
loads all 10,000 rows, seeds the rewards catalogue, verifies that the coin rule in
the database agrees with the one in Python, and prints a data-quality report:

```
Seeding postgresql://credman:***@localhost:5432/credman
  read 10,000 records from transactions.json
  applying db/schema.sql
  rewards catalogue: 6 items
  coin rule verified on 500 rows (schema generated column == normalize.coins_for)
  opening balance: 362,729 coins (362,729 earned - 0 redeemed)

  Data quality
    timestamp formats normalised : {'iso_utc': 5476, 'iso_offset': 1961,
                                    'epoch_millis': 1007, 'dd_mm_yyyy': 841,
                                    'date_only': 715}
    rows inserted                : 10,000
    rows quarantined             : 0
    negative amounts (refunds)   : 148
    amount outliers flagged      : 3
    uncategorised                : 200
    duplicate external IDs       : 80 rows across 40 IDs (both kept)
```

It's idempotent — run it again and you get the same database, not double the rows.

Then start the API:

```bash
uvicorn app.main:app --reload
```

→ `http://localhost:8000` · interactive docs at `/docs`

### 3. Frontend

```bash
cd ../frontend
npm install
cp .env.example .env.local
npm run dev
```

→ `http://localhost:3000`

### Tests

```bash
cd backend && pytest        # 33 tests, no database needed
```

---

## API

| Method | Route | |
|---|---|---|
| `GET` | `/api/transactions` | Paged, filtered, sorted. Returns rows + total count + filtered sum + coins in one round trip |
| `GET` | `/api/transactions/{id}` | One payment |
| `GET` | `/api/analytics` | Category breakdown + monthly trend for the same filter set |
| `GET` | `/api/filter-options` | Filter values derived from the data |
| `GET` | `/api/coins/balance` | Coin balance (derived, never stored) |
| `GET` | `/api/rewards` | Catalogue with affordability |
| `POST` | `/api/redemptions` | Redeem. `201` created · `200` idempotent replay · `404` no such reward · `409` balance too low or reward retired |
| `GET` | `/api/redemptions` | Redemption history |
| `GET` | `/health` | Liveness + database check |

`/api/transactions` and `/api/analytics` accept an identical filter set — that's
what makes cross-filtering two-way without a second implementation.

```
GET /api/transactions
  ?search=starbucks&category=Food+%26+Dining&status=SUCCESS
  &date_from=2026-01-01T00:00:00Z&min_amount=500&max_amount=5000
  &page=1&page_size=50&sort=amount&order=desc
```

---

## Repo layout

```
db/schema.sql              Types, tables, indexes, generated coin column
backend/
  seed.py                  One-command schema + load + data-quality report
  app/
    normalize.py            All dirty-data rules, pure and tested
    api/                    HTTP: parse, validate, delegate
    services/               Business logic. No SQL, no HTTP
    repositories/           SQL. Nothing else
    schemas.py              Pydantic — the API contract
  tests/                    33 tests, no database required
frontend/src/
  app/globals.css           Design tokens. Every colour and space lives here
  components/DataTable.tsx  Hand-built table
  components/ui/Modal.tsx   Hand-built modal: focus trap, Escape, restore
  hooks/useTransactions.ts  Fetch lifecycle: abort, sequence guard, keep-previous
  lib/api.ts                Typed client, typed errors
```

---

## Done / not done

### Done

**Core**
- Payments table on all 10k rows: combinable filters, type-ahead merchant search,
  sort by date and amount — all server-side
- Both charts: category breakdown and monthly trend
- Two-way cross-filtering (charts ↔ table)
- Coin balance always visible; full redeem flow with select → confirm → done
- Backend rejects unaffordable redeems (`409`) and unknown rewards (`404`)
- PostgreSQL with a designed schema and a one-command seed

**Nice-to-have**
- Server-side pagination, filtering and sorting
- Optimistic balance update with snapshot rollback on failure
- Hand-built modal: focus trap, Escape, focus restoration, scroll lock
- Hand-built table: sticky header, hover/focus/loading/empty/error states,
  responsive to 360px by dropping columns rather than scrolling

**Bonus**
- 33 tests, including the redeem endpoint's rejection paths, the lock ordering,
  and idempotent replay
- Idempotency keys on redeem, so a retry can't double-spend
- Accessibility: semantic table with `aria-sort`, keyboard-navigable rows,
  chart legends as focusable controls, skip link, live regions for async results,
  `prefers-reduced-motion` respected, visible focus everywhere
- Data-quality flags surfaced in the UI (refunds, outliers, duplicate references)
  with toggles to include or exclude


### Known issues

- **Amount filters compare magnitude**, so a −₹900 refund matches a ₹500–₹1,000
  filter. Intentional (a refund shouldn't fall below every minimum), but it can
  surprise you. Documented in ASSUMPTIONS.md.
- **The date filter sends UTC boundaries** while the UI displays IST. A payment at
  02:00 IST sits in the previous UTC day, so a single-day filter can be off by a
  few edge rows. The fix is to send IST-offset boundaries; I ran out of clock.
- **The month bars derive their selected state** from whether the date range
  exactly matches a calendar month. Hand-editing the dates to a near-month range
  leaves no bar highlighted, which is correct but can look inert.


---

## Further reading

- [ASSUMPTIONS.md](./ASSUMPTIONS.md) — every product call, with the evidence
- [AI-USAGE.md](./AI-USAGE.md) — tools used, and four things I threw away
