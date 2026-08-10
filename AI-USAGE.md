# AI usage

## Tools

**Claude Code** — the main one. Used for scaffolding the FastAPI layering,
drafting the CSS for the table and modal, writing the first pass of the
normalisation functions, and as a reviewer on the schema.

**GitHub Copilot** — inline completion in the editor. Genuinely useful for
repetitive shapes (the pydantic models, the column definitions, the token block in
`globals.css`), close to useless for anything requiring a decision.

## Where

| Area | How much is AI |
|---|---|
| CSS for the table, modal, filter bar | Heavily drafted, then substantially rewritten |
| FastAPI structure, pydantic models | Drafted, kept with edits |
| `normalize.py` | Drafted, then rewritten once I'd profiled the data |
| `db/schema.sql` | Written by me, reviewed by Claude — the review caught two things |
| Redeem concurrency and locking | Mine. Discussed with Claude, wrote it myself |
| Tests | Drafted by claude; the assertions are the part worth thinking about |
| README / these docs | Claude, with help tightening the prose |

## Things I threw away

### 1. Deduplicating transaction IDs — would have deleted real payments

I asked for a seed script for a dataset with duplicate IDs. What came back was
the obvious thing, and what I'd have written myself:

```sql
external_id text NOT NULL UNIQUE
```

```python
seen = set()
for row in rows:
    if row["id"] in seen:
        continue          # skip duplicate
    seen.add(row["id"])
```

Clean, conventional, and wrong for this data. I checked before trusting it:

```python
dups = {k: v for k, v in groupby_id.items() if len(v) > 1}
identical = sum(1 for v in dups.values() if all(x == v[0] for x in v))
# 40 duplicate IDs, 0 exact-identical groups
```

Zero of the 40 groups are actual duplicates. They're pairs of genuinely different
transactions — different merchant, amount and date — that happen to collide on a
reference number. One pair is ACT Fibernet for ₹3,133.69 on 7 March and
McDonald's for ₹655.81 on 26 March, both `TXN2025000336`.

That `continue` would have silently deleted 40 real payments and about ₹1.4L of
spend to satisfy a uniqueness constraint the source data never honoured. Rewritten
to use a surrogate `bigserial` PK, keep both rows, and flag the collision with
`has_duplicate_external_id` so it surfaces in the UI instead of vanishing.

The lesson I took: AI is fluent in the *conventional* handling of a problem, and
dirty data is exactly where the convention is wrong. It had no way to know, because
it hadn't looked at the data. I hadn't either, at that point.

### 2. Naive timestamps as UTC — would have shifted 1,556 rows into the wrong day

The first `parse_timestamp` handled all four formats correctly but defaulted
timezone-less values to UTC:

```python
if parsed.tzinfo is None:
    parsed = parsed.replace(tzinfo=timezone.utc)   # wrong default here
```

Defensible in the abstract — UTC is the right default for most systems. Wrong for
this file. 715 bare dates and 841 `DD/MM/YYYY` values carry no zone, and 1,961
*other* rows carry an explicit `+05:30`, in a dataset that's uniformly INR with
Indian merchants. The naive values are almost certainly IST with the zone dropped
somewhere upstream.

Treating them as UTC shifts each back 5½ hours, which pushes a chunk of them into
the previous calendar day and moves some across a month boundary — visibly wrong
in the monthly chart, and invisible in the table. Changed to `Asia/Kolkata`.

Related, same function: it parsed `12/10/2025` with `dateutil`-style inference. I
didn't want an inference on something this consequential, so I checked whether the
data could settle it:

```
first component max: 31    second component max: 12
first > 12: 498            second > 12: 0
```

Day-first, proven. Now an explicit regex with the evidence written into the
docstring and a test asserting it. An assumption I can defend beats a library
guessing correctly.

### 3. A rewards catalogue nobody could fail to afford

I asked for six rewards priced against "the balance this dataset generates". The
prices that came back were reasonable-looking — 1,500 to 20,000 coins — based on
an estimate of the coin total.

The actual total, computed:

```
total coins earned: 362,729
```

Every reward was affordable several times over, which meant the entire failure
path — the 409, the error state in the modal, the optimistic rollback — was
**unreachable by clicking**. I'd built the thing the brief specifically asks about
and then made it impossible to demo.

Added a ₹50,000 travel credit at 500,000 coins. Now the rejection path is one
click, and the rollback is something a reviewer can watch happen.

Also worth noting what the recomputation caught: the naive coin total is 8,775
successful payments, but the real figure is **8,800**. The extra 25 are the
lowercase `success` rows. Without the case-fold in `parse_status`, those payments
silently earn nothing — the kind of bug that never throws an error and just
quietly shortchanges the user.

### 4. Two things the review caught in my own schema

I had Claude review `schema.sql`. Two useful catches:

- I'd written `border-bottom` on the sticky `<th>` (in the CSS, reviewed in the
  same pass). A border on a sticky cell scrolls away with the cell in several
  browsers, leaving the header with no bottom edge. Changed to
  `box-shadow: inset 0 -1px 0`.
- I was sorting by `occurred_at` alone. With 10,000 rows and duplicate
  timestamps, Postgres doesn't guarantee a consistent order for ties between
  queries, so a row can appear on two pages or none. Added `id DESC` as a
  tiebreaker to make the ordering total.

The second is a real bug I'd have shipped. It's invisible on a small dataset and
only shows up when you page through 10,000 rows and notice the count doesn't add
up.

### 5. Amount of three payment were relatively huge then the others.

Removed those payments by default

- If i have considered those payments than a user will onlyable to see only one part in piechart and only one bar in graph because the huge magnitude difference would made others bar negligible.
- If i have considered those high amount payment for reward soins, Then the number of coins the user had would be huge, which make him claim unlimited rewards.

The second is a real bug I'd have shipped. It's invisible on a small dataset and
only shows up when you page through 10,000 rows and notice the count doesn't add
up.

## How I worked with it

The pattern that held: AI drafts, I verify against the data, I keep what survives.
Nearly everything it got wrong here was wrong in the same way — a sensible general
default applied to a dataset with specific, deliberate quirks. It's fast and
usually right about *form*, and it can't check facts it hasn't been shown.

Every non-trivial claim in `ASSUMPTIONS.md` has a script behind it that I ran. Where
I couldn't verify something, I wrote down the assumption instead of asserting it.

I can walk through any file in this repo and explain why it's shaped the way it is.
