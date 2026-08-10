# Assumptions

Product calls made where the brief left something open, and the reasoning behind
each. Grouped by how much they'd change if you told me I got one wrong.

---

## The dataset is deliberately dirty, and that's the interesting part

`transactions.json` has 10,000 records and roughly 2,200 of them have something
wrong with them. I read that as intentional — the brief says it scores "whatever
you notice in the data" — so I treated data quality as a feature rather than
something to paper over.

The rule I applied throughout: **normalise at ingest, flag what's ambiguous,
delete nothing.** Everything is fixed once in the seed script, so the API and the
UI only ever see clean typed data. Nothing is patched in the frontend.

What's actually in there:

| Field | Problem | Count | Call |
|---|---|---|---|
| `timestamp` | Four different formats | 10,000 | All converted to UTC `timestamptz` |
| `timestamp` | Integer epoch millis | 1,007 | Parsed as ms (magnitude ~1.7e12) |
| `timestamp` | `+05:30` offset | 1,961 | Converted to UTC |
| `timestamp` | Bare `YYYY-MM-DD` | 715 | Anchored to local midnight IST |
| `timestamp` | `DD/MM/YYYY HH:MM:SS` | 841 | Day-first — see below |
| `amount` | Numeric strings | 20 | Parsed to `numeric(14,2)` |
| `amount` | Negative | 148 | Kept, flagged as refunds |
| `amount` | Above ₹1,00,000 | 3 | Kept, flagged, excluded by default |
| `category` | `null` | 150 | → `NULL` |
| `category` | Empty string | 50 | → `NULL` (same thing) |
| `status` | Lowercase `success` | 25 | Case-folded to `SUCCESS` |
| `id` | Shared by two different rows | 40 IDs | Both kept, collision flagged |

Rows rejected on a clean run: **zero**. Every one of the 10,000 is salvageable
under these rules. The quarantine path (`ingest_rejects`) exists for the rows a
future file might contain, and the seed prints its count either way.

### Timestamps are Indian Standard Time when they don't say

1,556 values carry no timezone (the bare dates and the `DD/MM` ones). Reading
them as UTC would shift each back 5½ hours and push a chunk into the previous
calendar day, which visibly distorts the monthly chart. The file is an INR
consumer app and already contains `+05:30` offsets, so IST is the more defensible
default.

### `12/10/2025` is 12 October, not 10 December

Not a guess. Across the 841 slash-format values the first component reaches 31
and the second never exceeds 12, which rules month-first out entirely. Asserted
in `tests/test_normalize.py`.

### Negative amounts are refunds, and they stay

A spending view that silently drops money flowing *back* to the user is wrong.
They're kept, signed, coloured differently in the table, and netted into the
category totals. There's a toggle to exclude them.

One consequence worth naming: amount range filters compare **magnitude**, so a
−₹900 refund matches a "₹500–₹1,000" filter. Comparing the signed value would put
every refund below every minimum, which isn't what anyone means by that filter.

### Three amounts are data errors, not spending

₹5,18,900, ₹7,42,350 and ₹99,99,99,999 against a genuine distribution that tops
out near ₹55,000 (p99 ≈ ₹49,850). Left in the table — they're real rows —
but excluded from analytics by default, because one of them alone would flatten
every other bar to invisibility. The charts say "3 excluded" rather than quietly
disagreeing with the source file, and a toggle puts them back.

### Duplicate IDs are two real payments, not one duplicated

This one surprised me. I expected exact duplicate rows and was ready to dedupe.
They're not: the 40 collisions are pairs of genuinely different transactions
(different merchant, amount, date) that happen to share a reference.

So `external_id` is **not** a unique key. The table uses a surrogate `bigserial`
PK, both rows are kept, and the pair is flagged with `has_duplicate_external_id`
(shown as a "dup ref" tag). Deduping would have deleted 40 real payments and
~₹1.4L of spend to satisfy a constraint the source data never honoured.

### Empty-string and null category mean the same thing: unknown

Both become `NULL` and render as *Uncategorised* in italics. I didn't invent an
"Other" bucket — that would launder a data gap into something that looks like a
real category. It's filterable as its own facet, since 200 uncategorised payments
is a thing a user might legitimately want to isolate.

---

## Rewards

**1 coin per ₹100, capped at 100 coins per transaction.** The brief specifies the
rate and says "capped per transaction" without giving a number. 100 felt like the
natural round cap at that rate (it caps out at ₹10,000 of spend). It also does
real work: the ₹99,99,99,999 outlier would otherwise mint 10 million coins on its
own and make every reward free.

**Only successful, non-refund payments earn.** FAILED and PENDING earn nothing —
money that didn't move shouldn't earn a reward, and PENDING may still fail.
Refunds earn nothing, but I also don't claw back coins from the original payment;
that needs a link between the refund and the transaction it reverses, which this
dataset doesn't have.

Resulting balance from this dataset: **362,729 coins** across 8,800 successful
payments. (Note it's 8,800, not the 8,775 a naive read gives — the 25 lowercase
`success` rows are real successes and earn real coins. Missing that case-fold
would have quietly lost coins.)

**Six rewards, and one deliberately out of reach.** The ₹50,000 travel credit
costs 500,000 coins, above the 362,729 available. Without it every reward would
be affordable and the rejection path — the 409, the error state, the rollback —
would be unreachable in a demo. Now it's a thing you can click.

**Coins are never stored as a number.** The balance is derived: sum of
`coins_earned` minus confirmed redemptions. A cached integer balance is a classic
place for money bugs to hide.

---

## UI calls

**A right-hand drawer for detail, not a modal.** Payment detail is a reference
lookup — you check it against the row you clicked. A drawer keeps the table
visible; a centred modal covers it.

**Status is relabelled for humans.** The data says `SUCCESS`, the UI says
**Paid**. Likewise `FAILED` → *Failed*, `PENDING` → *Pending*. Users don't
think in enum values.

**Category colours are index-stable**, so a slice keeps its colour as filters
change. Uncategorised is always grey, never part of the ramp — it isn't a
category, so it shouldn't look like one.

**Chart clicks toggle.** Clicking Groceries filters to Groceries; clicking it
again clears it. Additive multi-select rather than replace, so the chart and the
filter pills stay one shared state.

**The month bars derive their selection from the date range** rather than storing
it separately, which means the highlighted bar and the date inputs can't
disagree.
