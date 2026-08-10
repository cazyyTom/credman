"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api } from "@/lib/api";
import { coinCount, money } from "@/lib/format";
import type { CoinBalance, Reward } from "@/lib/types";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Modal } from "./ui/Modal";
import { Tag } from "./ui/Chip";

type Phase = "idle" | "confirming" | "redeeming" | "done";

interface Toast {
  tone: "ok" | "fail";
  message: string;
}

/**
 * Coin balance and the redeem flow.
 *
 * The balance is optimistic: it drops the moment the user confirms, then either
 * settles on the server's figure or rolls back. The rules that keep that honest:
 *
 *  - The server's number always wins. On success we take `balance_after` from the
 *    response rather than keeping our own arithmetic, so a concurrent redeem in
 *    another tab cannot leave us displaying a stale total.
 *  - Rollback restores a snapshot taken before the request, not
 *    `balance + cost`. Recomputing would bake in whatever drift caused the
 *    failure.
 *  - One redeem at a time. The confirm button is disabled while in flight, and
 *    an idempotency key means a retry that did reach the server returns the
 *    original redemption instead of spending twice.
 */
export function RewardsPanel() {
  const [balance, setBalance] = useState<CoinBalance | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);

  const [selected, setSelected] = useState<Reward | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  // Regenerated per confirm attempt, so a retry after a network failure reuses
  // the same key and cannot double-spend.
  const idempotencyKey = useRef<string>("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [nextBalance, nextRewards] = await Promise.all([
        api.balance(signal),
        api.rewards(signal),
      ]);
      setBalance(nextBalance);
      setRewards(nextRewards);
    } catch (error) {
      if (error instanceof ApiError) setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const openConfirm = (reward: Reward) => {
    idempotencyKey.current = `rdm-${reward.id}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    setSelected(reward);
    setRedeemError(null);
    setPhase("confirming");
  };

  const closeConfirm = () => {
    if (phase === "redeeming") return; // Don't let the user close mid-flight.
    setSelected(null);
    setPhase("idle");
    setRedeemError(null);
  };

  const confirmRedeem = async () => {
    if (!selected || !balance) return;

    // Snapshot for rollback, taken before anything changes.
    const snapshot = balance;
    const reward = selected;

    setPhase("redeeming");
    setRedeemError(null);

    // Optimistic: spend the coins in the UI immediately.
    setBalance({
      ...snapshot,
      balance: snapshot.balance - reward.coin_cost,
      coins_redeemed: snapshot.coins_redeemed + reward.coin_cost,
    });
    setRewards((current) =>
      current.map((r) => ({
        ...r,
        affordable: r.coin_cost <= snapshot.balance - reward.coin_cost,
      })),
    );

    try {
      const result = await api.redeem(reward.id, idempotencyKey.current);

      // Settle on the server's figure, not ours.
      setBalance({
        coins_earned: snapshot.coins_earned,
        coins_redeemed: snapshot.coins_earned - result.balance_after,
        balance: result.balance_after,
      });
      setRewards((current) =>
        current.map((r) => ({ ...r, affordable: r.coin_cost <= result.balance_after })),
      );

      setPhase("done");
      setToast({
        tone: "ok",
        message: result.replayed
          ? `Already redeemed — ${reward.title} is on its way.`
          : `Redeemed. ${reward.title} is on its way.`,
      });
      setSelected(null);
      setPhase("idle");
    } catch (error) {
      // Roll back to the snapshot. The balance returns to exactly what it was.
      setBalance(snapshot);
      setRewards((current) =>
        current.map((r) => ({ ...r, affordable: r.coin_cost <= snapshot.balance })),
      );

      const apiError = error instanceof ApiError ? error : null;
      setPhase("confirming");
      setRedeemError(
        apiError?.message ?? "That didn't go through. Your coins weren't spent.",
      );

      // A stale catalogue is the one failure the user cannot fix by retrying,
      // so refetch it rather than leaving a dead button on screen.
      if (apiError?.code === "reward_not_found" || apiError?.code === "reward_inactive") {
        void load();
      }
    }
  };

  return (
    <>
      <style>{css}</style>

      <Card
        title="Reward coins"
        hint="1 coin per ₹100 on payments that go through"
        action={
          loadError ? (
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          ) : null
        }
      >
        {/* Signature element: the balance as a struck brass coin. */}
        <div className="rw__balance">
          <div className="rw__coin" aria-hidden="true">
            <span>₹</span>
          </div>
          <div className="rw__balance-text">
            {loading ? (
              <span className="rw__balance-skeleton" />
            ) : loadError ? (
              <span className="rw__balance-error">—</span>
            ) : (
              <span className="rw__balance-value mono">
                {coinCount(balance?.balance ?? 0)}
              </span>
            )}
            <span className="rw__balance-label">
              coins available
              {balance && !loading && (
                <span className="rw__balance-sub mono">
                  {coinCount(balance.coins_earned)} earned ·{" "}
                  {coinCount(balance.coins_redeemed)} spent
                </span>
              )}
            </span>
          </div>
        </div>

        {loadError ? (
          <p className="rw__error-block">{loadError.message}</p>
        ) : (
          <ul className="rw__list">
            {(loading ? Array.from({ length: 4 }) : rewards).map((item, index) => {
              if (!item) {
                return (
                  <li key={`sk-${index}`} className="rw__item" aria-hidden="true">
                    <span className="rw__shimmer" style={{ width: "58%" }} />
                    <span className="rw__shimmer" style={{ width: 64, height: 28 }} />
                  </li>
                );
              }
              const reward = item as Reward;
              return (
                <li key={reward.id} className="rw__item" data-locked={!reward.affordable || undefined}>
                  <div className="rw__item-text">
                    <span className="rw__item-title">
                      {reward.title}
                      <Tag tone="neutral">{money(reward.value_inr)}</Tag>
                    </span>
                    <span className="rw__item-desc">{reward.description}</span>
                  </div>
                  <div className="rw__item-action">
                    <span className="rw__cost mono" data-affordable={reward.affordable || undefined}>
                      {coinCount(reward.coin_cost)}
                    </span>
                    <Button
                      variant={reward.affordable ? "coin" : "secondary"}
                      size="sm"
                      disabled={!reward.affordable}
                      onClick={() => openConfirm(reward)}
                      title={
                        reward.affordable
                          ? undefined
                          : `You need ${coinCount(
                              reward.coin_cost - (balance?.balance ?? 0),
                            )} more coins`
                      }
                    >
                      {reward.affordable ? "Redeem" : "Locked"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal
        open={phase === "confirming" || phase === "redeeming"}
        onClose={closeConfirm}
        title="Confirm redemption"
        description={selected ? `${selected.title} — ${money(selected.value_inr)}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={closeConfirm} disabled={phase === "redeeming"}>
              Cancel
            </Button>
            <Button
              variant="coin"
              onClick={() => void confirmRedeem()}
              loading={phase === "redeeming"}
            >
              {phase === "redeeming" ? "Redeeming" : "Redeem coins"}
            </Button>
          </>
        }
      >
        {selected && balance && (
          <div className="rw__confirm">
            <dl className="rw__confirm-rows">
              <div>
                <dt>Balance now</dt>
                <dd className="mono">{coinCount(balance.balance)}</dd>
              </div>
              <div>
                <dt>This reward</dt>
                <dd className="mono rw__confirm-debit">
                  −{coinCount(selected.coin_cost)}
                </dd>
              </div>
              <div className="rw__confirm-total">
                <dt>Balance after</dt>
                <dd className="mono">
                  {coinCount(balance.balance - selected.coin_cost)}
                </dd>
              </div>
            </dl>

            {redeemError && (
              <p className="rw__confirm-error" role="alert">
                {redeemError}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Live region so the outcome is announced, not only shown. */}
      <div aria-live="polite" role="status">
        {toast && (
          <div className="rw__toast" data-tone={toast.tone}>
            {toast.message}
          </div>
        )}
      </div>
    </>
  );
}

const css = `
/* --- Balance -------------------------------------------------------------- */
.rw__balance{
  display:flex;
  align-items:center;
  gap:var(--space-4);
  padding-bottom:var(--space-5);
  border-bottom:var(--rule);
}
.rw__coin{
  width:52px;
  height:52px;
  flex-shrink:0;
  display:grid;
  place-items:center;
  border-radius:50%;
  background:radial-gradient(circle at 32% 28%,var(--brass-300),var(--brass-500) 68%);
  color:var(--ink-900);
  font-family:var(--font-display);
  font-size:22px;
  font-weight:700;
  /* Struck-metal edge: a bright inner rim and a soft outer glow. */
  box-shadow:
    inset 0 1px 1px rgba(255,255,255,0.55),
    inset 0 -2px 3px rgba(0,0,0,0.22),
    0 0 0 1px var(--brass-500),
    0 0 24px var(--brass-glow);
}
.rw__balance-text{display:flex;flex-direction:column;min-width:0}
.rw__balance-value{
  font-size:var(--text-2xl);
  font-weight:600;
  letter-spacing:-0.02em;
  line-height:1.1;
  color:var(--brass-300);
}
.rw__balance-error{font-size:var(--text-2xl);color:var(--paper-500)}
.rw__balance-label{
  font-size:var(--text-xs);
  color:var(--paper-500);
  display:flex;
  flex-direction:column;
  gap:1px;
}
.rw__balance-sub{font-size:var(--text-2xs);color:var(--paper-500);opacity:0.8}
.rw__balance-skeleton{
  display:block;
  width:110px;
  height:26px;
  border-radius:var(--radius-sm);
  background:var(--ink-750);
  animation:rw-pulse 1.5s ease-in-out infinite;
}

/* --- Catalogue ------------------------------------------------------------ */
.rw__list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.rw__item{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:var(--space-4);
  padding:var(--space-4) 0;
  border-bottom:1px solid var(--ink-750);
}
.rw__item:last-child{border-bottom:none}
.rw__item[data-locked]{opacity:0.62}
.rw__item-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.rw__item-title{
  display:flex;
  align-items:center;
  gap:var(--space-2);
  font-size:var(--text-sm);
  font-weight:500;
  color:var(--paper-50);
  flex-wrap:wrap;
}
.rw__item-desc{font-size:var(--text-xs);color:var(--paper-500);line-height:1.4}
.rw__item-action{
  display:flex;
  align-items:center;
  gap:var(--space-3);
  flex-shrink:0;
}
.rw__cost{
  font-size:var(--text-xs);
  font-weight:600;
  color:var(--paper-500);
}
.rw__cost[data-affordable]{color:var(--brass-300)}

.rw__shimmer{
  display:block;
  height:12px;
  border-radius:var(--radius-sm);
  background:var(--ink-750);
  animation:rw-pulse 1.5s ease-in-out infinite;
}
@keyframes rw-pulse{0%,100%{opacity:1}50%{opacity:0.5}}
@media (prefers-reduced-motion:reduce){
  .rw__shimmer,.rw__balance-skeleton{animation:none}
}

.rw__error-block{
  font-size:var(--text-sm);
  color:var(--paper-400);
  padding:var(--space-6) 0;
  text-align:center;
}

/* --- Confirm -------------------------------------------------------------- */
.rw__confirm-rows{margin:0;display:flex;flex-direction:column}
.rw__confirm-rows > div{
  display:flex;
  align-items:baseline;
  justify-content:space-between;
  gap:var(--space-4);
  padding:var(--space-3) 0;
  border-bottom:1px solid var(--ink-750);
}
.rw__confirm-rows dt{font-size:var(--text-sm);color:var(--paper-400)}
.rw__confirm-rows dd{margin:0;font-size:var(--text-sm);font-weight:500;color:var(--paper-50)}
.rw__confirm-debit{color:var(--wait-400)}
.rw__confirm-total{border-bottom:none !important;border-top:var(--rule-strong) !important;margin-top:var(--space-1)}
.rw__confirm-total dt{color:var(--paper-50) !important;font-weight:500}
.rw__confirm-total dd{color:var(--brass-300) !important;font-size:var(--text-lg) !important}

.rw__confirm-error{
  margin-top:var(--space-4);
  padding:var(--space-3);
  font-size:var(--text-sm);
  color:var(--fail-400);
  background:var(--fail-bg);
  border:1px solid rgba(228,104,92,0.3);
  border-radius:var(--radius-md);
}

/* --- Toast ---------------------------------------------------------------- */
.rw__toast{
  position:fixed;
  left:50%;
  bottom:var(--space-6);
  transform:translateX(-50%);
  z-index:60;
  padding:var(--space-3) var(--space-5);
  border-radius:var(--radius-full);
  font-size:var(--text-sm);
  font-weight:500;
  box-shadow:var(--shadow-pop);
  animation:rw-toast var(--dur-med) var(--ease);
  max-width:calc(100vw - var(--space-8));
  text-align:center;
}
.rw__toast[data-tone="ok"]{
  background:var(--ok-bg);
  border:1px solid var(--ok-400);
  color:var(--ok-400);
  backdrop-filter:blur(8px);
}
.rw__toast[data-tone="fail"]{
  background:var(--fail-bg);
  border:1px solid var(--fail-400);
  color:var(--fail-400);
  backdrop-filter:blur(8px);
}
@keyframes rw-toast{
  from{opacity:0;transform:translate(-50%,10px)}
  to{opacity:1;transform:translate(-50%,0)}
}

@media (max-width:480px){
  .rw__item{flex-direction:column;align-items:flex-start;gap:var(--space-3)}
  .rw__item-action{width:100%;justify-content:space-between}
}
`;
