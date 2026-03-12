"use client";
// ============================================================
// components/partyA/ScreenDashboard.tsx — 2026 redesign
// Uses ONLY class names from globals.css + dashboard-additions.css
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
import DisputeDetailView from "../Shared/Disputedetailview";

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
  if (s === "refunded" || s === "failed") return "var(--red)";
  if (s === "pending") return "var(--text-3)";
  return "var(--text-4)";
}
function statusLabel(s: MilestoneUIStatus) {
  if (s === "complete") return "Released";
  if (s === "disputed") return "In Dispute";
  if (s === "refunded") return "Refunded";
  if (s === "failed") return "Tx Failed";
  if (s === "pending") return "Confirming";
  return "Locked";
}

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

  const [disputeFormOpen, setDisputeFormOpen] = useState<
    Record<number, boolean>
  >({});
  const [disputeSubmitted, setDisputeSubmitted] = useState<
    Record<number, boolean>
  >({});
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
      onChainMs.forEach((ms) =>
        dispatch(
          setMilestoneOnChainStatus({ index: ms.index, status: ms.status }),
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [agreementId, lastRefresh, milestones.length]);

  useEffect(() => {
    if (!txMilestone) return;
    Object.entries(txMilestone).forEach(([idxStr, tx]) => {
      if ((tx.status === "pending" || tx.status === "confirming") && tx.txId) {
        dispatch(
          pollMilestoneTxThunk({
            milestoneIndex: parseInt(idxStr),
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
      dispatch(
        pollMilestoneTxThunk({
          milestoneIndex: ms.index,
          txId: result.payload.txId,
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
      dispatch(
        pollMilestoneTxThunk({
          milestoneIndex: ms.index,
          txId: result.payload.txId,
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
      dispatch(
        pollMilestoneTxThunk({
          milestoneIndex: ms.index,
          txId: result.payload.txId,
          agreementId,
          action: "timeout",
          callerAddress: walletAddress ?? undefined,
          onConfirmed: () => setLastRefresh(Date.now()),
        }),
      );
    }
  }

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

  const statsCards = [
    {
      label: "Total Locked",
      value: formatSats(totalSats),
      sub: `≈ $${totalAmountUsd} USD`,
      icon: "◈",
    },
    {
      label: "Payer",
      value: payerName,
      sub: walletAddress ? `${walletAddress.slice(0, 8)}…` : "You",
      icon: "◉",
    },
    {
      label: "Receiver",
      value: receiverName,
      sub: "awaiting milestones",
      icon: "◎",
    },
    {
      label: "Arbitrator",
      value:
        arbitrator.length > 14 ? `${arbitrator.slice(0, 12)}…` : arbitrator,
      sub: "dispute resolver",
      icon: "◈",
    },
  ];

  return (
    <div>
      {/* ── Topbar ── */}
      <div className="db-topbar">
        <div className="db-topbar-left">
          <a className="db-brand" href="/">
            <span className="db-brand-mark">◈</span>
            <span className="db-brand-name">ClauseAI</span>
          </a>
          <div className="db-topbar-sep" />
          <nav className="db-breadcrumb">
            <span>Agreement</span>
            <span className="db-breadcrumb-sep">/</span>
            <span>#{agreementId}</span>
            <span className="db-breadcrumb-sep">/</span>
            <span className="db-breadcrumb-cur">Party A</span>
          </nav>
        </div>
        <div className="db-topbar-right">
          <div className="db-live-badge">
            <span className="db-live-dot" />
            sBTC Escrow Active
          </div>
        </div>
      </div>

      {/* ── Shell ── */}
      <div className="db-shell">
        {/* ── Sidebar ── */}
        <aside className="db-sidebar">
          <div className="db-sidebar-section">
            <div className="db-sidebar-label">Navigation</div>
            <nav className="db-nav">
              <button className="db-nav-item db-nav-item--active">
                <span className="db-nav-icon">▣</span> Dashboard
              </button>
              {allComplete && (
                <button
                  className="db-nav-item"
                  onClick={() => dispatch(setScreen("complete"))}
                >
                  <span className="db-nav-icon">◈</span> Summary
                </button>
              )}
            </nav>
          </div>

          <div className="db-sidebar-section">
            <div className="db-sidebar-label">Agreement</div>
            <div className="db-meta-list">
              <div className="db-meta-row">
                <span className="db-meta-key">State</span>
                <span className="state-tag state-tag--active">Active</span>
              </div>
              <div className="db-meta-row">
                <span className="db-meta-key">Milestones</span>
                <span className="db-meta-val">
                  {completedCount}/{milestones.length}
                </span>
              </div>
              <div className="db-meta-row">
                <span className="db-meta-key">Progress</span>
                <span className="db-meta-val">{progressPct}%</span>
              </div>
              <div className="db-meta-row">
                <span className="db-meta-key">sBTC</span>
                <span className="db-meta-val">
                  {formatSats(totalSats).split(" ")[0]}
                </span>
              </div>
            </div>
          </div>

          <div className="db-ring-wrap">
            <svg width="72" height="72" viewBox="0 0 72 72">
              <circle
                cx="36"
                cy="36"
                r="28"
                fill="none"
                stroke="var(--bg-4)"
                strokeWidth="4"
              />
              <circle
                cx="36"
                cy="36"
                r="28"
                fill="none"
                stroke={progressPct === 100 ? "var(--green)" : "var(--text-1)"}
                strokeWidth="4"
                strokeDasharray={`${2 * Math.PI * 28}`}
                strokeDashoffset={`${2 * Math.PI * 28 * (1 - progressPct / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 36 36)"
                style={{
                  transition:
                    "stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1)",
                }}
              />
              <text
                x="36"
                y="40"
                textAnchor="middle"
                fill="var(--text-1)"
                fontSize="12"
                fontWeight="700"
                fontFamily="var(--mono)"
              >
                {progressPct}%
              </text>
            </svg>
            <div className="db-ring-label">Progress</div>
          </div>

          <div style={{ padding: "0 14px", marginTop: "auto" }}>
            <button
              className="btn btn-ghost"
              style={{ width: "100%", fontSize: 11, padding: "8px 12px" }}
              onClick={() => {
                dispatch(resetAll());
                dispatch(setScreen("landing"));
              }}
            >
              + New Agreement
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="db-main">
          <div className="db-page-header fade-up">
            <div>
              <div className="db-eyebrow">Payer Dashboard</div>
              <h1 className="db-page-title">Dashboard</h1>
            </div>
            {walletAddress && (
              <div className="db-wallet-chip">
                <span className="db-wallet-dot" />
                <span className="db-wallet-addr">
                  {walletAddress.slice(0, 10)}…{walletAddress.slice(-6)}
                </span>
              </div>
            )}
          </div>

          <div className="db-stats-grid fade-up d1">
            {statsCards.map(({ label, value, sub, icon }) => (
              <div key={label} className="db-stat-card">
                <div className="db-stat-icon">{icon}</div>
                <div className="db-stat-label">{label}</div>
                <div className="db-stat-value">{value}</div>
                <div className="db-stat-sub">{sub}</div>
              </div>
            ))}
          </div>

          <div className="db-progress-wrap fade-up d2">
            <div className="db-progress-header">
              <span className="label">Overall Progress</span>
              <span className="label">
                {completedCount}/{milestones.length} milestones · {progressPct}%
              </span>
            </div>
            <div className="db-progress-track">
              <div
                className="db-progress-fill"
                style={{
                  width: `${progressPct > 0 ? progressPct : 0.5}%`,
                  background:
                    progressPct === 100 ? "var(--green)" : "var(--text-1)",
                }}
              />
            </div>
          </div>

          <div className="fade-up d3">
            <div className="db-section-head">
              <span className="label">Milestones</span>
              <span className="db-section-count">
                {milestones.length} total
              </span>
            </div>
            <div className="db-ms-list">
              {milestones.map((ms) => {
                const status = getStatus(ms.index);
                const tx = txMilestone?.[ms.index];
                const isDone = status === "complete" || status === "refunded";
                const isPending = status === "pending";
                const isFailed = status === "failed";
                const isDisputed = status === "disputed";
                const showSubmit = isDisputed && disputeFormOpen[ms.index];
                const alreadySub = disputeSubmitted[ms.index];

                return (
                  <div key={ms.index} className="db-ms-block">
                    <div
                      className={[
                        "db-ms-row",
                        isDone ? "db-ms-row--done" : "",
                        isPending ? "db-ms-row--pending" : "",
                        isDisputed ? "db-ms-row--disputed" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div
                        className={[
                          "db-ms-num",
                          isDone ? "db-ms-num--done" : "",
                          isDisputed ? "db-ms-num--disputed" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {isDone ? "✓" : ms.index + 1}
                      </div>

                      <div className="db-ms-info">
                        <div className="db-ms-title-row">
                          <span className="db-ms-title">{ms.title}</span>
                          {isDisputed && (
                            <span className="db-dispute-chip">⚑ Dispute</span>
                          )}
                        </div>
                        {ms.condition && (
                          <div className="db-ms-condition">{ms.condition}</div>
                        )}
                        {ms.deadline && (
                          <div className="db-ms-deadline">⏱ {ms.deadline}</div>
                        )}
                        {tx?.txId && (
                          <div className="db-ms-tx">
                            <span className="db-ms-tx-label">TX</span>
                            <a
                              href={explorerTxUrl(tx.txId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="db-ms-tx-link"
                            >
                              {tx.txId.slice(0, 12)}… ↗
                            </a>
                            {(tx.status === "pending" ||
                              tx.status === "confirming") && (
                              <span
                                className="spinner"
                                style={{ width: 8, height: 8 }}
                              />
                            )}
                          </div>
                        )}
                        {tx?.error && (
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--red)",
                              fontFamily: "var(--mono)",
                              marginTop: 4,
                            }}
                          >
                            ⚠ {tx.error}
                          </div>
                        )}
                      </div>

                      <div className="db-ms-right">
                        <div>
                          <div
                            className={`db-ms-amount${isDone ? " db-ms-amount--done" : ""}`}
                          >
                            {formatSats(ms.amountSats)}
                          </div>
                          <div className="db-ms-pct">
                            {ms.percentage}% · ≈ ${ms.amountUsd}
                          </div>
                        </div>
                        <div className="db-ms-actions">
                          <span
                            className="ms-status-pill"
                            style={{
                              color: statusColor(status),
                              background: statusColor(status) + "10",
                              borderColor: statusColor(status) + "28",
                            }}
                          >
                            {statusLabel(status)}
                          </span>
                          {isFailed && (
                            <button
                              className="db-btn db-btn--retry"
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
                          {isDisputed && !alreadySub && (
                            <button
                              className="db-btn db-btn--evidence"
                              onClick={() =>
                                setDisputeFormOpen((p) => ({
                                  ...p,
                                  [ms.index]: !p[ms.index],
                                }))
                              }
                            >
                              {showSubmit ? "✕ Hide" : "📄 Evidence"}
                            </button>
                          )}
                          {isDisputed && alreadySub && (
                            <span className="db-submitted-badge">✓ Filed</span>
                          )}
                          {!isDone &&
                            !isPending &&
                            !isFailed &&
                            !isDisputed && (
                              <>
                                <button
                                  className="db-btn db-btn--release"
                                  onClick={() => handleRelease(ms)}
                                >
                                  ✓ Release
                                </button>
                                <button
                                  className="db-btn db-btn--dispute"
                                  onClick={() => handleDispute(ms)}
                                >
                                  ⚑ Dispute
                                </button>
                                {ms.deadline && (
                                  <button
                                    className="db-btn db-btn--timeout"
                                    onClick={() => handleTimeout(ms)}
                                    title="Trigger timeout refund"
                                  >
                                    ⏱
                                  </button>
                                )}
                              </>
                            )}
                        </div>
                      </div>
                    </div>

                    {isDisputed && agreementId && (
                      <div className="db-dispute-panel">
                        <DisputeDetailView
                          agreementId={agreementId}
                          milestoneIndex={ms.index}
                          viewerRole="A"
                        />
                      </div>
                    )}

                    {showSubmit && agreementId && (
                      <div className="db-submit-panel">
                        <DisputeSubmitScreen
                          agreementId={agreementId}
                          milestoneIndex={ms.index}
                          party="A"
                          milestoneDescription={ms.condition || ms.title}
                          contractTerms={{
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
                            setDisputeSubmitted((p) => ({
                              ...p,
                              [ms.index]: true,
                            }));
                            setDisputeFormOpen((p) => ({
                              ...p,
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

          <div className="db-info-strip fade-up">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-4)"
              strokeWidth="1.5"
              style={{ flexShrink: 0, marginTop: 2 }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="db-info-text">
              Click{" "}
              <strong style={{ color: "var(--text-2)", fontWeight: 500 }}>
                Release
              </strong>{" "}
              to send sBTC on-chain. Use{" "}
              <strong style={{ color: "var(--text-2)", fontWeight: 500 }}>
                Dispute
              </strong>{" "}
              to open arbitration if work is unsatisfactory.
            </p>
          </div>

          {allComplete && (
            <div className="fade-up" style={{ display: "flex", gap: 10 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => dispatch(setScreen("complete"))}
              >
                View Final Summary
              </button>
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
          )}
        </main>
      </div>
    </div>
  );
}
