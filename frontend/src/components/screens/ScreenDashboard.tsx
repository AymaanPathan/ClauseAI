"use client";
// ============================================================
// ScreenDashboard.tsx — MILESTONE UPGRADE
// Replaces single status with per-milestone progress tracker.
// Each milestone: PENDING / ACTIVE / COMPLETE / REFUNDED / DISPUTED
// Shows released amount per completed milestone.
// Payer can release/dispute each milestone independently.
// ============================================================
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  completeMilestoneThunk,
  disputeMilestoneThunk,
  triggerMilestoneTimeoutThunk,
  triggerArbTimeoutThunk,
  pollAgreementThunk,
  rehydrateSession,
  resetAll,
} from "@/store/slices/agreementSlice";

// ── Constants ─────────────────────────────────────────────────
const POLL_MS = 12_000;

// On-chain milestone status codes (mirror Clarity contract)
const MS_STATUS = {
  PENDING: 0,
  ACTIVE: 1,
  COMPLETE: 2,
  REFUNDED: 3,
  DISPUTED: 4,
} as const;

const MS_META: Record<number, { label: string; color: string; icon: string }> =
  {
    0: { label: "Pending", color: "#475569", icon: "⏸" },
    1: { label: "Active", color: "#f5c400", icon: "🔒" },
    2: { label: "Complete", color: "#22c55e", icon: "✅" },
    3: { label: "Refunded", color: "#60a5fa", icon: "↩️" },
    4: { label: "Disputed", color: "#f59e0b", icon: "⚖️" },
  };

const AGREEMENT_STATE: Record<
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

function fmtWallet(a?: string | null) {
  if (!a) return "—";
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}

function msColor(idx: number) {
  return `hsl(${(idx * 47 + 140) % 360}, 70%, 55%)`;
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
    milestones,
    milestoneInputs,
    blockHeight,
    txMilestone,
    isPartyB,
  } = useAppSelector((s) => s.agreement);

  const [ready, setReady] = useState(false);
  const [lastPolled, setLastPolled] = useState("—");
  const [disputeModal, setDisputeModal] = useState<{
    open: boolean;
    msIdx: number | null;
  }>({ open: false, msIdx: null });

  useEffect(() => {
    dispatch(rehydrateSession());
    setReady(true);
  }, [dispatch]);

  useEffect(() => {
    if (ready && !agreementId) router.replace("/");
  }, [ready, agreementId, router]);

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

  // ── Derived ───────────────────────────────────────────────
  const onChainState = onChainData?.state ?? 0;
  const agMeta = AGREEMENT_STATE[onChainState] ?? AGREEMENT_STATE[1];
  const totalUsd = parseFloat(
    amountLocked ??
      (editedTerms as any)?.total_usd ??
      (editedTerms as any)?.amount_usd ??
      "0",
  );
  const isFinished = onChainState === 2 || onChainState === 3;
  const payerName =
    (editedTerms as any)?.payer ?? (editedTerms as any)?.partyA ?? "Payer";
  const receiverName =
    (editedTerms as any)?.receiver ??
    (editedTerms as any)?.partyB ??
    "Receiver";
  const payerWallet = isPartyB ? counterpartyWallet : walletAddress;
  const receiverWallet = isPartyB ? walletAddress : counterpartyWallet;
  const roleColor = isPartyB ? "#22c55e" : "#f5c400";

  // Merge on-chain milestones with local milestone inputs for display
  const displayMilestones =
    milestones.length > 0
      ? milestones
      : milestoneInputs.map((inp, i) => ({
          index: i,
          percentage: inp.percentage,
          amount: Math.round(((totalUsd * inp.percentage) / 10000) * 1_000_000), // microSTX estimate
          status: onChainState >= 1 ? MS_STATUS.ACTIVE : MS_STATUS.PENDING,
          deadlineBlock: inp.deadlineBlock,
          disputeBlock: 0,
        }));

  // also get labels from editedTerms.milestones or milestoneInputs
  const msLabels: string[] = (() => {
    const v2ms = (editedTerms as any)?.milestones;
    if (Array.isArray(v2ms))
      return v2ms.map(
        (m: any) => m.title || `Milestone ${v2ms.indexOf(m) + 1}`,
      );
    return displayMilestones.map((_, i) => `Milestone ${i + 1}`);
  })();

  const releasedCount = displayMilestones.filter(
    (m) => m.status === MS_STATUS.COMPLETE,
  ).length;
  const releasedUsd = displayMilestones
    .filter((m) => m.status === MS_STATUS.COMPLETE)
    .reduce((sum, m) => sum + (Number(m.amount) / 1_000_000) * 0.8, 0);
  const lockedUsd = totalUsd - releasedUsd;

  if (!ready) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
          <p
            style={{ fontSize: 14, fontFamily: "monospace", color: "#64748b" }}
          >
            Loading dashboard…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#f1f5f9",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <style>{CSS}</style>

      {/* ── Topbar ───────────────────────────────────────────── */}
      <header className="db-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="db-logo-btn" onClick={() => router.push("/")}>
            <span style={{ color: "#f5c400", fontSize: 18, fontWeight: 800 }}>
              Clause
            </span>
            <span style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>
              Ai
            </span>
          </button>
          <span className="escrow-badge">#{agreementId ?? "—"}</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap" as const,
          }}
        >
          <span
            className="role-chip"
            style={{
              color: roleColor,
              borderColor: `${roleColor}50`,
              background: `${roleColor}10`,
            }}
          >
            {isPartyB ? "🎯 Receiver" : "💸 Payer"}
          </span>
          <span
            className="state-chip"
            style={{ color: agMeta.color, borderColor: `${agMeta.color}40` }}
          >
            {agMeta.pulse && (
              <span
                className="pulse-dot"
                style={{ background: agMeta.color }}
              />
            )}
            {agMeta.icon} {agMeta.label}
          </span>
        </div>
      </header>

      <main
        style={{
          display: "grid",
          gridTemplateColumns: "340px 1fr",
          gap: 20,
          padding: 24,
          maxWidth: 1120,
          margin: "0 auto",
        }}
      >
        {/* ── LEFT ─────────────────────────────────────────────── */}
        <section
          style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}
        >
          {/* Role card */}
          <div
            style={{
              border: `1px solid ${roleColor}25`,
              background: `${roleColor}08`,
              borderRadius: 14,
              padding: "18px 20px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                textTransform: "uppercase" as const,
                letterSpacing: "0.12em",
                color: roleColor,
                marginBottom: 8,
              }}
            >
              {isPartyB ? "🎯 You are the Receiver" : "💸 You are the Payer"}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>
              {isPartyB ? receiverName : payerName}
            </div>
            <div
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                color: "#475569",
                marginTop: 4,
              }}
            >
              {fmtWallet(walletAddress)}
            </div>
          </div>

          {/* Progress summary */}
          <div
            style={{
              background: "#111",
              border: "1px solid #1f1f1f",
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: "monospace",
                color: "#475569",
                textTransform: "uppercase" as const,
                letterSpacing: "0.1em",
                marginBottom: 10,
              }}
            >
              Milestone Progress
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {displayMilestones.map((ms, i) => {
                const color = MS_META[ms.status]?.color ?? "#475569";
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 6,
                      borderRadius: 3,
                      background: color,
                      opacity: ms.status === MS_STATUS.PENDING ? 0.25 : 1,
                      transition: "all 0.3s",
                    }}
                  />
                );
              })}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
              }}
            >
              <span style={{ color: "#22c55e" }}>
                {releasedCount}/{displayMilestones.length} complete
              </span>
              <span style={{ color: "#f5c400", fontFamily: "monospace" }}>
                ${lockedUsd.toFixed(2)} locked
              </span>
            </div>
          </div>

          {/* Payer actions section */}
          {!isPartyB && !isFinished && (
            <div
              style={{
                display: "flex",
                flexDirection: "column" as const,
                gap: 8,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "#475569",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.12em",
                }}
              >
                Your Actions
              </div>
              <div
                style={{
                  background: "#f5c40008",
                  border: "1px solid #f5c40025",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 12,
                  lineHeight: 1.65,
                  color: "#94a3b8",
                }}
              >
                <strong style={{ color: "#f5c400" }}>You are the Payer.</strong>{" "}
                Release each milestone individually as conditions are met.
                Disputes lock only that tranche.
              </div>
            </div>
          )}

          {/* Receiver waiting */}
          {isPartyB && !isFinished && (
            <div
              style={{
                display: "flex",
                flexDirection: "column" as const,
                gap: 8,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "#475569",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.12em",
                }}
              >
                Your Actions
              </div>
              <div
                style={{
                  background: "#22c55e08",
                  border: "1px solid #22c55e25",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 12,
                  lineHeight: 1.65,
                  color: "#94a3b8",
                }}
              >
                <strong style={{ color: "#22c55e" }}>
                  You are the Receiver.
                </strong>{" "}
                Each milestone releases to your wallet as the payer approves. No
                action required from you.
              </div>
              <div
                style={{
                  padding: "12px 16px",
                  background: "#22c55e08",
                  border: "1px solid #22c55e30",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#22c55e",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#22c55e",
                    animation: "pdot 1.4s ease-in-out infinite",
                  }}
                />
                Waiting for {payerName} to release milestones…
              </div>
            </div>
          )}

          {/* Finished */}
          {isFinished && (
            <div
              style={{
                background: "#111",
                border: "1px solid #1f1f1f",
                borderRadius: 14,
                padding: 24,
                textAlign: "center" as const,
              }}
            >
              <div style={{ fontSize: 34 }}>
                {onChainState === 2 ? "✅" : "↩️"}
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, marginTop: 10 }}>
                {onChainState === 2 ? "Escrow Complete" : "Funds Refunded"}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#94a3b8",
                  marginTop: 6,
                  lineHeight: 1.5,
                }}
              >
                {onChainState === 2
                  ? `Payment released to ${receiverName}.`
                  : `Funds returned to ${payerName}.`}
              </div>
              <button
                onClick={() => {
                  dispatch(resetAll());
                  router.push("/");
                }}
                style={{
                  marginTop: 20,
                  padding: "12px 24px",
                  background: "#f5c400",
                  color: "#0a0a0a",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                + New Agreement
              </button>
            </div>
          )}

          {/* Parties */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
            <div
              style={{
                display: "flex",
                flexDirection: "column" as const,
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
              }}
            >
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
        <section
          style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}
        >
          {/* Amount card */}
          <div
            style={{
              background: "linear-gradient(135deg,#140f00 0%,#111 100%)",
              border: "1px solid #f5c40022",
              borderRadius: 16,
              padding: "20px 24px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: "monospace",
                color: "#f5c400",
                textTransform: "uppercase" as const,
                letterSpacing: "0.18em",
                marginBottom: 8,
              }}
            >
              🔒 Escrowed on Stacks Bitcoin
            </div>
            <div style={{ display: "flex", gap: 24, alignItems: "flex-end" }}>
              <div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 900,
                    color: "#f5c400",
                    letterSpacing: "-1px",
                  }}
                >
                  ${totalUsd.toFixed(2)}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#f5c400",
                    marginTop: 2,
                  }}
                >
                  Total locked
                </div>
              </div>
              <div style={{ paddingBottom: 4 }}>
                <div
                  style={{ fontSize: 18, fontWeight: 700, color: "#22c55e" }}
                >
                  ${releasedUsd.toFixed(2)}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#22c55e",
                  }}
                >
                  Released
                </div>
              </div>
              <div style={{ paddingBottom: 4 }}>
                <div
                  style={{ fontSize: 18, fontWeight: 700, color: "#60a5fa" }}
                >
                  ${lockedUsd.toFixed(2)}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#60a5fa",
                  }}
                >
                  Remaining
                </div>
              </div>
            </div>
          </div>

          {/* ── MILESTONE PROGRESS TRACKER ──────────────────── */}
          <div
            style={{
              background: "#111",
              border: "1px solid #1f1f1f",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #1a1a1a",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "#475569",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.1em",
                }}
              >
                Milestone Tracker
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontFamily: "monospace",
                  color: "#334155",
                }}
              >
                Polled {lastPolled}
              </span>
            </div>

            {displayMilestones.length === 0 && (
              <div
                style={{
                  padding: 24,
                  textAlign: "center" as const,
                  color: "#475569",
                  fontSize: 13,
                }}
              >
                No milestones found. Deploy the contract first.
              </div>
            )}

            {displayMilestones.map((ms, idx) => {
              const msMeta = MS_META[ms.status] ?? MS_META[0];
              const txState = txMilestone[idx];
              const color = msColor(idx);
              const msUsd = ((totalUsd * ms.percentage) / 10000).toFixed(2);
              const label = msLabels[idx] ?? `Milestone ${idx + 1}`;
              const pct = ms.percentage / 100; // basis points → %
              const isActive = ms.status === MS_STATUS.ACTIVE;
              const isDisputed = ms.status === MS_STATUS.DISPUTED;
              const isComplete = ms.status === MS_STATUS.COMPLETE;
              const isRefunded = ms.status === MS_STATUS.REFUNDED;

              const isTimedOut =
                ms.deadlineBlock > 0 &&
                blockHeight >= ms.deadlineBlock &&
                isActive;
              const isArbTimeout =
                ms.deadlineBlock > 0 &&
                isDisputed &&
                blockHeight >= ms.disputeBlock + 288;

              return (
                <div
                  key={idx}
                  style={{
                    borderBottom:
                      idx < displayMilestones.length - 1
                        ? "1px solid #0f0f0f"
                        : "none",
                    padding: "14px 16px",
                  }}
                >
                  {/* Row header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: isActive && !isPartyB ? 10 : 0,
                    }}
                  >
                    {/* index badge */}
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        background: `${color}20`,
                        border: `1px solid ${color}60`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 700,
                        color,
                        flexShrink: 0,
                        fontFamily: "monospace",
                      }}
                    >
                      {idx + 1}
                    </div>
                    {/* title + condition */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {label}
                      </div>
                      {(editedTerms as any)?.milestones?.[idx]?.condition && (
                        <div
                          style={{
                            fontSize: 10,
                            color: "#475569",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap" as const,
                            marginTop: 1,
                          }}
                        >
                          {(editedTerms as any).milestones[idx].condition}
                        </div>
                      )}
                    </div>
                    {/* pct + usd */}
                    <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontFamily: "monospace",
                          color,
                          fontWeight: 700,
                        }}
                      >
                        {pct}% · ${msUsd}
                      </div>
                    </div>
                    {/* status badge */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        background: `${msMeta.color}15`,
                        border: `1px solid ${msMeta.color}40`,
                        borderRadius: 99,
                        padding: "2px 8px",
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: 10 }}>{msMeta.icon}</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: "monospace",
                          color: msMeta.color,
                          fontWeight: 700,
                        }}
                      >
                        {msMeta.label}
                      </span>
                    </div>
                  </div>

                  {/* Release amount on complete */}
                  {isComplete && (
                    <div
                      style={{
                        marginTop: 6,
                        padding: "6px 10px",
                        background: "#22c55e10",
                        border: "1px solid #22c55e30",
                        borderRadius: 6,
                        fontSize: 11,
                        color: "#22c55e",
                        fontFamily: "monospace",
                      }}
                    >
                      ✅ ${msUsd} released to {receiverName}
                    </div>
                  )}
                  {isRefunded && (
                    <div
                      style={{
                        marginTop: 6,
                        padding: "6px 10px",
                        background: "#60a5fa10",
                        border: "1px solid #60a5fa30",
                        borderRadius: 6,
                        fontSize: 11,
                        color: "#60a5fa",
                        fontFamily: "monospace",
                      }}
                    >
                      ↩️ ${msUsd} refunded to {payerName}
                    </div>
                  )}

                  {/* Tx state banner */}
                  {txState && txState.status !== "idle" && (
                    <div
                      style={{
                        marginTop: 6,
                        padding: "6px 10px",
                        background: "#f59e0b08",
                        border: "1px solid #f59e0b30",
                        borderRadius: 6,
                        fontSize: 11,
                        color: "#f59e0b",
                        fontFamily: "monospace",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {txState.status === "pending" && (
                        <>
                          <SpinDot color="#f59e0b" /> Waiting for wallet…
                        </>
                      )}
                      {txState.status === "confirming" && (
                        <>
                          <SpinDot color="#f59e0b" /> Confirming…{" "}
                          {txState.txUrl && (
                            <a
                              href={txState.txUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "#f5c400" }}
                            >
                              View ↗
                            </a>
                          )}
                        </>
                      )}
                      {txState.status === "failed" && (
                        <span style={{ color: "#f87171" }}>
                          ❌ {txState.error}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Payer action buttons for active milestones */}
                  {!isPartyB &&
                    isActive &&
                    !isTimedOut &&
                    onChainState === 1 && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          disabled={txState?.status === "pending"}
                          onClick={() =>
                            agreementId &&
                            dispatch(
                              completeMilestoneThunk({
                                agreementId,
                                milestoneIndex: idx,
                              }),
                            )
                          }
                          style={{
                            flex: 2,
                            padding: "9px 12px",
                            background: "#22c55e",
                            color: "#0a0a0a",
                            border: "none",
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            opacity: txState?.status === "pending" ? 0.6 : 1,
                          }}
                        >
                          {txState?.status === "pending" ? (
                            <>
                              <SpinDot color="#0a0a0a" /> Releasing…
                            </>
                          ) : (
                            "✅ Release Payment"
                          )}
                        </button>
                        <button
                          disabled={!!txState && txState.status === "pending"}
                          onClick={() =>
                            setDisputeModal({ open: true, msIdx: idx })
                          }
                          style={{
                            flex: 1,
                            padding: "9px 12px",
                            background: "transparent",
                            color: "#f87171",
                            border: "1px solid #7f1d1d",
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          ⚠️ Dispute
                        </button>
                      </div>
                    )}

                  {/* Payer: receiver action for disputed */}
                  {isDisputed && !isPartyB && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "8px 10px",
                        background: "#f59e0b10",
                        border: "1px solid #f59e0b30",
                        borderRadius: 6,
                        fontSize: 11,
                        color: "#f59e0b",
                      }}
                    >
                      ⚖️ Awaiting arbitrator decision for this tranche.
                      {isArbTimeout && (
                        <button
                          onClick={() =>
                            agreementId &&
                            dispatch(
                              triggerArbTimeoutThunk({
                                agreementId,
                                milestoneIndex: idx,
                              }),
                            )
                          }
                          style={{
                            marginLeft: 8,
                            fontSize: 10,
                            color: "#60a5fa",
                            background: "#60a5fa15",
                            border: "1px solid #60a5fa40",
                            borderRadius: 4,
                            padding: "2px 8px",
                            cursor: "pointer",
                          }}
                        >
                          Trigger arb timeout
                        </button>
                      )}
                    </div>
                  )}

                  {/* Timeout trigger */}
                  {!isPartyB && isTimedOut && (
                    <div
                      style={{
                        marginTop: 8,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          background: "#f59e0b10",
                          border: "1px solid #f59e0b30",
                          borderRadius: 6,
                          fontSize: 11,
                          color: "#f59e0b",
                        }}
                      >
                        ⏱ Deadline passed — tranche can be refunded
                      </div>
                      <button
                        onClick={() =>
                          agreementId &&
                          dispatch(
                            triggerMilestoneTimeoutThunk({
                              agreementId,
                              milestoneIndex: idx,
                            }),
                          )
                        }
                        style={{
                          padding: "7px 12px",
                          background: "#f59e0b",
                          color: "#0a0a0a",
                          border: "none",
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        Refund Tranche
                      </button>
                    </div>
                  )}

                  {/* Deadline info */}
                  {ms.deadlineBlock > 0 && isActive && !isTimedOut && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 10,
                        fontFamily: "monospace",
                        color: "#334155",
                      }}
                    >
                      Deadline: block #{ms.deadlineBlock.toLocaleString()} ·{" "}
                      {Math.max(
                        0,
                        ms.deadlineBlock - blockHeight,
                      ).toLocaleString()}{" "}
                      blocks left
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Agreement terms */}
          <div
            style={{
              background: "#111",
              border: "1px solid #1f1f1f",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid #1a1a1a",
                fontSize: 10,
                fontFamily: "monospace",
                color: "#475569",
                textTransform: "uppercase" as const,
                letterSpacing: "0.1em",
              }}
            >
              Agreement Terms
            </div>
            {[
              {
                label: "⚖️ Arbitrator",
                value: (editedTerms as any)?.arbitrator ?? "TBD",
              },
              {
                label: "⏱ Arb Timeout",
                value: "Auto-refund per tranche if inactive 48h",
              },
              { label: "📋 Agreement", value: `#${agreementId}` },
            ].map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  padding: "9px 16px",
                  borderBottom: "1px solid #0f0f0f",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#475569",
                    flexShrink: 0,
                  }}
                >
                  {r.label}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    textAlign: "right" as const,
                    lineHeight: 1.4,
                  }}
                >
                  {r.value ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ── Dispute modal ─────────────────────────────────── */}
      {disputeModal.open && disputeModal.msIdx !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={() => setDisputeModal({ open: false, msIdx: null })}
        >
          <div
            style={{
              background: "#111",
              border: "1px solid #7f1d1d",
              borderRadius: 16,
              padding: "28px 24px",
              maxWidth: 420,
              width: "100%",
              textAlign: "center" as const,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 36, marginBottom: 14 }}>⚖️</div>
            <h3
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "#fca5a5",
                marginBottom: 10,
              }}
            >
              Dispute Milestone {(disputeModal.msIdx ?? 0) + 1}?
            </h3>
            <p
              style={{
                fontSize: 13,
                color: "#94a3b8",
                lineHeight: 1.7,
                marginBottom: 22,
              }}
            >
              This locks{" "}
              <strong style={{ color: "#fff" }}>
                $
                {(
                  (totalUsd *
                    (displayMilestones[disputeModal.msIdx]?.percentage ?? 0)) /
                  10000
                ).toFixed(2)}
              </strong>{" "}
              for this tranche only. Arbitrator{" "}
              <strong style={{ color: "#fff" }}>
                {(editedTerms as any)?.arbitrator ?? "TBD"}
              </strong>{" "}
              will review. Auto-refunds to payer in{" "}
              <strong style={{ color: "#f59e0b" }}>48 hours</strong> if
              unresolved.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setDisputeModal({ open: false, msIdx: null })}
                style={{
                  flex: 1,
                  padding: 12,
                  background: "transparent",
                  color: "#94a3b8",
                  border: "1px solid #1f1f1f",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (agreementId && disputeModal.msIdx !== null) {
                    dispatch(
                      disputeMilestoneThunk({
                        agreementId,
                        milestoneIndex: disputeModal.msIdx,
                      }),
                    );
                  }
                  setDisputeModal({ open: false, msIdx: null });
                }}
                style={{
                  flex: 2,
                  padding: 12,
                  background: "#7f1d1d",
                  color: "#fca5a5",
                  border: "1px solid #991b1b",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 13,
                }}
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
    <div
      style={{
        flex: 1,
        background: "#111",
        border: `1px solid ${color}25`,
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontFamily: "monospace",
          textTransform: "uppercase" as const,
          letterSpacing: "0.12em",
          color,
          marginBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        {role}
        {isMe && (
          <span
            style={{
              borderRadius: 4,
              padding: "1px 5px",
              fontSize: 8,
              background: `${color}20`,
              color,
            }}
          >
            YOU
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{name}</div>
      <div
        style={{
          fontSize: 10,
          fontFamily: "monospace",
          color: statusColor,
          marginTop: 4,
        }}
      >
        {status}
      </div>
      {wallet && (
        <div
          style={{
            fontSize: 9,
            fontFamily: "monospace",
            color: "#334155",
            marginTop: 3,
          }}
        >
          {fmtWallet(wallet)}
        </div>
      )}
    </div>
  );
}

function SpinDot({ color = "#f59e0b" }: { color?: string }) {
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
const CSS = `
*{box-sizing:border-box}
.db-topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 24px;border-bottom:1px solid #1f1f1f;background:#0d0d0d;position:sticky;top:0;z-index:40;flex-wrap:wrap;gap:10px}
.db-logo-btn{background:none;border:none;cursor:pointer;padding:0;display:flex}
.escrow-badge{font-size:11px;font-family:monospace;color:#64748b;background:#161616;border:1px solid #2a2a2a;border-radius:99px;padding:3px 10px}
.role-chip{font-size:11px;font-family:monospace;font-weight:700;border:1px solid;border-radius:99px;padding:4px 12px}
.state-chip{font-size:11px;font-family:monospace;border:1px solid;border-radius:99px;padding:4px 12px;background:#111;display:flex;align-items:center;gap:5px}
.pulse-dot{width:6px;height:6px;border-radius:50%;display:inline-block;animation:pdot 1.4s ease-in-out infinite}
@keyframes pdot{0%,100%{opacity:1}50%{opacity:.2}}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:780px){main{grid-template-columns:1fr!important;padding:16px!important}.db-topbar{padding:10px 16px}}
`;
