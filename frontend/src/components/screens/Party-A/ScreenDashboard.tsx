"use client";
// ============================================================
// components/partyA/ScreenDashboard.tsx — PRODUCTION v2
// ============================================================

import { useEffect, useCallback, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/store";
import {
  setScreen,
  markComplete,
  resetAll,
  completeMilestoneThunk,
  disputeMilestoneThunk,
  triggerTimeoutThunk,
  setMilestoneTxState,
  setMilestoneOnChainStatus,
  pollMilestoneTxThunk,
  saveAgreementToDbThunk,
} from "@/store/slices/partyASlice";
import { isV2, ParsedAgreementV2 } from "@/api/parseApi";
import { usdToSatsPreview } from "@/lib/contractCalls";
import { formatSats, explorerTxUrl } from "@/lib/stacksConfig";
import { getAllMilestones, MILESTONE_STATUS } from "@/lib/contractReads";
import DisputeSubmitScreen from "@/components/screens/Shared/DisputeSubmitScreen";

// ── Types ──────────────────────────────────────────────────────
type MilestoneUIStatus =
  | "locked"
  | "pending"
  | "complete"
  | "disputed"
  | "refunded"
  | "failed";

interface MilestoneUI {
  index: number;
  title: string;
  percentage: number;
  condition: string;
  deadline: string;
  amountUsd: string;
  amountSats: number;
}

function onChainStatusToUI(s: number): MilestoneUIStatus {
  switch (s) {
    case MILESTONE_STATUS.COMPLETE:
      return "complete";
    case MILESTONE_STATUS.REFUNDED:
      return "refunded";
    case MILESTONE_STATUS.DISPUTED:
      return "disputed";
    case MILESTONE_STATUS.ACTIVE:
      return "locked";
    default:
      return "locked";
  }
}
function statusColor(s: MilestoneUIStatus) {
  if (s === "complete") return "var(--green)";
  if (s === "disputed") return "var(--amber)";
  if (s === "refunded") return "#ef4444";
  if (s === "failed") return "#ef4444";
  if (s === "pending") return "var(--text-3)";
  return "var(--text-4)";
}
function statusLabel(s: MilestoneUIStatus) {
  if (s === "complete") return "Released ✓";
  if (s === "disputed") return "In Dispute";
  if (s === "refunded") return "Refunded";
  if (s === "failed") return "Tx Failed";
  if (s === "pending") return "Confirming…";
  return "Locked";
}

// ── Component ──────────────────────────────────────────────────
export default function ScreenDashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const {
    editedTerms,
    agreementId,
    walletAddress,
    amountLocked,
    txMilestone,
    milestoneOnChainStatuses,
  } = useSelector((s: RootState) => s.partyA);

  const t = editedTerms as any;
  const v2 = isV2(editedTerms)
    ? (editedTerms as unknown as ParsedAgreementV2)
    : null;
  const payerName = t?.payer ?? t?.partyA ?? "Payer";
  const receiverName = t?.receiver ?? t?.partyB ?? "Receiver";
  const totalAmountUsd = parseFloat(
    String(t?.total_usd ?? t?.amount_usd ?? amountLocked ?? "0"),
  );
  const totalSats = usdToSatsPreview(totalAmountUsd);
  const arbitrator = t?.arbitrator ?? "TBD";

  const milestones: MilestoneUI[] = v2?.milestones?.map((ms, i) => ({
    index: i,
    title: ms.title || `Milestone ${i + 1}`,
    percentage: ms.percentage,
    condition: ms.condition ?? "",
    deadline: ms.deadline ?? "",
    amountUsd: (((totalAmountUsd || 0) * ms.percentage) / 100).toFixed(2),
    amountSats: Math.round((totalSats * ms.percentage) / 100),
  })) ?? [
    {
      index: 0,
      title: "Full Payment",
      percentage: 100,
      condition: t?.condition ?? "Payer confirms work is complete.",
      deadline: t?.deadline ?? "",
      amountUsd: String(totalAmountUsd),
      amountSats: totalSats,
    },
  ];

  // ── Track which disputed milestones are showing submit form ──
  // Key: milestone index. True = showing the submit form.
  const [disputeFormOpen, setDisputeFormOpen] = useState<
    Record<number, boolean>
  >({});
  // Track which milestones Party A has already submitted a statement for
  const [disputeSubmitted, setDisputeSubmitted] = useState<
    Record<number, boolean>
  >({});

  // ── Save agreement to DB on mount (idempotent) ──────────────
  const [savedToDb, setSavedToDb] = useState(false);
  useEffect(() => {
    if (!agreementId || savedToDb || milestones.length === 0) return;
    setSavedToDb(true);
    dispatch(
      saveAgreementToDbThunk({
        agreementId,
        partyA: walletAddress ?? "",
        partyB: t?.receiver ?? t?.partyB ?? "",
        arbitrator: t?.arbitrator ?? "",
        totalAmountUsd,
        totalAmountSats: totalSats,
        terms: t ?? {},
        milestones: milestones.map((ms) => ({
          index: ms.index,
          title: ms.title,
          percentage: ms.percentage,
          condition: ms.condition,
          deadline: ms.deadline || undefined,
          amountUsd: ms.amountUsd,
          amountSats: ms.amountSats,
        })),
      }),
    );
  }, [agreementId]);

  // ── On-chain status sync ────────────────────────────────────
  const getStatus = useCallback(
    (index: number): MilestoneUIStatus => {
      const tx = txMilestone?.[index];
      if (tx?.status === "pending" || tx?.status === "confirming")
        return "pending";
      if (tx?.status === "failed") return "failed";
      const onChain = milestoneOnChainStatuses?.[index];
      if (onChain !== undefined) return onChainStatusToUI(onChain);
      return "locked";
    },
    [txMilestone, milestoneOnChainStatuses],
  );

  const [lastRefresh, setLastRefresh] = useState(0);

  useEffect(() => {
    if (!agreementId || milestones.length === 0) return;
    let cancelled = false;
    (async () => {
      const onChainMs = await getAllMilestones(agreementId, milestones.length);
      if (cancelled) return;
      onChainMs.forEach((ms) => {
        dispatch(
          setMilestoneOnChainStatus({ index: ms.index, status: ms.status }),
        );
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [agreementId, lastRefresh, milestones.length]);

  useEffect(() => {
    if (!txMilestone) return;
    Object.entries(txMilestone).forEach(([idxStr, tx]) => {
      if ((tx.status === "pending" || tx.status === "confirming") && tx.txId) {
        const idx = parseInt(idxStr);
        dispatch(
          pollMilestoneTxThunk({
            milestoneIndex: idx,
            txId: tx.txId,
            agreementId: agreementId ?? undefined,
            action: "complete",
            callerAddress: walletAddress ?? undefined,
            onConfirmed: () => setLastRefresh(Date.now()),
          }),
        );
      }
    });
  }, [txMilestone]);

  // ── Actions ─────────────────────────────────────────────────
  async function handleRelease(ms: MilestoneUI) {
    if (!agreementId || !walletAddress) return;
    const result = await dispatch(
      completeMilestoneThunk({
        agreementId,
        milestoneIndex: ms.index,
        milestoneAmountSats: BigInt(ms.amountSats),
      }),
    );
    if (completeMilestoneThunk.fulfilled.match(result)) {
      const { txId } = result.payload;
      dispatch(
        pollMilestoneTxThunk({
          milestoneIndex: ms.index,
          txId,
          agreementId,
          action: "complete",
          callerAddress: walletAddress,
          onConfirmed: () => setLastRefresh(Date.now()),
        }),
      );
    }
  }

  async function handleDispute(ms: MilestoneUI) {
    if (!agreementId) return;
    const result = await dispatch(
      disputeMilestoneThunk({ agreementId, milestoneIndex: ms.index }),
    );
    if (disputeMilestoneThunk.fulfilled.match(result)) {
      const { txId } = result.payload;
      dispatch(
        pollMilestoneTxThunk({
          milestoneIndex: ms.index,
          txId,
          agreementId,
          action: "dispute",
          callerAddress: walletAddress ?? undefined,
          onConfirmed: () => setLastRefresh(Date.now()),
        }),
      );
    }
  }

  async function handleTimeout(ms: MilestoneUI) {
    if (!agreementId) return;
    const result = await dispatch(
      triggerTimeoutThunk({
        agreementId,
        milestoneIndex: ms.index,
        milestoneAmountSats: BigInt(ms.amountSats),
      }),
    );
    if (triggerTimeoutThunk.fulfilled.match(result)) {
      const { txId } = result.payload;
      dispatch(
        pollMilestoneTxThunk({
          milestoneIndex: ms.index,
          txId,
          agreementId,
          action: "timeout",
          callerAddress: walletAddress ?? undefined,
          onConfirmed: () => setLastRefresh(Date.now()),
        }),
      );
    }
  }

  // ── Derived state ───────────────────────────────────────────
  const completedCount = milestones.filter((m) =>
    ["complete", "refunded"].includes(getStatus(m.index)),
  ).length;
  const progressPct =
    milestones.length > 0
      ? Math.round((completedCount / milestones.length) * 100)
      : 0;
  const allComplete = milestones.every((m) =>
    ["complete", "refunded"].includes(getStatus(m.index)),
  );

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="page" style={{ alignItems: "flex-start", paddingTop: 48 }}>
      <style>{css}</style>
      <div style={{ maxWidth: 680, width: "100%" }}>
        {/* Header */}
        <div className="fade-up" style={{ marginBottom: 32 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <div>
              <div className="mono-label">Agreement #{agreementId}</div>
              <h2 className="page-title">Dashboard</h2>
            </div>
            <div className="status-pill">
              <div className="status-dot" />
              sBTC Escrow Active
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="fade-up d1 summary-grid" style={{ marginBottom: 24 }}>
          {[
            {
              label: "Total Locked",
              value: formatSats(totalSats),
              sub: `≈ $${totalAmountUsd} USD`,
            },
            {
              label: "Payer",
              value: payerName,
              sub: walletAddress ? `${walletAddress.slice(0, 8)}…` : "You",
            },
            {
              label: "Receiver",
              value: receiverName,
              sub: "awaiting milestones",
            },
            {
              label: "Arbitrator",
              value:
                arbitrator.length > 14
                  ? `${arbitrator.slice(0, 12)}…`
                  : arbitrator,
              sub: "dispute resolver",
            },
          ].map(({ label, value, sub }) => (
            <div key={label} className="summary-card">
              <div className="summary-label">{label}</div>
              <div className="summary-value">{value}</div>
              <div className="summary-sub">{sub}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="fade-up d1" style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span className="mono-label">Overall Progress</span>
            <span className="mono-label">
              {completedCount}/{milestones.length} milestones · {progressPct}%
            </span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Milestone cards */}
        <div className="fade-up d2" style={{ marginBottom: 24 }}>
          <div className="mono-label" style={{ marginBottom: 12 }}>
            Milestones
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {milestones.map((ms) => {
              const status = getStatus(ms.index);
              const tx = txMilestone?.[ms.index];
              const isDone = status === "complete" || status === "refunded";
              const isPending = status === "pending";
              const isFailed = status === "failed";
              const isDisputed = status === "disputed";
              const showSubmitForm = isDisputed && disputeFormOpen[ms.index];
              const alreadySubmitted = disputeSubmitted[ms.index];

              return (
                <div key={ms.index}>
                  <div
                    className={`ms-card${isDone ? " ms-card--done" : ""}${isPending ? " ms-card--pending" : ""}${isDisputed ? " ms-card--disputed" : ""}`}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 4,
                          }}
                        >
                          <div className="ms-index">{ms.index + 1}</div>
                          <span className="ms-title">{ms.title}</span>
                        </div>
                        <div className="ms-condition">{ms.condition}</div>
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          flexShrink: 0,
                          marginLeft: 12,
                        }}
                      >
                        <div className="ms-amount">
                          {formatSats(ms.amountSats)}
                        </div>
                        <div className="ms-pct">
                          {ms.percentage}% · ≈ ${ms.amountUsd}
                        </div>
                      </div>
                    </div>

                    {ms.deadline && (
                      <div className="ms-deadline">
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        Deadline: {ms.deadline}
                      </div>
                    )}

                    {tx?.txId && (
                      <div
                        style={{
                          marginTop: 6,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span className="mono-label">TX:</span>
                        <a
                          href={explorerTxUrl(tx.txId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 10,
                            fontFamily: "var(--mono)",
                            color: "var(--text-3)",
                            textDecoration: "none",
                          }}
                        >
                          {tx.txId.slice(0, 14)}… ↗
                        </a>
                        {(tx.status === "pending" ||
                          tx.status === "confirming") && (
                          <span
                            className="spinner"
                            style={{ width: 10, height: 10 }}
                          />
                        )}
                      </div>
                    )}

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginTop: 12,
                      }}
                    >
                      <span
                        className="ms-status"
                        style={{ color: statusColor(status) }}
                      >
                        {statusLabel(status)}
                      </span>

                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          alignItems: "center",
                        }}
                      >
                        {isFailed && (
                          <button
                            className="action-btn action-btn--retry"
                            onClick={() =>
                              dispatch(
                                setMilestoneTxState({
                                  index: ms.index,
                                  tx: {
                                    status: "idle",
                                    txId: null,
                                    txUrl: null,
                                    error: null,
                                  },
                                }),
                              )
                            }
                          >
                            ↺ Retry
                          </button>
                        )}

                        {/* Disputed: show submit evidence button */}
                        {isDisputed && !alreadySubmitted && (
                          <button
                            className="action-btn action-btn--evidence"
                            onClick={() =>
                              setDisputeFormOpen((prev) => ({
                                ...prev,
                                [ms.index]: !prev[ms.index],
                              }))
                            }
                          >
                            {showSubmitForm
                              ? "✕ Hide Form"
                              : "📄 Submit Evidence"}
                          </button>
                        )}
                        {isDisputed && alreadySubmitted && (
                          <span className="submitted-badge">
                            ✓ Statement Submitted
                          </span>
                        )}

                        {!isDone && !isPending && !isFailed && !isDisputed && (
                          <>
                            <button
                              className="action-btn action-btn--complete"
                              onClick={() => handleRelease(ms)}
                            >
                              ✓ Release
                            </button>
                            <button
                              className="action-btn action-btn--dispute"
                              onClick={() => handleDispute(ms)}
                            >
                              ⚑ Dispute
                            </button>
                            {ms.deadline && (
                              <button
                                className="action-btn action-btn--timeout"
                                onClick={() => handleTimeout(ms)}
                                title="Trigger timeout refund if deadline has passed"
                              >
                                ⏱
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {tx?.error && (
                      <div
                        style={{
                          fontSize: 10,
                          color: "#ef4444",
                          fontFamily: "var(--mono)",
                          marginTop: 6,
                        }}
                      >
                        ⚠ {tx.error}
                      </div>
                    )}
                  </div>

                  {/* ── Dispute submit form (inline below card) ── */}
                  {showSubmitForm && agreementId && (
                    <div className="dispute-form-wrap fade-in">
                      <DisputeSubmitScreen
                        agreementId={agreementId}
                        milestoneIndex={ms.index}
                        party="A"
                        milestoneDescription={ms.condition || ms.title}
                        contractTerms={{
                          // ← ADD THIS
                          payer: walletAddress ?? t?.payer ?? "",
                          receiver: t?.receiver ?? t?.partyB ?? "",
                          arbitrator: t?.arbitrator ?? "TBD",
                          total_amount: totalAmountUsd,
                          milestone_description: ms.condition || ms.title,
                          milestone_percentage: ms.percentage,
                          milestone_deadline: ms.deadline || undefined,
                          agreement_type: t?.agreement_type ?? "freelance",
                        }}
                        onSubmitted={() => {
                          setDisputeSubmitted((prev) => ({
                            ...prev,
                            [ms.index]: true,
                          }));
                          setDisputeFormOpen((prev) => ({
                            ...prev,
                            [ms.index]: false,
                          }));
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Info strip */}
        <div className="fade-up d3 info-strip" style={{ marginBottom: 20 }}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-3)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, marginTop: 1 }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Click <strong style={{ color: "var(--text-2)" }}>Release</strong> to
            send sBTC to the receiver on-chain. If you dispute a milestone,
            submit your evidence so the arbitrator can review the case.
          </p>
        </div>

        {/* Footer actions */}
        <div className="fade-up d3" style={{ display: "flex", gap: 10 }}>
          {allComplete && (
            <button
              className="btn btn-primary"
              onClick={() => dispatch(setScreen("complete"))}
              style={{ flex: 1 }}
            >
              View Final Summary
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => {
              dispatch(resetAll());
              dispatch(setScreen("landing"));
            }}
          >
            New Agreement
          </button>
        </div>
      </div>
    </div>
  );
}

const css = `
.page-title { font-size: clamp(24px, 3.5vw, 36px); font-weight: 700; letter-spacing: -0.04em; line-height: 1.05; margin: 0; }
.mono-label { font-size: 10px; font-family: var(--mono); color: var(--text-4); text-transform: uppercase; letter-spacing: 0.1em; }
.status-pill { display: flex; align-items: center; gap: 7px; font-size: 11px; font-family: var(--mono); color: var(--green); background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: 20px; padding: 5px 12px; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: pulse 2s ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
@media (max-width: 640px) { .summary-grid { grid-template-columns: 1fr 1fr; } }
.summary-card { background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--r-sm); padding: 14px 16px; }
.summary-label { font-size: 9px; font-family: var(--mono); color: var(--text-4); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px; }
.summary-value { font-size: 13px; font-weight: 700; color: var(--text-1); letter-spacing: -0.02em; margin-bottom: 3px; word-break: break-all; }
.summary-sub { font-size: 10px; font-family: var(--mono); color: var(--text-4); }
.progress-track { height: 4px; background: var(--bg-3); border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--green); border-radius: 2px; transition: width 0.6s ease; min-width: 4px; }
.ms-card { background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--r); padding: 16px 18px; transition: all 0.3s; }
.ms-card--done { opacity: 0.6; }
.ms-card--pending { border-color: rgba(255,255,255,0.15); background: var(--bg-2); }
.ms-card--disputed { border-color: rgba(245,158,11,0.35); background: rgba(245,158,11,0.03); }
.ms-index { width: 20px; height: 20px; border-radius: 50%; background: var(--bg-3); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 9px; font-family: var(--mono); color: var(--text-3); font-weight: 700; flex-shrink: 0; }
.ms-title { font-size: 13px; font-weight: 600; color: var(--text-1); }
.ms-condition { font-size: 11px; color: var(--text-3); line-height: 1.6; max-width: 420px; }
.ms-amount { font-size: 14px; font-weight: 700; color: var(--text-1); font-family: var(--mono); }
.ms-pct { font-size: 10px; color: var(--text-4); font-family: var(--mono); }
.ms-deadline { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-family: var(--mono); color: var(--text-4); }
.ms-status { font-size: 11px; font-family: var(--mono); font-weight: 600; }
.action-btn { padding: 5px 12px; border-radius: var(--r-xs); font-size: 11px; font-family: var(--mono); cursor: pointer; border: 1px solid; transition: all var(--fast) var(--ease); display: flex; align-items: center; gap: 5px; }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.action-btn--complete { background: rgba(34,197,94,0.08); border-color: rgba(34,197,94,0.3); color: var(--green); }
.action-btn--complete:hover { background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.5); }
.action-btn--dispute { background: rgba(245,158,11,0.08); border-color: rgba(245,158,11,0.3); color: var(--amber); }
.action-btn--dispute:hover { background: rgba(245,158,11,0.15); border-color: rgba(245,158,11,0.5); }
.action-btn--timeout { background: var(--bg-3); border-color: var(--border); color: var(--text-3); padding: 5px 8px; }
.action-btn--retry { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.3); color: #ef4444; }
.action-btn--evidence { background: rgba(96,165,250,0.08); border-color: rgba(96,165,250,0.3); color: #60a5fa; }
.action-btn--evidence:hover { background: rgba(96,165,250,0.15); border-color: rgba(96,165,250,0.5); }
.submitted-badge { font-size: 10px; font-family: var(--mono); color: var(--green); background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: var(--r-xs); padding: 4px 10px; }
.dispute-form-wrap {
  border: 1px solid rgba(245,158,11,0.2);
  border-top: none;
  border-radius: 0 0 var(--r) var(--r);
  background: rgba(245,158,11,0.02);
  padding: 0;
  overflow: hidden;
}
.info-strip { display: flex; gap: 10px; align-items: flex-start; background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--r-sm); padding: 12px 14px; }
.spinner { display: inline-block; border: 2px solid var(--bg-3); border-top-color: var(--green); border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.fade-up { animation: fadeUp 0.4s ease both; }
.fade-in { animation: fadeIn 0.3s ease both; }
.d1 { animation-delay: 0.06s; }
.d2 { animation-delay: 0.12s; }
.d3 { animation-delay: 0.18s; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
`;
