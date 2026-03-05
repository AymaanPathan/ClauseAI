"use client";
import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setScreen,
  setPollingActive,
  completeMilestoneThunk,
  disputeMilestoneThunk,
  triggerMilestoneTimeoutThunk,
  triggerArbTimeoutThunk,
  pollAgreementThunk,
} from "../../store/slices/agreementSlice";
import {
  OnChainMilestone,
  MILESTONE_STATUS,
  milestoneStatusLabel,
} from "@/lib/contractReads";
import { TxState } from "../../store/slices/agreementSlice";

// ─── constants ────────────────────────────────────────────────
const BLOCK_TIME_SEC = 600; // ~10 min

// ─── helpers ─────────────────────────────────────────────────
function blocksToRelTime(delta: number): string {
  if (delta <= 0) return "now";
  const sec = delta * BLOCK_TIME_SEC;
  if (sec < 3600) return `~${Math.round(sec / 60)}m`;
  if (sec < 86400) return `~${Math.round(sec / 3600)}h`;
  return `~${Math.round(sec / 86400)}d`;
}

function statusColor(status: number): string {
  switch (status) {
    case MILESTONE_STATUS.COMPLETE:
      return "#22c55e";
    case MILESTONE_STATUS.DISPUTED:
      return "#f59e0b";
    case MILESTONE_STATUS.REFUNDED:
      return "#60a5fa";
    case MILESTONE_STATUS.ACTIVE:
      return "var(--yellow)";
    default:
      return "var(--grey-2)";
  }
}

function statusIcon(status: number): string {
  switch (status) {
    case MILESTONE_STATUS.COMPLETE:
      return "✅";
    case MILESTONE_STATUS.DISPUTED:
      return "⚖️";
    case MILESTONE_STATUS.REFUNDED:
      return "↩️";
    case MILESTONE_STATUS.ACTIVE:
      return "🔄";
    default:
      return "⏳";
  }
}

// ─── sub-components ──────────────────────────────────────────

function TxBadge({
  tx,
  color = "var(--yellow)",
}: {
  tx: TxState;
  color?: string;
}) {
  if (tx.status === "idle") return null;
  return (
    <div
      style={{
        marginTop: 10,
        padding: "8px 12px",
        background: tx.status === "failed" ? "#ef444415" : `${color}10`,
        border: `1px solid ${tx.status === "failed" ? "#ef444440" : `${color}30`}`,
        borderRadius: "var(--radius-sm)",
        fontSize: 11,
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontFamily: "var(--font-mono)",
      }}
    >
      {(tx.status === "pending" || tx.status === "confirming") && (
        <span
          style={{
            width: 12,
            height: 12,
            border: `2px solid ${color}`,
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
            display: "inline-block",
            flexShrink: 0,
          }}
        />
      )}
      <div>
        <span style={{ color: tx.status === "failed" ? "#ef4444" : color }}>
          {tx.status === "pending" && "Waiting for signature..."}
          {tx.status === "confirming" && "Broadcasting..."}
          {tx.status === "confirmed" && "Confirmed ✓"}
          {tx.status === "failed" && `Error: ${tx.error}`}
        </span>
        {tx.txUrl && tx.status !== "failed" && (
          <a
            href={tx.txUrl}
            target="_blank"
            rel="noreferrer"
            style={{ display: "block", color, marginTop: 2, fontSize: 10 }}
          >
            View on explorer ↗
          </a>
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  label,
  color,
  onClick,
  disabled,
  loading,
  small,
}: {
  label: string;
  color: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: small ? "8px 14px" : "10px 16px",
        background: disabled ? "var(--black-5)" : `${color}18`,
        color: disabled ? "var(--grey-2)" : color,
        border: `1px solid ${disabled ? "var(--black-5)" : `${color}50`}`,
        borderRadius: "var(--radius-sm)",
        fontSize: small ? 11 : 12,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
        transition: "all var(--transition)",
        fontFamily: "var(--font-display)",
        whiteSpace: "nowrap" as const,
      }}
      onMouseEnter={(e) =>
        !disabled &&
        !loading &&
        ((e.currentTarget as HTMLElement).style.background = `${color}28`)
      }
      onMouseLeave={(e) =>
        !disabled &&
        !loading &&
        ((e.currentTarget as HTMLElement).style.background = `${color}18`)
      }
    >
      {loading && (
        <span
          style={{
            width: 10,
            height: 10,
            border: `2px solid ${color}`,
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
            display: "inline-block",
          }}
        />
      )}
      {label}
    </button>
  );
}

function MilestoneCard({
  ms,
  tx,
  isPartyA,
  isPartyB,
  isArbitrator,
  agreementId,
  totalAmount,
  blockHeight,
  arbTimeoutBlocks,
  onComplete,
  onDispute,
  onTimeout,
  onArbTimeout,
}: {
  ms: OnChainMilestone;
  tx: TxState;
  isPartyA: boolean;
  isPartyB: boolean;
  isArbitrator: boolean;
  agreementId: string;
  totalAmount: number;
  blockHeight: number;
  arbTimeoutBlocks: number;
  onComplete: () => void;
  onDispute: () => void;
  onTimeout: () => void;
  onArbTimeout: () => void;
}) {
  const color = statusColor(ms.status);
  const icon = statusIcon(ms.status);
  const label = milestoneStatusLabel(ms.status);
  const usd = (totalAmount * ms.percentage) / 10000 / 1_000_000;
  const isActive = ms.status === MILESTONE_STATUS.ACTIVE;
  const isDisputed = ms.status === MILESTONE_STATUS.DISPUTED;
  const isDone =
    ms.status === MILESTONE_STATUS.COMPLETE ||
    ms.status === MILESTONE_STATUS.REFUNDED;

  const timedOut = ms.deadlineBlock > 0 && blockHeight >= ms.deadlineBlock;
  const arbTimedOut =
    isDisputed &&
    ms.disputeBlock > 0 &&
    blockHeight >= ms.disputeBlock + arbTimeoutBlocks;

  const blocksLeft =
    isActive && ms.deadlineBlock > 0 ? ms.deadlineBlock - blockHeight : null;
  const arbBlocksLeft =
    isDisputed && ms.disputeBlock > 0
      ? ms.disputeBlock + arbTimeoutBlocks - blockHeight
      : null;

  const txPending = tx.status === "pending" || tx.status === "confirming";

  return (
    <div
      style={{
        background: "var(--black-2)",
        border: `1px solid ${isDone ? "var(--black-4)" : `${color}40`}`,
        borderRadius: "var(--radius)",
        overflow: "hidden",
        opacity: isDone ? 0.75 : 1,
        transition: "all var(--transition)",
      }}
    >
      {/* header bar */}
      <div
        style={{
          height: 3,
          background: isDone ? "var(--black-5)" : color,
        }}
      />

      <div style={{ padding: "16px 20px" }}>
        {/* top row */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* index circle */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: `${color}15`,
                border: `1px solid ${color}40`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 800,
                color,
                flexShrink: 0,
                fontFamily: "var(--font-mono)",
              }}
            >
              {ms.index + 1}
            </div>
            <div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  marginBottom: 2,
                }}
              >
                Milestone {ms.index + 1}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                }}
              >
                <span style={{ color }}>
                  {icon} {label}
                </span>
                {ms.deadlineBlock > 0 && isActive && blocksLeft !== null && (
                  <span
                    style={{ color: timedOut ? "#ef4444" : "var(--grey-2)" }}
                  >
                    · deadline{" "}
                    {timedOut ? "PASSED" : blocksToRelTime(blocksLeft)}
                  </span>
                )}
                {isDisputed && arbBlocksLeft !== null && (
                  <span style={{ color: arbTimedOut ? "#ef4444" : "#f59e0b" }}>
                    · arb{" "}
                    {arbTimedOut
                      ? "TIMED OUT"
                      : `${blocksToRelTime(arbBlocksLeft)} left`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* amount */}
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: isDone ? "var(--grey-2)" : "var(--white)",
                fontFamily: "var(--font-mono)",
              }}
            >
              ${usd.toFixed(2)}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--grey-2)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {ms.percentage / 100}% of total
            </div>
          </div>
        </div>

        {/* ── Action buttons ────────────────────────────── */}
        {!isDone && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap" as const,
              gap: 8,
            }}
          >
            {/* Party A can complete if active and not timed out */}
            {isPartyA && isActive && !timedOut && (
              <ActionBtn
                label="✅ Mark Complete"
                color="#22c55e"
                onClick={onComplete}
                loading={txPending}
                disabled={txPending}
              />
            )}

            {/* Either party can dispute if active */}
            {(isPartyA || isPartyB) && isActive && (
              <ActionBtn
                label="⚖️ Dispute"
                color="#f59e0b"
                onClick={onDispute}
                loading={txPending}
                disabled={txPending}
              />
            )}

            {/* Anyone can trigger timeout after deadline passes */}
            {isActive && timedOut && (
              <ActionBtn
                label="⏱ Trigger Timeout"
                color="#60a5fa"
                onClick={onTimeout}
                loading={txPending}
                disabled={txPending}
              />
            )}

            {/* Arbitrator resolve buttons */}
            {isArbitrator && isDisputed && (
              <>
                <ActionBtn
                  label="→ Release to Receiver"
                  color="#22c55e"
                  onClick={onComplete}
                  loading={txPending}
                  disabled={txPending}
                />
                <ActionBtn
                  label="← Refund to Payer"
                  color="#60a5fa"
                  onClick={onTimeout}
                  loading={txPending}
                  disabled={txPending}
                />
              </>
            )}

            {/* Anyone can trigger arb timeout */}
            {isDisputed && arbTimedOut && (
              <ActionBtn
                label="⏱ Arb Timeout → Refund"
                color="#60a5fa"
                onClick={onArbTimeout}
                loading={txPending}
                disabled={txPending}
              />
            )}
          </div>
        )}

        {/* tx feedback */}
        <TxBadge tx={tx} color={color} />
      </div>
    </div>
  );
}

// ─── Main dashboard ──────────────────────────────────────────
export default function ScreenDashboard() {
  const dispatch = useAppDispatch();
  const {
    editedTerms,
    agreementId,
    walletAddress,
    milestones,
    milestoneInputs,
    txMilestone,
    onChainData,
    blockHeight,
    fundState,
    amountLocked,
    isPartyB,
    pollingActive,
  } = useAppSelector((s) => s.agreement);

  const ARB_TIMEOUT = 288; // mirror Clarity constant

  // ── role detection ────────────────────────────────────────
  const isPartyA = !isPartyB && !!walletAddress;
  const isArbitrator =
    !!walletAddress &&
    !!onChainData?.arbitrator &&
    walletAddress === onChainData.arbitrator;

  // displayed milestones — prefer on-chain, fallback to inputs
  const displayMilestones: OnChainMilestone[] =
    milestones.length > 0
      ? milestones
      : milestoneInputs.map((inp, i) => ({
          index: i,
          percentage: inp.percentage,
          amount: 0,
          status: MILESTONE_STATUS.PENDING,
          deadlineBlock: inp.deadlineBlock,
          disputeBlock: 0,
        }));

  // ── polling ───────────────────────────────────────────────
  useEffect(() => {
    if (!agreementId || pollingActive) return;
    dispatch(setPollingActive(true));

    const id = setInterval(() => {
      dispatch(pollAgreementThunk(agreementId));
    }, 15_000);

    // immediate first poll
    dispatch(pollAgreementThunk(agreementId));

    return () => {
      clearInterval(id);
      dispatch(setPollingActive(false));
    };
  }, [agreementId]);

  // ── totals ────────────────────────────────────────────────
  const completedPct = displayMilestones
    .filter((m) => m.status === MILESTONE_STATUS.COMPLETE)
    .reduce((s, m) => s + m.percentage, 0);
  const pendingPct = displayMilestones
    .filter((m) => m.status === MILESTONE_STATUS.ACTIVE)
    .reduce((s, m) => s + m.percentage, 0);

  const totalAmount = onChainData?.totalAmount ?? 0;
  const amountUsd = parseFloat(editedTerms?.amount_usd ?? amountLocked ?? "0");

  // ── dispatch helpers ──────────────────────────────────────
  function complete(ms: OnChainMilestone) {
    if (!agreementId) return;
    dispatch(completeMilestoneThunk({ agreementId, milestoneIndex: ms.index }));
  }

  function dispute(ms: OnChainMilestone) {
    if (!agreementId) return;
    dispatch(disputeMilestoneThunk({ agreementId, milestoneIndex: ms.index }));
  }

  function timeout(ms: OnChainMilestone) {
    if (!agreementId) return;
    dispatch(
      triggerMilestoneTimeoutThunk({ agreementId, milestoneIndex: ms.index }),
    );
  }

  function arbTimeout(ms: OnChainMilestone) {
    if (!agreementId) return;
    dispatch(triggerArbTimeoutThunk({ agreementId, milestoneIndex: ms.index }));
  }

  // ── state chip ────────────────────────────────────────────
  const stateChip = {
    idle: { label: "Awaiting Deposit", color: "var(--grey-1)" },
    locked: { label: "Active", color: "var(--yellow)" },
    released: { label: "Complete", color: "#22c55e" },
    refunded: { label: "Refunded", color: "#60a5fa" },
    disputed: { label: "In Dispute", color: "#f59e0b" },
  }[fundState] ?? { label: fundState, color: "var(--grey-1)" };

  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        padding: "48px 24px 80px",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      {/* ── Top bar ────────────────────────────────────────── */}
      <div
        className="animate-fade-up"
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 32,
          flexWrap: "wrap" as const,
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 4,
            }}
          >
            <h2
              style={{
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: "-0.5px",
              }}
            >
              Escrow Dashboard
            </h2>
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: stateChip.color,
                background: `${stateChip.color}15`,
                border: `1px solid ${stateChip.color}40`,
                borderRadius: 99,
                padding: "2px 10px",
              }}
            >
              ● {stateChip.label}
            </span>
          </div>
          <div
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--grey-2)",
            }}
          >
            #{agreementId} · block {blockHeight.toLocaleString()}
          </div>
        </div>

        <button
          onClick={() => dispatch(setScreen("landing"))}
          style={{
            background: "none",
            border: "1px solid var(--black-4)",
            color: "var(--grey-1)",
            fontSize: 12,
            cursor: "pointer",
            borderRadius: 99,
            padding: "6px 16px",
            fontFamily: "var(--font-display)",
          }}
        >
          New Agreement
        </button>
      </div>

      {/* ── Progress overview ───────────────────────────────── */}
      <div
        className="animate-fade-up delay-1"
        style={{
          background: "var(--black-2)",
          border: "1px solid var(--black-4)",
          borderRadius: "var(--radius)",
          padding: "20px",
          marginBottom: 28,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
            marginBottom: 16,
          }}
        >
          {[
            {
              label: "Released",
              value: `${completedPct / 100}%`,
              sub: `$${((amountUsd * completedPct) / 10000).toFixed(2)}`,
              color: "#22c55e",
            },
            {
              label: "In Escrow",
              value: `${pendingPct / 100}%`,
              sub: `$${((amountUsd * pendingPct) / 10000).toFixed(2)}`,
              color: "var(--yellow)",
            },
            {
              label: "Total",
              value: `$${amountUsd.toFixed(2)}`,
              sub: `${displayMilestones.length} milestones`,
              color: "var(--white)",
            },
          ].map(({ label, value, sub, color }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  color: "var(--grey-1)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 4,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {value}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--grey-2)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {sub}
              </div>
            </div>
          ))}
        </div>

        {/* stacked progress bar */}
        <div
          style={{
            height: 8,
            background: "var(--black-5)",
            borderRadius: 4,
            overflow: "hidden",
            display: "flex",
          }}
        >
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
                      ? "var(--yellow)"
                      : "var(--black-5)";
            return (
              <div
                key={ms.index}
                title={`Milestone ${ms.index + 1}: ${milestoneStatusLabel(ms.status)}`}
                style={{
                  height: "100%",
                  width: `${w}%`,
                  background: bg,
                  transition: "width 0.4s",
                  borderRight: "1px solid var(--black-2)",
                }}
              />
            );
          })}
        </div>

        {/* legend */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 10,
            flexWrap: "wrap" as const,
          }}
        >
          {[
            { color: "#22c55e", label: "Complete" },
            { color: "var(--yellow)", label: "Active" },
            { color: "#f59e0b", label: "Disputed" },
            { color: "#60a5fa", label: "Refunded" },
          ].map(({ color, label }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--grey-2)",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: color,
                  display: "inline-block",
                }}
              />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Parties ─────────────────────────────────────────── */}
      <div
        className="animate-fade-up delay-2"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 28,
        }}
      >
        {[
          {
            role: "💸 Payer",
            name: editedTerms?.partyA ?? "Party A",
            address: onChainData?.partyA ?? "",
            color: "var(--yellow)",
            highlight: isPartyA,
          },
          {
            role: "🎯 Receiver",
            name: editedTerms?.partyB ?? "Party B",
            address: onChainData?.partyB ?? "",
            color: "#22c55e",
            highlight: isPartyB,
          },
        ].map(({ role, name, address, color, highlight }) => (
          <div
            key={role}
            style={{
              background: "var(--black-2)",
              border: `1px solid ${highlight ? `${color}40` : "var(--black-4)"}`,
              borderRadius: "var(--radius-sm)",
              padding: "14px 16px",
              position: "relative" as const,
            }}
          >
            {highlight && (
              <span
                style={{
                  position: "absolute" as const,
                  top: 8,
                  right: 10,
                  fontSize: 9,
                  fontFamily: "var(--font-mono)",
                  color,
                  background: `${color}15`,
                  border: `1px solid ${color}30`,
                  borderRadius: 99,
                  padding: "1px 6px",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.08em",
                }}
              >
                you
              </span>
            )}
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color,
                textTransform: "uppercase" as const,
                letterSpacing: "0.1em",
                marginBottom: 4,
              }}
            >
              {role}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
              {name}
            </div>
            {address && (
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  color: "var(--grey-2)",
                }}
              >
                {address.slice(0, 8)}...{address.slice(-4)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Milestones list ─────────────────────────────────── */}
      <div className="animate-fade-up delay-3">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--grey-1)",
            }}
          >
            Milestones
          </h3>
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--grey-2)",
            }}
          >
            {
              displayMilestones.filter(
                (m) => m.status === MILESTONE_STATUS.COMPLETE,
              ).length
            }
            /{displayMilestones.length} complete
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {displayMilestones.map((ms) => (
            <MilestoneCard
              key={ms.index}
              ms={ms}
              tx={
                txMilestone[ms.index] ?? {
                  status: "idle",
                  txId: null,
                  txUrl: null,
                  error: null,
                }
              }
              isPartyA={isPartyA}
              isPartyB={isPartyB}
              isArbitrator={isArbitrator}
              agreementId={agreementId ?? ""}
              totalAmount={totalAmount}
              blockHeight={blockHeight}
              arbTimeoutBlocks={ARB_TIMEOUT}
              onComplete={() => complete(ms)}
              onDispute={() => dispute(ms)}
              onTimeout={() => timeout(ms)}
              onArbTimeout={() => arbTimeout(ms)}
            />
          ))}
        </div>
      </div>

      {/* ── Role hint ───────────────────────────────────────── */}
      <div
        className="animate-fade-up delay-4"
        style={{
          marginTop: 28,
          padding: "14px 16px",
          background: "var(--black-2)",
          border: "1px solid var(--black-4)",
          borderRadius: "var(--radius-sm)",
          fontSize: 12,
          color: "var(--grey-2)",
          fontFamily: "var(--font-mono)",
          lineHeight: 2,
        }}
      >
        {isPartyA && (
          <>
            <span style={{ color: "var(--yellow)" }}>You are the Payer.</span>{" "}
            Mark milestones complete when work is delivered. You can dispute
            individual tranches.
          </>
        )}
        {isPartyB && (
          <>
            <span style={{ color: "#22c55e" }}>You are the Receiver.</span> Each
            milestone releases funds independently. Dispute if a milestone is
            incorrectly rejected.
          </>
        )}
        {isArbitrator && (
          <>
            <span style={{ color: "#60a5fa" }}>You are the Arbitrator.</span>{" "}
            Resolve disputed milestones by releasing to receiver or refunding to
            payer.
          </>
        )}
        {!isPartyA && !isPartyB && !isArbitrator && (
          <>Observer view — connect with a party wallet to take actions.</>
        )}
      </div>
    </div>
  );
}
