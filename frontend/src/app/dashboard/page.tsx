"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  completeMilestoneThunk,
  disputeMilestoneThunk,
  triggerMilestoneTimeoutThunk,
  pollAgreementThunk,
  rehydrateSession,
  resetAll,
  setScreen,
} from "@/store/slices/agreementSlice";
import {
  OnChainMilestone,
  MILESTONE_STATUS,
  milestoneStatusLabel,
} from "@/lib/contractReads";
import { TxState } from "@/store/slices/agreementSlice";

const POLL_MS = 12_000;

const STATE_META: Record<
  number,
  { label: string; color: string; icon: string; pulse: boolean }
> = {
  0: { label: "Awaiting Deposit", color: "#94a3b8", icon: "⏳", pulse: false },
  1: {
    label: "Funds Locked — Active",
    color: "#f5c400",
    icon: "🔒",
    pulse: true,
  },
  2: {
    label: "Complete — Released",
    color: "#22c55e",
    icon: "✅",
    pulse: false,
  },
  3: { label: "Refunded to Payer", color: "#60a5fa", icon: "↩️", pulse: false },
  4: {
    label: "Disputed — Arbitrating",
    color: "#f59e0b",
    icon: "⚖️",
    pulse: true,
  },
};

const BLOCK_TIME_SEC = 600;

function blocksToRelTime(delta: number): string {
  if (delta <= 0) return "now";
  const sec = delta * BLOCK_TIME_SEC;
  if (sec < 3600) return `~${Math.round(sec / 60)}m`;
  if (sec < 86400) return `~${Math.round(sec / 3600)}h`;
  return `~${Math.round(sec / 86400)}d`;
}

function fmtWallet(addr?: string | null) {
  if (!addr) return "—";
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function fmtSbtc(usd?: string | null, microStx?: number | null) {
  if (usd) return (parseFloat(usd) / 67_000).toFixed(6);
  if (microStx) return (microStx / 1_000_000 / 67).toFixed(6);
  return "0.000000";
}

function msColor(status: number): string {
  switch (status) {
    case MILESTONE_STATUS.COMPLETE:
      return "#22c55e";
    case MILESTONE_STATUS.DISPUTED:
      return "#f59e0b";
    case MILESTONE_STATUS.REFUNDED:
      return "#60a5fa";
    case MILESTONE_STATUS.ACTIVE:
      return "#f5c400";
    default:
      return "#475569";
  }
}

function msIcon(status: number): string {
  switch (status) {
    case MILESTONE_STATUS.COMPLETE:
      return "✅";
    case MILESTONE_STATUS.DISPUTED:
      return "⚖️";
    case MILESTONE_STATUS.REFUNDED:
      return "↩️";
    case MILESTONE_STATUS.ACTIVE:
      return "🔒";
    default:
      return "⏳";
  }
}

// ─────────────────────────────────────────────────────────────
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
    milestones,
    milestoneInputs,
    txMilestone,
    isPartyB,
  } = useAppSelector((s) => s.agreement);

  const [ready, setReady] = useState(false);
  const [lastPolled, setLastPolled] = useState("—");
  const [disputeIdx, setDisputeIdx] = useState<number | null>(null);

  // ── boot ─────────────────────────────────────────────────────
  useEffect(() => {
    dispatch(rehydrateSession());
    setReady(true);
  }, [dispatch]);

  useEffect(() => {
    if (ready && !agreementId) router.replace("/");
  }, [ready, agreementId, router]);

  // ── polling ───────────────────────────────────────────────────
  const poll = useCallback(() => {
    if (!agreementId) return;
    dispatch(pollAgreementThunk(agreementId))
      .unwrap()
      .then(() => setLastPolled(new Date().toLocaleTimeString()))
      .catch(() =>
        setLastPolled(`${new Date().toLocaleTimeString()} (no chain data)`),
      );
  }, [agreementId, dispatch]);

  useEffect(() => {
    if (!ready || !agreementId) return;
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => clearInterval(iv);
  }, [ready, agreementId, poll]);

  // ── derived ───────────────────────────────────────────────────
  const onChainState = onChainData?.state ?? 0;
  const meta = STATE_META[onChainState] ?? STATE_META[1];
  const sbtcAmount = fmtSbtc(
    amountLocked,
    onChainData?.totalDeposited as number | undefined,
  );
  const usdAmount =
    amountLocked ??
    (editedTerms as any)?.total_usd ??
    (editedTerms as any)?.amount_usd ??
    "—";
  const isFinished = onChainState === 2 || onChainState === 3;
  const roleColor = isPartyB ? "#22c55e" : "#f5c400";
  const payerName =
    (editedTerms as any)?.payer ?? (editedTerms as any)?.partyA ?? "Payer";
  const receiverName =
    (editedTerms as any)?.receiver ??
    (editedTerms as any)?.partyB ??
    "Receiver";
  const payerWallet = isPartyB ? counterpartyWallet : walletAddress;
  const receiverWallet = isPartyB ? walletAddress : counterpartyWallet;
  const isPartyA = !isPartyB && !!walletAddress;
  const isArbitrator =
    !!walletAddress &&
    !!onChainData?.arbitrator &&
    walletAddress === onChainData.arbitrator;
  const amountUsd = parseFloat(String(usdAmount) || "0");

  // Build display milestones — prefer live on-chain, fall back to inputs
  const ARB_TIMEOUT = 288;
  const displayMilestones: OnChainMilestone[] =
    milestones.length > 0
      ? milestones
      : milestoneInputs.map((inp, i) => ({
          index: i,
          percentage: inp.percentage,
          amount: 0,
          status:
            onChainState >= 1
              ? MILESTONE_STATUS.ACTIVE
              : MILESTONE_STATUS.PENDING,
          deadlineBlock: inp.deadlineBlock,
          disputeBlock: 0,
        }));

  const completedPct = displayMilestones
    .filter((m) => m.status === MILESTONE_STATUS.COMPLETE)
    .reduce((s, m) => s + m.percentage, 0);
  const activePct = displayMilestones
    .filter((m) => m.status === MILESTONE_STATUS.ACTIVE)
    .reduce((s, m) => s + m.percentage, 0);

  // ── actions ───────────────────────────────────────────────────
  function complete(ms: OnChainMilestone) {
    if (!agreementId) return;
    dispatch(completeMilestoneThunk({ agreementId, milestoneIndex: ms.index }));
  }
  function confirmDispute(idx: number) {
    if (!agreementId) return;
    dispatch(disputeMilestoneThunk({ agreementId, milestoneIndex: idx }));
    setDisputeIdx(null);
  }
  function timeout(ms: OnChainMilestone) {
    if (!agreementId) return;
    dispatch(
      triggerMilestoneTimeoutThunk({ agreementId, milestoneIndex: ms.index }),
    );
  }

  // ─────────────────────────────────────────────────────────────
  if (!ready) {
    return (
      <div className="detect-wrap">
        <div className="detect-orb">🔍</div>
        <p className="detect-label">Loading dashboard…</p>
        <div className="dot-row">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="dot"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </div>
        <style>{splashCSS}</style>
      </div>
    );
  }

  return (
    <div className="db-root">
      <style>{css}</style>

      {/* ── Top bar ──────────────────────────────────────────── */}
      <header className="db-topbar">
        <div className="db-topbar-left">
          <button className="db-logo-btn" onClick={() => router.push("/")}>
            <span className="logo-clause">Clause</span>
            <span className="logo-ai">Ai</span>
          </button>
          <span className="escrow-badge">#{agreementId ?? "—"}</span>
          <span className="polled-label">· {lastPolled}</span>
        </div>
        <div className="db-topbar-right">
          <div
            className="role-chip"
            style={{
              color: roleColor,
              borderColor: `${roleColor}50`,
              background: `${roleColor}10`,
            }}
          >
            {isPartyB ? "🎯 Receiver" : "💸 Payer"}
          </div>
          <div
            className="state-chip"
            style={{ color: meta.color, borderColor: `${meta.color}40` }}
          >
            {meta.pulse && (
              <span className="pulse-dot" style={{ background: meta.color }} />
            )}
            {meta.icon} {meta.label}
          </div>
        </div>
      </header>

      <main className="db-grid">
        {/* ── LEFT ─────────────────────────────────────────────── */}
        <section className="db-left">
          {/* Role card */}
          <div
            className="role-card"
            style={{
              background: `${roleColor}08`,
              borderColor: `${roleColor}25`,
            }}
          >
            <div className="role-card-tag" style={{ color: roleColor }}>
              {isPartyB ? "🎯 You are the Receiver" : "💸 You are the Payer"}
            </div>
            <div className="role-card-name">
              {isPartyB ? receiverName : payerName}
            </div>
            <div className="role-card-wallet">{fmtWallet(walletAddress)}</div>
          </div>

          {/* Progress summary */}
          <div className="progress-card">
            <div className="progress-label-row">
              <span style={{ color: "#22c55e" }}>
                {
                  displayMilestones.filter(
                    (m) => m.status === MILESTONE_STATUS.COMPLETE,
                  ).length
                }
                /{displayMilestones.length} complete
              </span>
              <span style={{ color: "#f5c400" }}>
                ${((amountUsd * activePct) / 10000).toFixed(2)} locked
              </span>
            </div>
            <div className="progress-bar">
              {displayMilestones.map((ms) => {
                const w = ms.percentage / 100;
                const bg =
                  ms.status === MILESTONE_STATUS.COMPLETE
                    ? "#22c55e"
                    : ms.status === MILESTONE_STATUS.REFUNDED
                      ? "#60a5fa"
                      : ms.status === MILESTONE_STATUS.DISPUTED
                        ? "#f59e0b"
                        : ms.status === MILESTONE_STATUS.ACTIVE
                          ? "#f5c400"
                          : "#1e293b";
                return (
                  <div
                    key={ms.index}
                    style={{
                      height: "100%",
                      width: `${w}%`,
                      background: bg,
                      transition: "width .4s",
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Role hint */}
          {!isFinished && (
            <div
              className="info-box"
              style={{
                color: isPartyA ? "#f5c400" : "#22c55e",
                borderColor: isPartyA ? "#f5c40025" : "#22c55e25",
                background: isPartyA ? "#f5c40008" : "#22c55e08",
              }}
            >
              {isPartyA && (
                <>
                  <strong>You are the Payer.</strong> Release each milestone
                  individually as conditions are met.
                </>
              )}
              {isPartyB && (
                <>
                  <strong>You are the Receiver.</strong> Funds release to your
                  wallet when the payer approves each milestone.
                </>
              )}
            </div>
          )}

          {/* Finished */}
          {isFinished && (
            <div className="finished-card">
              <span className="finished-icon">
                {onChainState === 2 ? "✅" : "↩️"}
              </span>
              <div className="finished-title">
                {onChainState === 2 ? "Escrow Complete" : "Funds Refunded"}
              </div>
              <div className="finished-sub">
                {onChainState === 2
                  ? `Payment released to ${receiverName}.`
                  : `Funds returned to ${payerName}.`}
              </div>
              <button
                className="new-agreement-btn"
                onClick={() => {
                  dispatch(resetAll());
                  router.push("/");
                }}
              >
                + New Agreement
              </button>
            </div>
          )}

          {/* Parties */}
          <div className="parties-row">
            <PartyCard
              role="Payer"
              color="#f5c400"
              name={payerName}
              wallet={payerWallet}
              isMe={!isPartyB}
              status={
                onChainData?.deposited ? "✅ Funds locked" : "⏳ Awaiting lock"
              }
              statusColor={onChainData?.deposited ? "#f5c400" : "#475569"}
            />
            <div className="parties-arrow">
              <span style={{ fontSize: 9, color: "#334155", letterSpacing: 1 }}>
                ESCROW
              </span>
              <span style={{ fontSize: 18, color: "#334155" }}>⇄</span>
            </div>
            <PartyCard
              role="Receiver"
              color="#22c55e"
              name={receiverName}
              wallet={receiverWallet}
              isMe={isPartyB}
              status={
                fundState === "released" ? "✅ Received" : "⏳ Awaiting release"
              }
              statusColor={fundState === "released" ? "#22c55e" : "#475569"}
            />
          </div>
        </section>

        {/* ── RIGHT ────────────────────────────────────────────── */}
        <section className="db-right">
          {/* Amount card */}
          <div className="amount-card">
            <div className="amount-label">🔒 Escrowed on Stacks Bitcoin</div>
            <div className="amount-sbtc">{sbtcAmount}</div>
            <div className="amount-unit">sBTC</div>
            <div className="amount-usd">≈ ${usdAmount} USD</div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 24,
                marginTop: 12,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{ fontSize: 15, fontWeight: 700, color: "#22c55e" }}
                >
                  ${((amountUsd * completedPct) / 10000).toFixed(2)}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#22c55e",
                    fontFamily: "monospace",
                  }}
                >
                  Released
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div
                  style={{ fontSize: 15, fontWeight: 700, color: "#f5c400" }}
                >
                  ${((amountUsd * activePct) / 10000).toFixed(2)}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#f5c400",
                    fontFamily: "monospace",
                  }}
                >
                  Locked
                </div>
              </div>
            </div>
            {onChainData?.totalDeposited != null && (
              <div className="amount-micro">
                {Number(onChainData.totalDeposited).toLocaleString()} µSTX
                on-chain
              </div>
            )}
          </div>

          {/* ── MILESTONE TRACKER ────────────────────────────── */}
          <div className="milestone-card">
            <div className="milestone-header">
              <span className="section-label">Milestone Tracker</span>
              <span
                style={{
                  fontSize: 9,
                  fontFamily: "monospace",
                  color: "#334155",
                }}
              >
                {
                  displayMilestones.filter(
                    (m) => m.status === MILESTONE_STATUS.COMPLETE,
                  ).length
                }
                /{displayMilestones.length} done
              </span>
            </div>

            {displayMilestones.length === 0 && (
              <div
                style={{
                  padding: 20,
                  textAlign: "center",
                  color: "#475569",
                  fontSize: 13,
                }}
              >
                No milestones yet. Deploy the contract first.
              </div>
            )}

            {displayMilestones.map((ms) => {
              const color = msColor(ms.status);
              const icon = msIcon(ms.status);
              const label = milestoneStatusLabel(ms.status);
              const tx =
                txMilestone[ms.index] ??
                ({
                  status: "idle",
                  txId: null,
                  txUrl: null,
                  error: null,
                } as TxState);
              const pct = ms.percentage / 100;
              const msUsd = ((amountUsd * ms.percentage) / 10000).toFixed(2);
              const isActive = ms.status === MILESTONE_STATUS.ACTIVE;
              const isDisp = ms.status === MILESTONE_STATUS.DISPUTED;
              const isDone =
                ms.status === MILESTONE_STATUS.COMPLETE ||
                ms.status === MILESTONE_STATUS.REFUNDED;
              const timedOut =
                ms.deadlineBlock > 0 && blockHeight >= ms.deadlineBlock;
              const arbTO =
                isDisp &&
                ms.disputeBlock > 0 &&
                blockHeight >= ms.disputeBlock + ARB_TIMEOUT;
              const blkLeft =
                isActive && ms.deadlineBlock > 0
                  ? ms.deadlineBlock - blockHeight
                  : null;
              const txBusy =
                tx.status === "pending" || tx.status === "confirming";

              // Label from editedTerms.milestones if available
              const msLabel: string = (() => {
                const v2ms = (editedTerms as any)?.milestones;
                if (Array.isArray(v2ms) && v2ms[ms.index]?.title)
                  return v2ms[ms.index].title;
                return `Milestone ${ms.index + 1}`;
              })();
              const msCondition: string = (() => {
                const v2ms = (editedTerms as any)?.milestones;
                if (Array.isArray(v2ms) && v2ms[ms.index]?.condition)
                  return v2ms[ms.index].condition;
                return "";
              })();

              return (
                <div
                  key={ms.index}
                  className="ms-row"
                  style={{
                    borderColor: isDone ? "transparent" : `${color}30`,
                    opacity: isDone ? 0.75 : 1,
                  }}
                >
                  {/* top accent */}
                  <div
                    style={{
                      height: 2,
                      background: isDone ? "#1e293b" : color,
                      margin: "-1px -1px 0",
                    }}
                  />

                  <div style={{ padding: "14px 16px" }}>
                    {/* header */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 10,
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        {/* index circle */}
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: `${color}15`,
                            border: `1px solid ${color}40`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 800,
                            color,
                            flexShrink: 0,
                            fontFamily: "monospace",
                          }}
                        >
                          {ms.index + 1}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>
                            {msLabel}
                          </div>
                          {msCondition && (
                            <div
                              style={{
                                fontSize: 10,
                                color: "#475569",
                                marginTop: 2,
                                maxWidth: 200,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap" as const,
                              }}
                            >
                              {msCondition}
                            </div>
                          )}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              marginTop: 2,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                fontFamily: "monospace",
                                color,
                              }}
                            >
                              {icon} {label}
                            </span>
                            {blkLeft !== null && (
                              <span
                                style={{
                                  fontSize: 9,
                                  fontFamily: "monospace",
                                  color: timedOut ? "#ef4444" : "#475569",
                                }}
                              >
                                · deadline{" "}
                                {timedOut ? "PASSED" : blocksToRelTime(blkLeft)}
                              </span>
                            )}
                            {isDisp && ms.disputeBlock > 0 && (
                              <span
                                style={{
                                  fontSize: 9,
                                  fontFamily: "monospace",
                                  color: arbTO ? "#ef4444" : "#f59e0b",
                                }}
                              >
                                · arb{" "}
                                {arbTO
                                  ? "TIMED OUT"
                                  : `${blocksToRelTime(ms.disputeBlock + ARB_TIMEOUT - blockHeight)} left`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* amount + status */}
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            fontFamily: "monospace",
                            color: isDone ? "#475569" : "#fff",
                          }}
                        >
                          ${msUsd}
                        </div>
                        <div
                          style={{
                            fontSize: 9,
                            fontFamily: "monospace",
                            color: "#475569",
                          }}
                        >
                          {pct}% of total
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 10,
                            fontFamily: "monospace",
                            color,
                            background: `${color}15`,
                            border: `1px solid ${color}30`,
                            borderRadius: 99,
                            padding: "1px 7px",
                            display: "inline-block",
                          }}
                        >
                          {icon} {label}
                        </div>
                      </div>
                    </div>

                    {/* release / refund confirmation */}
                    {ms.status === MILESTONE_STATUS.COMPLETE && (
                      <div
                        style={{
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: "#22c55e",
                          background: "#22c55e10",
                          border: "1px solid #22c55e30",
                          borderRadius: 6,
                          padding: "5px 10px",
                          marginBottom: 6,
                        }}
                      >
                        ✅ ${msUsd} released to {receiverName}
                      </div>
                    )}
                    {ms.status === MILESTONE_STATUS.REFUNDED && (
                      <div
                        style={{
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: "#60a5fa",
                          background: "#60a5fa10",
                          border: "1px solid #60a5fa30",
                          borderRadius: 6,
                          padding: "5px 10px",
                          marginBottom: 6,
                        }}
                      >
                        ↩️ ${msUsd} refunded to {payerName}
                      </div>
                    )}

                    {/* tx banner */}
                    {tx.status !== "idle" && (
                      <div
                        style={{
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: tx.status === "failed" ? "#f87171" : "#f59e0b",
                          background:
                            tx.status === "failed" ? "#ef444410" : "#f59e0b08",
                          border: `1px solid ${tx.status === "failed" ? "#ef444430" : "#f59e0b30"}`,
                          borderRadius: 6,
                          padding: "5px 10px",
                          marginBottom: 6,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {txBusy && (
                          <Spin
                            color={
                              tx.status === "failed" ? "#f87171" : "#f59e0b"
                            }
                          />
                        )}
                        {tx.status === "pending" && "Waiting for signature…"}
                        {tx.status === "confirming" && (
                          <>
                            Confirming…{" "}
                            {tx.txUrl && (
                              <a
                                href={tx.txUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: "#f5c400", marginLeft: 4 }}
                              >
                                View ↗
                              </a>
                            )}
                          </>
                        )}
                        {tx.status === "failed" && `Error: ${tx.error}`}
                      </div>
                    )}

                    {/* action buttons */}
                    {!isDone && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap" as const,
                          gap: 7,
                          marginTop: 4,
                        }}
                      >
                        {isPartyA && isActive && !timedOut && (
                          <ActionBtn
                            label="✅ Mark Complete"
                            color="#22c55e"
                            onClick={() => complete(ms)}
                            loading={txBusy}
                            disabled={txBusy}
                          />
                        )}
                        {(isPartyA || isPartyB) && isActive && (
                          <ActionBtn
                            label="⚖️ Dispute"
                            color="#f59e0b"
                            onClick={() => setDisputeIdx(ms.index)}
                            loading={false}
                            disabled={txBusy}
                          />
                        )}
                        {isActive && timedOut && (
                          <ActionBtn
                            label="⏱ Trigger Refund"
                            color="#60a5fa"
                            onClick={() => timeout(ms)}
                            loading={txBusy}
                            disabled={txBusy}
                          />
                        )}
                        {isArbitrator && isDisp && (
                          <>
                            <ActionBtn
                              label="→ Release to Receiver"
                              color="#22c55e"
                              onClick={() => complete(ms)}
                              loading={txBusy}
                              disabled={txBusy}
                            />
                            <ActionBtn
                              label="← Refund to Payer"
                              color="#60a5fa"
                              onClick={() => timeout(ms)}
                              loading={txBusy}
                              disabled={txBusy}
                            />
                          </>
                        )}
                        {isDisp && arbTO && (
                          <ActionBtn
                            label="⏱ Arb Timeout → Refund"
                            color="#60a5fa"
                            onClick={() => timeout(ms)}
                            loading={txBusy}
                            disabled={txBusy}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Terms */}
          <div className="terms-card">
            <div className="terms-header">Agreement Terms</div>
            {[
              {
                label: "⚖️ Arbitrator",
                value: (editedTerms as any)?.arbitrator,
              },
              {
                label: "⏱ Timeout Policy",
                value: "Auto-refund per tranche after deadline",
              },
              { label: "📋 Agreement ID", value: agreementId },
              {
                label: "📦 Block Height",
                value: blockHeight ? `#${blockHeight.toLocaleString()}` : "—",
              },
            ].map((r, i) => (
              <div key={i} className="terms-row">
                <span className="terms-key">{r.label}</span>
                <span className="terms-val">{r.value ?? "—"}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ── Dispute modal ─────────────────────────────────────── */}
      {disputeIdx !== null && (
        <div className="modal-overlay" onClick={() => setDisputeIdx(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>⚖️</div>
            <h3 className="modal-title">Dispute Milestone {disputeIdx + 1}?</h3>
            <p className="modal-body">
              This locks{" "}
              <strong style={{ color: "#fff" }}>
                $
                {(
                  (amountUsd *
                    (displayMilestones[disputeIdx]?.percentage ?? 0)) /
                  10000
                ).toFixed(2)}
              </strong>{" "}
              for this tranche only. Other milestones continue normally.
              Arbitrator{" "}
              <strong style={{ color: "#fff" }}>
                {(editedTerms as any)?.arbitrator ?? "TBD"}
              </strong>{" "}
              will review. Auto-refunds to payer in{" "}
              <strong style={{ color: "#f59e0b" }}>48 hours</strong> if
              unresolved.
            </p>
            <div className="modal-actions">
              <button
                className="modal-cancel"
                onClick={() => setDisputeIdx(null)}
              >
                Cancel
              </button>
              <button
                className="modal-confirm"
                onClick={() => confirmDispute(disputeIdx)}
              >
                Confirm Dispute
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
  statusColor,
  isMe,
}: {
  role: string;
  color: string;
  name: string;
  wallet?: string | null;
  status: string;
  statusColor: string;
  isMe: boolean;
}) {
  return (
    <div className="party-card" style={{ borderColor: `${color}25` }}>
      <div className="party-role" style={{ color }}>
        {role}
        {isMe && (
          <span
            className="party-you"
            style={{ background: `${color}20`, color }}
          >
            {" "}
            YOU
          </span>
        )}
      </div>
      <div className="party-name">{name}</div>
      <div className="party-status" style={{ color: statusColor }}>
        {status}
      </div>
      {wallet && <div className="party-wallet">{fmtWallet(wallet)}</div>}
    </div>
  );
}

function ActionBtn({
  label,
  color,
  onClick,
  disabled,
  loading,
}: {
  label: string;
  color: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: "8px 14px",
        background: disabled ? "var(--black-5, #1e293b)" : `${color}18`,
        color: disabled ? "#475569" : color,
        border: `1px solid ${disabled ? "#1e293b" : `${color}50`}`,
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        gap: 5,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {loading && <Spin color={color} />}
      {label}
    </button>
  );
}

function Spin({ color = "#f5c400" }: { color?: string }) {
  return (
    <span
      style={{
        width: 10,
        height: 10,
        border: `2px solid ${color}40`,
        borderTopColor: "transparent",
        borderRadius: "50%",
        display: "inline-block",
        animation: "spin .7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

// ── CSS ───────────────────────────────────────────────────────

const splashCSS = `.detect-wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0a0a0a}.detect-orb{width:90px;height:90px;border-radius:50%;border:1px solid #f5c40030;background:radial-gradient(circle,#f5c40012 0%,transparent 70%);display:flex;align-items:center;justify-content:center;font-size:34px;margin-bottom:20px;animation:orb-beat 1.1s ease-in-out infinite}.detect-label{font-size:14px;font-family:monospace;color:#64748b;margin-bottom:18px}.dot-row{display:flex;gap:8px}.dot{width:8px;height:8px;border-radius:50%;background:#f5c400;animation:dot-up .7s ease-in-out infinite alternate}@keyframes orb-beat{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}@keyframes dot-up{from{transform:translateY(0);opacity:.35}to{transform:translateY(-7px);opacity:1}}`;

const css = `
*{box-sizing:border-box}
.db-root{min-height:100vh;background:#0a0a0a;color:#f1f5f9;font-family:system-ui,sans-serif;display:flex;flex-direction:column}
.db-topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 24px;border-bottom:1px solid #1f1f1f;background:#0d0d0d;position:sticky;top:0;z-index:40;flex-wrap:wrap;gap:10px}
.db-topbar-left{display:flex;align-items:center;gap:10px}
.db-topbar-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.db-logo-btn{background:none;border:none;cursor:pointer;padding:0;display:flex}
.logo-clause{font-size:18px;font-weight:800;color:#f5c400}
.logo-ai{font-size:18px;font-weight:800;color:#fff}
.escrow-badge{font-size:11px;font-family:monospace;color:#64748b;background:#161616;border:1px solid #2a2a2a;border-radius:99px;padding:3px 10px}
.polled-label{font-size:10px;font-family:monospace;color:#334155}
.role-chip{font-size:11px;font-family:monospace;font-weight:700;border:1px solid;border-radius:99px;padding:4px 12px}
.state-chip{font-size:11px;font-family:monospace;border:1px solid;border-radius:99px;padding:4px 12px;background:#111;display:flex;align-items:center;gap:5px}
.pulse-dot{width:6px;height:6px;border-radius:50%;display:inline-block;animation:pdot 1.4s ease-in-out infinite}
@keyframes pdot{0%,100%{opacity:1}50%{opacity:.2}}
.db-grid{display:grid;grid-template-columns:320px 1fr;gap:20px;padding:24px;max-width:1120px;margin:0 auto;width:100%;flex:1}
.db-left,.db-right{display:flex;flex-direction:column;gap:12px}
.role-card{border:1px solid;border-radius:14px;padding:18px 20px}
.role-card-tag{font-size:11px;font-family:monospace;text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px}
.role-card-name{font-size:20px;font-weight:800}
.role-card-wallet{font-size:11px;font-family:monospace;color:#475569;margin-top:4px}
.progress-card{background:#111;border:1px solid #1f1f1f;border-radius:10px;padding:12px 14px}
.progress-label-row{display:flex;justify-content:space-between;font-size:11px;font-family:monospace;margin-bottom:8px}
.progress-bar{height:6px;background:#1e293b;border-radius:3px;overflow:hidden;display:flex}
.info-box{border:1px solid;border-radius:8px;padding:10px 14px;font-size:12px;line-height:1.65}
.finished-card{border:1px solid #1f1f1f;border-radius:14px;padding:28px 20px;text-align:center;background:#111}
.finished-icon{font-size:34px}
.finished-title{font-size:17px;font-weight:800;margin-top:10px}
.finished-sub{font-size:13px;color:#94a3b8;margin-top:6px;line-height:1.5}
.new-agreement-btn{margin-top:20px;padding:12px 24px;background:#f5c400;color:#0a0a0a;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer}
.parties-row{display:flex;align-items:center;gap:10px}
.party-card{flex:1;background:#111;border:1px solid;border-radius:10px;padding:12px 14px}
.party-role{font-size:9px;font-family:monospace;text-transform:uppercase;letter-spacing:.12em;margin-bottom:4px;display:flex;align-items:center;gap:5px}
.party-you{border-radius:4px;padding:1px 5px;font-size:8px}
.party-name{font-size:13px;font-weight:700}
.party-status{font-size:10px;font-family:monospace;margin-top:4px}
.party-wallet{font-size:9px;font-family:monospace;color:#334155;margin-top:3px}
.parties-arrow{display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0}
.amount-card{background:linear-gradient(135deg,#140f00 0%,#111 100%);border:1px solid #f5c40022;border-radius:16px;padding:24px;text-align:center;position:relative;overflow:hidden}
.amount-label{font-size:10px;font-family:monospace;color:#f5c400;text-transform:uppercase;letter-spacing:.18em;margin-bottom:10px}
.amount-sbtc{font-size:38px;font-weight:900;color:#f5c400;letter-spacing:-1.5px;line-height:1}
.amount-unit{font-size:13px;font-family:monospace;color:#f5c400;margin-top:3px}
.amount-usd{font-size:15px;color:#fff;margin-top:8px;font-weight:600}
.amount-micro{font-size:10px;font-family:monospace;color:#334155;margin-top:6px}
.milestone-card{background:#111;border:1px solid #1f1f1f;border-radius:12px;overflow:hidden}
.milestone-header{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #1a1a1a}
.section-label{font-size:10px;font-family:monospace;color:#475569;text-transform:uppercase;letter-spacing:.1em}
.ms-row{border:1px solid;border-radius:0;border-left:none;border-right:none;border-top:none}
.ms-row:last-child{border-bottom:none}
.terms-card{background:#111;border:1px solid #1f1f1f;border-radius:12px;overflow:hidden}
.terms-header{padding:10px 16px;border-bottom:1px solid #1a1a1a;font-size:10px;font-family:monospace;color:#475569;text-transform:uppercase;letter-spacing:.1em}
.terms-row{display:flex;justify-content:space-between;align-items:flex-start;padding:9px 16px;border-bottom:1px solid #0f0f0f;gap:12px}
.terms-row:last-child{border-bottom:none}
.terms-key{font-size:11px;font-family:monospace;color:#475569;flex-shrink:0}
.terms-val{font-size:12px;font-weight:600;text-align:right;line-height:1.4}
.modal-overlay{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px}
.modal-box{background:#111;border:1px solid #7f1d1d;border-radius:16px;padding:28px 24px;max-width:420px;width:100%;text-align:center}
.modal-title{font-size:18px;font-weight:800;color:#fca5a5;margin-bottom:10px}
.modal-body{font-size:13px;color:#94a3b8;line-height:1.7;margin-bottom:22px}
.modal-actions{display:flex;gap:10px}
.modal-cancel{flex:1;padding:12px;background:transparent;color:#94a3b8;border:1px solid #1f1f1f;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600}
.modal-confirm{flex:2;padding:12px;background:#7f1d1d;color:#fca5a5;border:1px solid #991b1b;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px}
.modal-confirm:disabled{opacity:.5;cursor:not-allowed}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:780px){.db-grid{grid-template-columns:1fr;padding:16px}.db-topbar{padding:10px 16px}}
`;
