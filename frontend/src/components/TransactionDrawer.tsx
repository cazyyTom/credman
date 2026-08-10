"use client";

import { coinCount, categoryLabel, dateTime, moneyExact } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { Modal } from "./ui/Modal";
import { StatusChip, Tag } from "./ui/Chip";

interface Props {
  transaction: Transaction | null;
  onClose: () => void;
}

export function TransactionDrawer({ transaction, onClose }: Props) {
  const txn = transaction;

  return (
    <Modal
      open={txn !== null}
      onClose={onClose}
      variant="drawer"
      title={txn?.merchant ?? ""}
      description={txn ? dateTime(txn.occurred_at) : undefined}
    >
      {txn && (
        <>
          <style>{css}</style>

          {/* Amount is the headline. Refunds are signed and coloured, because a
              refund shown as plain spend is actively misleading. */}
          <div className="txn__amount">
            <span
              className="mono"
              data-refund={txn.is_refund || undefined}
              style={{
                fontSize: "var(--text-3xl)",
                fontWeight: 600,
                letterSpacing: "-0.02em",
              }}
            >
              {moneyExact(txn.amount)}
            </span>
            <div className="txn__amount-tags">
              <StatusChip status={txn.status} />
              {txn.is_refund && <Tag tone="warn">Refund</Tag>}
              {txn.is_amount_outlier && (
                <Tag tone="warn" title="Excluded from analytics by default">
                  Suspicious amount
                </Tag>
              )}
            </div>
          </div>

          <dl className="txn__list">
            <Row label="Category">
              {txn.category ? (
                categoryLabel(txn.category)
              ) : (
                <span className="txn__unknown">
                  Not categorised
                  <span className="txn__note">
                    The payment arrived without one.
                  </span>
                </span>
              )}
            </Row>

            <Row label="Paid with">{txn.payment_method}</Row>

            <Row label="Coins earned">
              {txn.coins_earned > 0 ? (
                <span className="txn__coins mono">
                  <CoinMark />
                  {coinCount(txn.coins_earned)}
                </span>
              ) : (
                <span className="txn__unknown">
                  None
                  <span className="txn__note">
                    {txn.status !== "SUCCESS"
                      ? `Coins are only earned on payments that go through.`
                      : txn.is_refund
                        ? "Refunds don't earn coins."
                        : "Below ₹100."}
                  </span>
                </span>
              )}
            </Row>

            <Row label="Reference">
              <span className="mono txn__ref">{txn.external_id}</span>
              {txn.has_duplicate_external_id && (
                <span className="txn__note">
                  Another payment shares this reference. Both are real and both
                  are kept — the reference is not unique in the source data.
                </span>
              )}
            </Row>

            <Row label="Recorded at">
              <span className="mono">{dateTime(txn.occurred_at)}</span>
              <span className="txn__note">Shown in India Standard Time.</span>
            </Row>
          </dl>
        </>
      )}
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="txn__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function CoinMark() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: 15,
        height: 15,
        borderRadius: "50%",
        background: "linear-gradient(140deg, var(--brass-300), var(--brass-500))",
        color: "var(--ink-900)",
        fontSize: 9,
        fontWeight: 700,
        marginRight: 5,
        verticalAlign: -2,
      }}
    >
      ₹
    </span>
  );
}

const css = `
.txn__amount{
  padding-bottom:var(--space-5);
  border-bottom:var(--rule);
  display:flex;
  flex-direction:column;
  gap:var(--space-3);
  align-items:flex-start;
}
.txn__amount [data-refund]{color:var(--wait-400)}
.txn__amount-tags{display:flex;gap:var(--space-2);flex-wrap:wrap}

.txn__list{margin:0;display:flex;flex-direction:column}
.txn__row{
  display:grid;
  grid-template-columns:104px 1fr;
  gap:var(--space-4);
  padding:var(--space-4) 0;
  border-bottom:1px solid var(--ink-750);
  align-items:baseline;
}
.txn__row:last-child{border-bottom:none}
.txn__row dt{
  font-size:var(--text-2xs);
  font-weight:600;
  letter-spacing:0.06em;
  text-transform:uppercase;
  color:var(--paper-500);
}
.txn__row dd{margin:0;font-size:var(--text-sm);color:var(--paper-50);min-width:0}
.txn__ref{font-size:var(--text-xs);color:var(--paper-200);word-break:break-all}
.txn__coins{color:var(--brass-300);font-weight:600;display:inline-flex;align-items:center}
.txn__unknown{color:var(--paper-400);display:block}
.txn__note{
  display:block;
  font-size:var(--text-xs);
  color:var(--paper-500);
  margin-top:var(--space-1);
  line-height:1.45;
}

@media (max-width:420px){
  .txn__row{grid-template-columns:1fr;gap:var(--space-1)}
}
`;
