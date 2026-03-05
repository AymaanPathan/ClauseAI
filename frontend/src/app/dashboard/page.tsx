"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  completeThunk,
  disputeThunk,
  timeoutThunk,
  pollAgreementThunk,
  rehydrateSession,
  resetAll,
} from "@/store/slices/agreementSlice";

const POLL_MS = 12_000;

const STATE_META: Record<
  number,
  { label: string; color: string; icon: string; pulse: boolean }
> = {
  0: {
    label: "Awaiting Deposit",
    color: "text-slate-400",
    icon: "⏳",
    pulse: false,
  },
  1: {
    label: "Funds Locked — Active",
    color: "text-yellow-400",
    icon: "🔒",
    pulse: true,
  },
  2: {
    label: "Complete — Released",
    color: "text-green-400",
    icon: "✅",
    pulse: false,
  },
  3: {
    label: "Refunded to Payer",
    color: "text-blue-400",
    icon: "↩️",
    pulse: false,
  },
  4: {
    label: "Disputed — Arbitrating",
    color: "text-amber-400",
    icon: "⚖️",
    pulse: true,
  },
};

function fmtWallet(addr?: string | null) {
  if (!addr) return "—";
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}
function fmtSbtc(usd?: string | null, microStx?: number | null) {
  if (usd) return (parseFloat(usd) / 67_000).toFixed(6);
  if (microStx) return (microStx / 1_000_000 / 67).toFixed(6);
  return "0.000000";
}

export default function DashboardPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const {
    editedTerms,
    agreementId,
    walletAddress,
    counterpartyWallet,
    amountLocked,
    fundState,
    onChainData,
    blockHeight,
    deadlineBlock,
    txComplete,
    txDispute,
    txTimeout,
    isPartyB,
  } = useAppSelector((s) => s.agreement);

  const [ready, setReady] = useState(false);
  const [lastPolled, setLastPolled] = useState("—");
  const [disputeModal, setDisputeModal] = useState(false);

  useEffect(() => {
    dispatch(rehydrateSession());
    setReady(true);
  }, [dispatch]);

  useEffect(() => {
    if (!ready) return;
    if (!agreementId) router.replace("/");
  }, [ready, agreementId, router]);

  const poll = useCallback(() => {
    if (!agreementId) return;
    dispatch(pollAgreementThunk(agreementId))
      .unwrap()
      .then(() => setLastPolled(new Date().toLocaleTimeString()))
      .catch((e: unknown) => {
        console.warn("[dashboard] poll failed:", e);
        setLastPolled(`${new Date().toLocaleTimeString()} (no on-chain data)`);
      });
  }, [agreementId, dispatch]);

  useEffect(() => {
    if (!ready || !agreementId) return;
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => clearInterval(iv);
  }, [ready, agreementId, poll]);

  const onChainState = onChainData?.state ?? 1;
  const meta = STATE_META[onChainState] ?? STATE_META[1];
  const sbtcAmount = fmtSbtc(
    amountLocked,
    onChainData?.totalDeposited as number | undefined,
  );
  const usdAmount = amountLocked ?? editedTerms?.amount_usd ?? "—";
  const isTimedOut = !!(
    deadlineBlock &&
    blockHeight > 0 &&
    blockHeight >= deadlineBlock
  );
  const blocksLeft =
    deadlineBlock && blockHeight > 0
      ? Math.max(0, deadlineBlock - blockHeight)
      : null;
  const busy = {
    complete: txComplete.status === "pending",
    dispute: txDispute.status === "pending",
    timeout: txTimeout.status === "pending",
  };
  const anyBusy = busy.complete || busy.dispute || busy.timeout;
  const payerName = editedTerms?.partyA ?? "Payer";
  const receiverName = editedTerms?.partyB ?? "Receiver";
  const payerWallet = isPartyB ? counterpartyWallet : walletAddress;
  const receiverWallet = isPartyB ? walletAddress : counterpartyWallet;
  const isFinished = onChainState === 2 || onChainState === 3;

  if (!ready) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
        <div className="w-20 h-20 rounded-full border border-yellow-400/20 bg-yellow-400/5 flex items-center justify-center text-4xl mb-5 animate-pulse">
          🔍
        </div>
        <p className="font-mono text-slate-500 text-sm mb-5 tracking-wider">
          Loading dashboard…
        </p>
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-slate-100 flex flex-col font-sans">
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 px-6 py-3 bg-[#0d0d0d] border-b border-white/5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex items-center bg-transparent border-none cursor-pointer p-0"
          >
            <span className="text-lg font-black text-yellow-400">Clause</span>
            <span className="text-lg font-black text-white">Ai</span>
          </button>
          <span className="font-mono text-xs text-slate-500 bg-[#161616] border border-white/10 rounded-full px-3 py-0.5">
            #{agreementId ?? "—"}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Role chip */}
          <span
            className={`font-mono text-xs font-bold border rounded-full px-3 py-1 ${isPartyB ? "text-green-400 border-green-400/30 bg-green-400/10" : "text-yellow-400 border-yellow-400/30 bg-yellow-400/10"}`}
          >
            {isPartyB ? "🎯 Receiver" : "💸 Payer"}
          </span>
          {/* State chip */}
          <span
            className={`font-mono text-xs border rounded-full px-3 py-1 bg-[#111] flex items-center gap-1.5 ${meta.color} border-current/40`}
          >
            {meta.pulse && (
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            )}
            {meta.icon} {meta.label}
          </span>
        </div>
      </header>

      {/* ── Main grid ── */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 p-6 max-w-6xl mx-auto w-full">
        {/* ── LEFT column ── */}
        <section className="flex flex-col gap-3">
          {/* Role card */}
          <div
            className={`rounded-2xl border p-5 ${isPartyB ? "bg-green-400/5 border-green-400/20" : "bg-yellow-400/5 border-yellow-400/20"}`}
          >
            <div
              className={`font-mono text-xs uppercase tracking-widest mb-2 ${isPartyB ? "text-green-400" : "text-yellow-400"}`}
            >
              {isPartyB ? "🎯 You are the Receiver" : "💸 You are the Payer"}
            </div>
            <div className="text-xl font-black">
              {isPartyB ? receiverName : payerName}
            </div>
            <div className="font-mono text-xs text-slate-500 mt-1">
              {fmtWallet(walletAddress)}
            </div>
          </div>

          {/* Timeout banner */}
          {isTimedOut && !isFinished && (
            <div className="bg-amber-400/5 border border-amber-400 rounded-xl p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">⏱</span>
                <div>
                  <div className="text-sm font-bold text-amber-400">
                    Deadline passed
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Payer can now trigger a refund
                  </div>
                </div>
              </div>
              {!isPartyB && (
                <button
                  disabled={busy.timeout}
                  onClick={() =>
                    agreementId && dispatch(timeoutThunk(agreementId))
                  }
                  className="bg-amber-400 text-black text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {busy.timeout ? <Spin /> : "Trigger Refund"}
                </button>
              )}
            </div>
          )}

          {/* TX banners */}
          <TxBanner tx={txComplete} label="Releasing payment" />
          <TxBanner tx={txDispute} label="Opening dispute" />
          <TxBanner tx={txTimeout} label="Triggering refund" />

          {/* Payer actions */}
          {!isPartyB && !isFinished && (
            <div className="flex flex-col gap-2">
              <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest">
                Your Actions
              </div>
              <div className="border border-yellow-400/20 bg-yellow-400/5 rounded-lg p-3 text-xs text-yellow-400 leading-relaxed">
                <strong>You are the Payer.</strong> Funds release once the
                receiver confirms conditions are met.
              </div>
              <button
                disabled={anyBusy}
                onClick={() => setDisputeModal(true)}
                className="w-full py-3 px-4 bg-transparent text-red-400 border border-red-900 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-900/20 transition-colors"
              >
                ⚠️ Open Dispute
              </button>
            </div>
          )}

          {/* Receiver actions */}
          {isPartyB && !isFinished && (
            <div className="flex flex-col gap-2">
              <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest">
                Your Actions
              </div>
              <div className="border border-green-400/20 bg-green-400/5 rounded-lg p-3 text-xs text-green-400 leading-relaxed">
                <strong>You are the Receiver.</strong> Confirm conditions are
                met to get paid.
              </div>
              <button
                disabled={busy.complete || busy.dispute}
                onClick={() =>
                  agreementId && dispatch(completeThunk(agreementId))
                }
                className="w-full py-3 px-4 bg-green-500 text-black rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-green-400 transition-colors"
              >
                {busy.complete ? (
                  <>
                    <Spin /> Waiting for wallet…
                  </>
                ) : (
                  "✅ Confirm Conditions Met — Release Payment"
                )}
              </button>
              <button
                disabled={anyBusy}
                onClick={() => setDisputeModal(true)}
                className="w-full py-3 px-4 bg-transparent text-red-400 border border-red-900 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-900/20 transition-colors"
              >
                ⚠️ Open Dispute
              </button>
            </div>
          )}

          {/* Finished */}
          {isFinished && (
            <div className="border border-white/10 rounded-2xl p-7 text-center bg-[#111]">
              <div className="text-4xl">{onChainState === 2 ? "✅" : "↩️"}</div>
              <div className="text-lg font-black mt-2">
                {onChainState === 2 ? "Escrow Complete" : "Funds Refunded"}
              </div>
              <div className="text-sm text-slate-400 mt-1.5 leading-relaxed">
                {onChainState === 2
                  ? `Payment released to ${receiverName}.`
                  : `Funds returned to ${payerName}.`}
              </div>
              <button
                onClick={() => {
                  dispatch(resetAll());
                  router.push("/");
                }}
                className="mt-5 px-6 py-3 bg-yellow-400 text-black rounded-xl text-sm font-bold hover:bg-yellow-300 transition-colors"
              >
                + New Agreement
              </button>
            </div>
          )}
        </section>

        {/* ── RIGHT column ── */}
        <section className="flex flex-col gap-3">
          {/* Amount card */}
          <div className="bg-gradient-to-br from-[#140f00] to-[#111] border border-yellow-400/10 rounded-2xl p-6 text-center">
            <div className="font-mono text-[10px] text-yellow-400 uppercase tracking-widest mb-3">
              🔒 Escrowed on Stacks Bitcoin
            </div>
            <div className="text-5xl font-black text-yellow-400 tracking-tight leading-none">
              {sbtcAmount}
            </div>
            <div className="font-mono text-sm text-yellow-400 mt-1">sBTC</div>
            <div className="text-base text-white font-semibold mt-2">
              ≈ ${usdAmount} USD
            </div>
            {onChainData?.totalDeposited != null && (
              <div className="font-mono text-[10px] text-slate-600 mt-1.5">
                {Number(onChainData.totalDeposited).toLocaleString()} µSTX
                on-chain
              </div>
            )}
          </div>

          {/* Block timeline */}
          <div className="bg-[#111] border border-white/5 rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest">
                Block Timeline
              </span>
              <span className="font-mono text-[9px] text-slate-700">
                Polled {lastPolled}
              </span>
            </div>
            {deadlineBlock && (
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (blockHeight / deadlineBlock) * 100)}%`,
                    background: isTimedOut
                      ? "#ef4444"
                      : blocksLeft != null && blocksLeft < 50
                        ? "#f59e0b"
                        : "#f5c400",
                  }}
                />
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  label: "Current Block",
                  value: blockHeight ? `#${blockHeight.toLocaleString()}` : "…",
                  cls: "text-white",
                },
                {
                  label: "Deadline",
                  value: deadlineBlock
                    ? `#${deadlineBlock.toLocaleString()}`
                    : "N/A",
                  cls: isTimedOut ? "text-red-400" : "text-slate-400",
                },
                {
                  label: "Blocks Left",
                  value: isTimedOut
                    ? "EXPIRED"
                    : (blocksLeft?.toLocaleString() ?? "—"),
                  cls: isTimedOut
                    ? "text-red-400"
                    : blocksLeft != null && blocksLeft < 50
                      ? "text-amber-400"
                      : "text-slate-400",
                },
              ].map((c) => (
                <div key={c.label} className="text-center">
                  <div className={`font-mono text-sm font-bold ${c.cls}`}>
                    {c.value}
                  </div>
                  <div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider mt-0.5">
                    {c.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Terms */}
          <div className="bg-[#111] border border-white/5 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/5 font-mono text-[10px] text-slate-500 uppercase tracking-widest">
              Agreement Terms
            </div>
            {[
              { label: "⚡ Release Condition", value: editedTerms?.condition },
              { label: "📅 Deadline", value: editedTerms?.deadline },
              { label: "⚖️ Arbitrator", value: editedTerms?.arbitrator },
              {
                label: "⏱ Timeout Policy",
                value: "Auto-refund to payer after deadline",
              },
            ].map((r, i) => (
              <div
                key={i}
                className="flex justify-between items-start px-4 py-2.5 border-b border-white/[0.04] last:border-0 gap-3"
              >
                <span className="font-mono text-xs text-slate-500 shrink-0">
                  {r.label}
                </span>
                <span className="text-xs font-semibold text-right leading-snug">
                  {r.value ?? "—"}
                </span>
              </div>
            ))}
          </div>

          {/* Parties */}
          <div className="flex items-center gap-3">
            <PartyCard
              role="Payer"
              color="yellow"
              name={payerName}
              wallet={payerWallet}
              status={
                onChainData?.deposited ? "✅ Funds locked" : "⏳ Awaiting lock"
              }
              statusGreen={!!onChainData?.deposited}
              isMe={!isPartyB}
            />
            <div className="flex flex-col items-center gap-1 shrink-0">
              <span className="font-mono text-[9px] text-slate-700 tracking-widest">
                ESCROW
              </span>
              <span className="text-lg text-slate-700">⇄</span>
            </div>
            <PartyCard
              role="Receiver"
              color="green"
              name={receiverName}
              wallet={receiverWallet}
              status={
                fundState === "released" ? "✅ Received" : "⏳ Awaiting release"
              }
              statusGreen={fundState === "released"}
              isMe={isPartyB}
            />
          </div>
        </section>
      </main>

      {/* ── Dispute modal ── */}
      {disputeModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setDisputeModal(false)}
        >
          <div
            className="bg-[#111] border border-red-900 rounded-2xl p-7 max-w-sm w-full text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-4xl mb-3">⚖️</div>
            <h3 className="text-lg font-black text-red-300 mb-2">
              Open a Dispute?
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-5">
              This notifies arbitrator{" "}
              <strong className="text-white">
                {editedTerms?.arbitrator ?? "TBD"}
              </strong>
              . The contract is paused for{" "}
              <strong className="text-amber-400">48 hours</strong> — then
              auto-refunds to payer if unresolved.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDisputeModal(false)}
                className="flex-1 py-3 bg-transparent text-slate-400 border border-white/10 rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={busy.dispute}
                onClick={() => {
                  if (agreementId) dispatch(disputeThunk(agreementId));
                  setDisputeModal(false);
                }}
                className="flex-[2] py-3 bg-red-900 text-red-300 border border-red-800 rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-800 transition-colors"
              >
                {busy.dispute ? "Opening…" : "Confirm Dispute"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function PartyCard({
  role,
  color,
  name,
  wallet,
  status,
  statusGreen,
  isMe,
}: {
  role: string;
  color: "yellow" | "green";
  name: string;
  wallet?: string | null;
  status: string;
  statusGreen: boolean;
  isMe: boolean;
}) {
  const accent =
    color === "yellow"
      ? {
          border: "border-yellow-400/20",
          tag: "text-yellow-400",
          you: "bg-yellow-400/20 text-yellow-400",
        }
      : {
          border: "border-green-400/20",
          tag: "text-green-400",
          you: "bg-green-400/20 text-green-400",
        };
  return (
    <div className={`flex-1 bg-[#111] border ${accent.border} rounded-xl p-3`}>
      <div
        className={`font-mono text-[9px] uppercase tracking-widest mb-1 flex items-center gap-1 ${accent.tag}`}
      >
        {role}
        {isMe && (
          <span
            className={`rounded px-1 py-0.5 text-[8px] font-bold ${accent.you}`}
          >
            YOU
          </span>
        )}
      </div>
      <div className="text-sm font-bold">{name}</div>
      <div
        className={`font-mono text-[10px] mt-1 ${statusGreen ? "text-green-400" : "text-slate-600"}`}
      >
        {status}
      </div>
      {wallet && (
        <div className="font-mono text-[9px] text-slate-700 mt-0.5">
          {fmtWallet(wallet)}
        </div>
      )}
    </div>
  );
}

function TxBanner({
  tx,
  label,
}: {
  tx: {
    status: string;
    txId: string | null;
    txUrl: string | null;
    error: string | null;
  };
  label: string;
}) {
  if (tx.status === "idle") return null;
  const fail = tx.status === "failed";
  return (
    <div
      className={`border rounded-lg px-3 py-2.5 font-mono text-xs ${fail ? "bg-red-950/20 border-red-900" : "bg-amber-400/5 border-amber-400/20"}`}
    >
      {tx.status === "pending" && (
        <span className="text-amber-400">⏳ {label} — waiting for wallet…</span>
      )}
      {tx.status === "confirming" && (
        <span className="text-amber-400">
          ⏳ {label} — confirming…{" "}
          {tx.txUrl && (
            <a
              href={tx.txUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-yellow-400 underline"
            >
              View ↗
            </a>
          )}
        </span>
      )}
      {fail && (
        <span className="text-red-400">
          ❌ {label} failed: {tx.error}
        </span>
      )}
    </div>
  );
}

function Spin() {
  return (
    <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
  );
}
