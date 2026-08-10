-- ============================================================================
-- CredMan - schema
-- PostgreSQL 16+ (developed against 18)
-- ============================================================================

DROP TABLE IF EXISTS redemptions       CASCADE;
DROP TABLE IF EXISTS rewards           CASCADE;
DROP TABLE IF EXISTS accounts          CASCADE;
DROP TABLE IF EXISTS transactions      CASCADE;
DROP TABLE IF EXISTS merchants         CASCADE;
DROP TABLE IF EXISTS categories        CASCADE;
DROP TABLE IF EXISTS ingest_rejects    CASCADE;
DROP TABLE IF EXISTS ingest_runs       CASCADE;
DROP VIEW  IF EXISTS v_coin_balance    CASCADE;
DROP TYPE  IF EXISTS txn_status        CASCADE;
DROP TYPE  IF EXISTS payment_method    CASCADE;
DROP TYPE  IF EXISTS redemption_status CASCADE;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
CREATE TYPE txn_status        AS ENUM ('SUCCESS', 'FAILED', 'PENDING');
CREATE TYPE payment_method    AS ENUM ('Credit Card', 'Debit Card', 'Netbanking', 'UPI');
CREATE TYPE redemption_status AS ENUM ('CONFIRMED', 'REVERSED');

-- ---------------------------------------------------------------------------
-- Lookup tables
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
    id    smallserial PRIMARY KEY,
    name  text NOT NULL UNIQUE
);

CREATE TABLE merchants (
    id    smallserial PRIMARY KEY,
    name  text NOT NULL UNIQUE
);


CREATE INDEX merchants_name_trgm_idx ON merchants USING gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Transactions (fact table)
-- ---------------------------------------------------------------------------
CREATE TABLE transactions (
    
    id            bigserial PRIMARY KEY,
    external_id   text        NOT NULL,

    occurred_at   timestamptz NOT NULL,

    merchant_id   smallint    NOT NULL REFERENCES merchants(id),

   
    category_id   smallint             REFERENCES categories(id),

    amount        numeric(14,2) NOT NULL,
    currency      char(3)       NOT NULL DEFAULT 'INR',
    status        txn_status     NOT NULL,
    payment_method payment_method NOT NULL,


    is_refund              boolean NOT NULL DEFAULT false,
    is_amount_outlier      boolean NOT NULL DEFAULT false,
    has_duplicate_external_id boolean NOT NULL DEFAULT false,

    raw_timestamp          text,

    
    coins_earned integer NOT NULL GENERATED ALWAYS AS (
        CASE
            WHEN status = 'SUCCESS' AND amount > 0 AND is_amount_outlier = false
                THEN LEAST(FLOOR(amount / 100)::int, 100)
            ELSE 0
        END
    ) STORED,

    CONSTRAINT transactions_currency_inr CHECK (currency = 'INR')
);

-- 
CREATE INDEX transactions_occurred_at_idx  ON transactions (occurred_at DESC);
CREATE INDEX transactions_amount_idx       ON transactions (amount);
CREATE INDEX transactions_category_idx     ON transactions (category_id);
CREATE INDEX transactions_status_idx       ON transactions (status);
CREATE INDEX transactions_merchant_idx     ON transactions (merchant_id);
-- Covers the common "filter by status, sort by date" path in one scan.
CREATE INDEX transactions_status_date_idx  ON transactions (status, occurred_at DESC);
CREATE INDEX transactions_external_id_idx  ON transactions (external_id);

-- ---------------------------------------------------------------------------
-- Account

-- ---------------------------------------------------------------------------
CREATE TABLE accounts (
    id           smallint PRIMARY KEY DEFAULT 1,
    display_name text NOT NULL DEFAULT 'You',
    CONSTRAINT accounts_single_row CHECK (id = 1)
);

INSERT INTO accounts (id) VALUES (1);

-- ---------------------------------------------------------------------------
-- Rewards catalogue
-- ---------------------------------------------------------------------------
CREATE TABLE rewards (
    id          smallserial PRIMARY KEY,
    sku         text    NOT NULL UNIQUE,
    title       text    NOT NULL,
    description text    NOT NULL,
    kind        text    NOT NULL,          -- 'voucher' | 'cashback' | 'bill_credit'
    coin_cost   integer NOT NULL CHECK (coin_cost > 0),
    value_inr   numeric(10,2) NOT NULL CHECK (value_inr > 0),
    is_active   boolean NOT NULL DEFAULT true
);

-- ---------------------------------------------------------------------------
-- 
-- ---------------------------------------------------------------------------
CREATE TABLE redemptions (
    id         bigserial PRIMARY KEY,
    account_id smallint  NOT NULL REFERENCES accounts(id),
    reward_id  smallint  NOT NULL REFERENCES rewards(id),
    coin_cost  integer   NOT NULL CHECK (coin_cost > 0),
    status     redemption_status NOT NULL DEFAULT 'CONFIRMED',
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Client-supplied key. A retried request reuses it and gets the original
    -- redemption back instead of spending the coins twice.
    idempotency_key text UNIQUE
);

CREATE INDEX redemptions_account_idx ON redemptions (account_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Coin balance

-- ---------------------------------------------------------------------------
CREATE VIEW v_coin_balance AS
SELECT
    a.id AS account_id,
    COALESCE((SELECT SUM(coins_earned) FROM transactions), 0)::bigint AS coins_earned,
    COALESCE((SELECT SUM(coin_cost) FROM redemptions
              WHERE account_id = a.id AND status = 'CONFIRMED'), 0)::bigint AS coins_redeemed,
    COALESCE((SELECT SUM(coins_earned) FROM transactions), 0)::bigint
      - COALESCE((SELECT SUM(coin_cost) FROM redemptions
                  WHERE account_id = a.id AND status = 'CONFIRMED'), 0)::bigint AS balance
FROM accounts a;

-- ---------------------------------------------------------------------------
-- Ingest audit
-- Rows we refused to insert, with the reason and the raw payload. This is the
-- difference between "the seed worked" and "the seed worked and here is
-- exactly what it decided about every bad row".
-- ---------------------------------------------------------------------------
CREATE TABLE ingest_rejects (
    id         bigserial PRIMARY KEY,
    run_id     bigint,
    reason     text  NOT NULL,
    raw        jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ingest_runs (
    id            bigserial PRIMARY KEY,
    source_file   text NOT NULL,
    rows_read     integer NOT NULL,
    rows_inserted integer NOT NULL,
    rows_rejected integer NOT NULL,
    report        jsonb NOT NULL,
    finished_at   timestamptz NOT NULL DEFAULT now()
);
