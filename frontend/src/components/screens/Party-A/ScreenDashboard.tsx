"use client";
// ============================================================
// components/partyA/ScreenDashboard.tsx — 2026 redesign v2
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

function statusMeta(s: MilestoneUIStatus) {
  switch (s) {
    case "complete":
      return {
        label: "Released",
        color: "#4ade80",
        bg: "rgba(74,222,128,0.10)",
        border: "rgba(74,222,128,0.22)",
      };
    case "disputed":
      return {
        label: "In Dispute",
        color: "#fbbf24",
        bg: "rgba(251,191,36,0.10)",
        border: "rgba(251,191,36,0.22)",
      };
    case "refunded":
      return {
        label: "Refunded",
        color: "#f87171",
        bg: "rgba(248,113,113,0.10)",
        border: "rgba(248,113,113,0.22)",
      };
    case "failed":
      return {
        label: "Tx Failed",
        color: "#f87171",
        bg: "rgba(248,113,113,0.10)",
        border: "rgba(248,113,113,0.22)",
      };
    case "pending":
      return {
        label: "Confirming",
        color: "rgba(240,242,245,0.55)",
        bg: "rgba(240,242,245,0.06)",
        border: "rgba(240,242,245,0.12)",
      };
    default:
      return {
        label: "Locked",
        color: "rgba(240,242,245,0.32)",
        bg: "rgba(240,242,245,0.04)",
        border: "rgba(240,242,245,0.10)",
      };
  }
}

const MS_COLORS = [
  "#c4ff46",
  "#60a5fa",
  "#4ade80",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
];

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
  const [lastRefresh, setLastRefresh] = useState(0);

  // Dispute modal state
  const [disputeModal, setDisputeModal] = useState<{
    open: boolean;
    ms: MilestoneUI | null;
    step: "confirm" | "submit"; // step 1: confirm on-chain tx, step 2: submit statement
  }>({ open: false, ms: null, step: "confirm" });

  function openDisputeModal(ms: MilestoneUI) {
    setDisputeModal({ open: true, ms, step: "confirm" });
  }
  function closeDisputeModal() {
    setDisputeModal({ open: false, ms: null, step: "confirm" });
  }

  async function handleDisputeConfirm(ms: MilestoneUI) {
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
          onConfirmed: () => {
            setLastRefresh(Date.now());
            // Advance to submit step inside modal
            setDisputeModal((prev) => ({ ...prev, step: "submit" }));
          },
        }),
      );
      // Move to submit step immediately (tx is submitted, waiting to confirm)
      setDisputeModal((prev) => ({ ...prev, step: "submit" }));
    }
  }

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
  const releasedUsd = milestones
    .filter((m) => getStatus(m.index) === "complete")
    .reduce((s, m) => s + parseFloat(m.amountUsd), 0);

  return (
    <div>
      <style>{css}</style>

      {/* ── Topbar ── */}
      <header className="v2-topbar">
        <div className="v2-topbar-left">
          <a className="v2-brand" href="/">
            <span className="v2-brand-mark">◈</span>
            <span className="v2-brand-name">ClauseAI</span>
          </a>
          <div className="v2-topbar-sep" />
          <nav className="v2-breadcrumb">
            <span className="v2-bc-dim">Agreement</span>
            <span className="v2-bc-arrow">›</span>
            <span className="v2-bc-dim">#{agreementId}</span>
            <span className="v2-bc-arrow">›</span>
            <span className="v2-bc-cur">Party A</span>
          </nav>
        </div>
        <div className="v2-topbar-right">
          {walletAddress && (
            <div className="v2-wallet-pill">
              <span className="v2-wallet-dot" />
              <span className="v2-wallet-addr">
                {walletAddress.slice(0, 10)}…{walletAddress.slice(-6)}
              </span>
            </div>
          )}
          <div className="v2-live-badge">
            <span className="v2-live-dot" />
            sBTC Live
          </div>
        </div>
      </header>

      {/* ── Shell ── */}
      <div className="v2-shell">
        {/* ── Sidebar ── */}
        <aside className="v2-sidebar">
          {/* Nav */}
          <div className="v2-sidebar-block">
            <div className="v2-sidebar-label">Navigation</div>
            <nav className="v2-nav">
              <button className="v2-nav-item v2-nav-item--active">
                <span className="v2-nav-icon">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </span>
                Dashboard
              </button>
              {allComplete && (
                <button
                  className="v2-nav-item"
                  onClick={() => dispatch(setScreen("complete"))}
                >
                  <span className="v2-nav-icon">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    >
                      <polyline points="9 11 12 14 22 4" />
                      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                    </svg>
                  </span>
                  Summary
                </button>
              )}
            </nav>
          </div>

          {/* Progress ring */}
          <div className="v2-ring-block">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle
                cx="40"
                cy="40"
                r="32"
                fill="none"
                stroke="rgba(240,242,245,0.06)"
                strokeWidth="5"
              />
              <circle
                cx="40"
                cy="40"
                r="32"
                fill="none"
                stroke={progressPct === 100 ? "#4ade80" : "#c4ff46"}
                strokeWidth="5"
                strokeDasharray={`${2 * Math.PI * 32}`}
                strokeDashoffset={`${2 * Math.PI * 32 * (1 - progressPct / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
                style={{
                  transition:
                    "stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1), stroke 0.4s ease",
                }}
              />
              <text
                x="40"
                y="44"
                textAnchor="middle"
                fill={progressPct === 100 ? "#4ade80" : "#f0f2f5"}
                fontSize="13"
                fontWeight="800"
                fontFamily="'DM Mono', monospace"
                style={{ letterSpacing: "-0.02em" }}
              >
                {progressPct}%
              </text>
            </svg>
            <div className="v2-ring-label">
              {completedCount}/{milestones.length} milestones
            </div>
          </div>

          {/* Agreement meta */}
          <div className="v2-sidebar-block">
            <div className="v2-sidebar-label">Agreement</div>
            <div className="v2-meta-list">
              {[
                {
                  k: "Status",
                  v: (
                    <span
                      className={`v2-state-tag ${allComplete ? "v2-state-tag--complete" : "v2-state-tag--active"}`}
                    >
                      {allComplete ? "Complete" : "Active"}
                    </span>
                  ),
                },
                { k: "Released", v: `$${releasedUsd.toFixed(0)}` },
                {
                  k: "Remaining",
                  v: `$${(totalAmountUsd - releasedUsd).toFixed(0)}`,
                },
                { k: "sBTC Total", v: formatSats(totalSats).split(" ")[0] },
              ].map(({ k, v }) => (
                <div key={k} className="v2-meta-row">
                  <span className="v2-meta-key">{k}</span>
                  <span className="v2-meta-val">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Milestone mini-list */}
          {milestones.length > 1 && (
            <div className="v2-sidebar-block">
              <div className="v2-sidebar-label">Milestones</div>
              <div className="v2-ms-mini-list">
                {milestones.map((ms, i) => {
                  const st = getStatus(ms.index);
                  const col = MS_COLORS[i % MS_COLORS.length];
                  return (
                    <div key={i} className="v2-ms-mini">
                      <div
                        className="v2-ms-mini-dot"
                        style={{
                          background: col + "20",
                          border: `1px solid ${col}45`,
                          color: col,
                        }}
                      >
                        {st === "complete" ? "✓" : i + 1}
                      </div>
                      <div className="v2-ms-mini-body">
                        <div className="v2-ms-mini-title">{ms.title}</div>
                        <div className="v2-ms-mini-track">
                          <div
                            className="v2-ms-mini-fill"
                            style={{
                              width: `${ms.percentage}%`,
                              background: col,
                            }}
                          />
                        </div>
                      </div>
                      <div className="v2-ms-mini-pct">{ms.percentage}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottom CTA */}
          <div className="v2-sidebar-footer">
            <button
              className="v2-btn-ghost-sm"
              onClick={() => {
                dispatch(resetAll());
                dispatch(setScreen("landing"));
              }}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Agreement
            </button>
          </div>
        </aside>

        {/* ── Main canvas ── */}
        <main className="v2-main">
          {/* Page header */}
          <div className="v2-page-header v2-fade-up">
            <div className="v2-page-header-left">
              <div className="v2-eyebrow">Payer Dashboard</div>
              <h1 className="v2-page-title">Manage Agreement</h1>
            </div>
            <div className="v2-page-header-right">
              <div className="v2-agreement-id-chip">
                <span className="v2-agreement-id-label">ID</span>
                <span className="v2-agreement-id-val">#{agreementId}</span>
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="v2-stats-grid v2-fade-up v2-d1">
            {[
              {
                label: "Total Locked",
                value: formatSats(totalSats),
                sub: `≈ $${totalAmountUsd.toLocaleString()} USD`,
                icon: "◈",
                accent: "#c4ff46",
              },
              {
                label: "Payer",
                value: payerName,
                sub: walletAddress ? `${walletAddress.slice(0, 8)}…` : "You",
                icon: "◉",
                accent: "#60a5fa",
              },
              {
                label: "Receiver",
                value: receiverName,
                sub: "awaiting milestones",
                icon: "◎",
                accent: "#4ade80",
              },
              {
                label: "Arbitrator",
                value:
                  arbitrator.length > 14
                    ? `${arbitrator.slice(0, 12)}…`
                    : arbitrator,
                sub: "dispute resolver",
                icon: "⚖",
                accent: "#fbbf24",
              },
            ].map(({ label, value, sub, icon, accent }) => (
              <div key={label} className="v2-stat-card">
                <div
                  className="v2-stat-icon-wrap"
                  style={{
                    background: accent + "12",
                    border: `1px solid ${accent}28`,
                    color: accent,
                  }}
                >
                  {icon}
                </div>
                <div className="v2-stat-label">{label}</div>
                <div className="v2-stat-value">{value}</div>
                <div className="v2-stat-sub">{sub}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="v2-progress-card v2-fade-up v2-d2">
            <div className="v2-progress-top">
              <div className="v2-progress-title">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                Contract Progress
              </div>
              <div className="v2-progress-stat">
                <span
                  className="v2-progress-pct"
                  style={{ color: progressPct === 100 ? "#4ade80" : "#c4ff46" }}
                >
                  {progressPct}%
                </span>
                <span className="v2-progress-frac">
                  {completedCount}/{milestones.length}
                </span>
              </div>
            </div>
            <div className="v2-progress-track">
              <div
                className="v2-progress-fill"
                style={{
                  width: `${progressPct > 0 ? progressPct : 0.5}%`,
                  background:
                    progressPct === 100
                      ? "linear-gradient(90deg, #4ade80, #22c55e)"
                      : "linear-gradient(90deg, #c4ff46, #a3e635)",
                }}
              />
            </div>
            <div className="v2-progress-segments">
              {milestones.map((ms, i) => {
                const st = getStatus(ms.index);
                const done = ["complete", "refunded"].includes(st);
                return (
                  <div
                    key={i}
                    className="v2-progress-seg"
                    title={`${ms.title} — ${ms.percentage}%`}
                    style={{ flex: ms.percentage }}
                  >
                    <div
                      className="v2-progress-seg-dot"
                      style={{
                        background: done
                          ? "#4ade80"
                          : MS_COLORS[i % MS_COLORS.length] + "40",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Milestones section */}
          <div className="v2-fade-up v2-d3">
            <div className="v2-section-head">
              <div className="v2-section-title">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--text-4)"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
                Milestones
              </div>
              <span className="v2-section-count">
                {milestones.length} total
              </span>
            </div>

            <div className="v2-ms-list">
              {milestones.map((ms) => {
                const status = getStatus(ms.index);
                const meta = statusMeta(status);
                const tx = txMilestone?.[ms.index];
                const isDone = status === "complete" || status === "refunded";
                const isPending = status === "pending";
                const isFailed = status === "failed";
                const isDisputed = status === "disputed";
                const showSubmit = isDisputed && disputeFormOpen[ms.index];
                const alreadySub = disputeSubmitted[ms.index];
                const accent = MS_COLORS[ms.index % MS_COLORS.length];

                return (
                  <div
                    key={ms.index}
                    className={[
                      "v2-ms-block",
                      isDone ? "v2-ms-block--done" : "",
                      isDisputed ? "v2-ms-block--disputed" : "",
                      isPending ? "v2-ms-block--pending" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div className="v2-ms-row">
                      {/* Left accent bar */}
                      <div
                        className="v2-ms-accent-bar"
                        style={{
                          background: isDone
                            ? "#4ade8060"
                            : isDisputed
                              ? "#fbbf2460"
                              : accent + "60",
                        }}
                      />

                      {/* Number badge */}
                      <div
                        className="v2-ms-num"
                        style={{
                          background: isDone
                            ? "rgba(74,222,128,0.12)"
                            : isDisputed
                              ? "rgba(251,191,36,0.12)"
                              : accent + "12",
                          borderColor: isDone
                            ? "rgba(74,222,128,0.28)"
                            : isDisputed
                              ? "rgba(251,191,36,0.28)"
                              : accent + "35",
                          color: isDone
                            ? "#4ade80"
                            : isDisputed
                              ? "#fbbf24"
                              : accent,
                        }}
                      >
                        {isDone ? (
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          ms.index + 1
                        )}
                      </div>

                      {/* Info */}
                      <div className="v2-ms-info">
                        <div className="v2-ms-title-row">
                          <span className="v2-ms-title">{ms.title}</span>
                          {isDisputed && (
                            <span className="v2-chip v2-chip--dispute">
                              ⚑ Dispute
                            </span>
                          )}
                          {isPending && (
                            <span className="v2-chip v2-chip--pending">
                              <span className="v2-spinner-xs" />
                              Confirming
                            </span>
                          )}
                          {isFailed && (
                            <span className="v2-chip v2-chip--failed">
                              ⚠ Failed
                            </span>
                          )}
                        </div>
                        {ms.condition && (
                          <p className="v2-ms-condition">{ms.condition}</p>
                        )}
                        <div className="v2-ms-meta-row">
                          {ms.deadline && (
                            <span className="v2-ms-deadline">
                              <svg
                                width="9"
                                height="9"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                              {ms.deadline}
                            </span>
                          )}
                          {tx?.txId && (
                            <a
                              href={explorerTxUrl(tx.txId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="v2-tx-link"
                            >
                              <svg
                                width="9"
                                height="9"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                              >
                                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                              </svg>
                              {tx.txId.slice(0, 12)}… ↗
                            </a>
                          )}
                          {tx?.error && (
                            <span className="v2-tx-error">⚠ {tx.error}</span>
                          )}
                        </div>
                      </div>

                      {/* Right: amount + actions */}
                      <div className="v2-ms-right">
                        <div className="v2-ms-amount-block">
                          <div
                            className="v2-ms-amount"
                            style={{
                              color: isDone ? "#4ade80" : "var(--text-1)",
                            }}
                          >
                            {formatSats(ms.amountSats)}
                          </div>
                          <div className="v2-ms-amount-sub">
                            {ms.percentage}% · ≈ ${ms.amountUsd}
                          </div>
                        </div>

                        <div className="v2-ms-actions">
                          {/* Status pill */}
                          <span
                            className="v2-status-pill"
                            style={{
                              color: meta.color,
                              background: meta.bg,
                              borderColor: meta.border,
                            }}
                          >
                            {status === "pending" && (
                              <span className="v2-spinner-dot" />
                            )}
                            {meta.label}
                          </span>

                          {/* Buttons */}
                          {isFailed && (
                            <button
                              className="v2-btn v2-btn--retry"
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
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                              >
                                <polyline points="23 4 23 10 17 10" />
                                <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                              </svg>
                              Retry
                            </button>
                          )}

                          {isDisputed && !alreadySub && (
                            <button
                              className="v2-btn v2-btn--evidence"
                              onClick={() =>
                                setDisputeFormOpen((p) => ({
                                  ...p,
                                  [ms.index]: !p[ms.index],
                                }))
                              }
                            >
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                              >
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                              {showSubmit ? "Hide" : "Evidence"}
                            </button>
                          )}

                          {isDisputed && alreadySub && (
                            <span className="v2-filed-badge">
                              <svg
                                width="9"
                                height="9"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Filed
                            </span>
                          )}

                          {!isDone &&
                            !isPending &&
                            !isFailed &&
                            !isDisputed && (
                              <>
                                <button
                                  className="v2-btn v2-btn--release"
                                  onClick={() => handleRelease(ms)}
                                >
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  Release
                                </button>
                                <button
                                  className="v2-btn v2-btn--dispute"
                                  onClick={() => openDisputeModal(ms)}
                                >
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  >
                                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                  </svg>
                                  Dispute
                                </button>
                                {ms.deadline && (
                                  <button
                                    className="v2-btn v2-btn--timeout"
                                    onClick={() => handleTimeout(ms)}
                                    title="Trigger timeout refund"
                                  >
                                    <svg
                                      width="10"
                                      height="10"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                      strokeLinecap="round"
                                    >
                                      <circle cx="12" cy="12" r="10" />
                                      <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                  </button>
                                )}
                              </>
                            )}
                        </div>
                      </div>
                    </div>

                    {/* Dispute detail */}
                    {isDisputed && agreementId && (
                      <div className="v2-dispute-panel">
                        <DisputeDetailView
                          agreementId={agreementId}
                          milestoneIndex={ms.index}
                          viewerRole="A"
                        />
                      </div>
                    )}

                    {/* Evidence submit */}
                    {showSubmit && agreementId && (
                      <div className="v2-submit-panel">
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

          {/* Help strip */}
          <div className="v2-info-strip v2-fade-up v2-d4">
            <div className="v2-info-icon">
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="v2-info-text">
              Click <strong>Release</strong> to send sBTC on-chain once work is
              approved. Use <strong>Dispute</strong> to open arbitration if
              deliverables are unsatisfactory. The <strong>⏱</strong> button
              triggers a timeout refund if a deadline has passed.
            </p>
          </div>

          {/* Complete banner */}
          {allComplete && (
            <div className="v2-complete-banner v2-fade-up">
              <div className="v2-complete-icon">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#4ade80"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="v2-complete-title">Agreement Complete</div>
              <p className="v2-complete-body">
                All milestones have been settled on-chain.
              </p>
              <div className="v2-complete-actions">
                <button
                  className="v2-btn-primary"
                  onClick={() => dispatch(setScreen("complete"))}
                >
                  View Summary
                </button>
                <button
                  className="v2-btn-secondary"
                  onClick={() => {
                    dispatch(resetAll());
                    dispatch(setScreen("landing"));
                  }}
                >
                  New Agreement
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Dispute Modal ── */}
      {disputeModal.open && disputeModal.ms && (
        <div
          className="v2-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDisputeModal();
          }}
        >
          <div className="v2-modal">
            {/* Modal header */}
            <div className="v2-modal-header">
              <div className="v2-modal-header-left">
                <div className="v2-modal-icon">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <div>
                  <div className="v2-modal-title">Open Dispute</div>
                  <div className="v2-modal-subtitle">
                    {disputeModal.ms.title}
                  </div>
                </div>
              </div>
              <button className="v2-modal-close" onClick={closeDisputeModal}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Step indicator */}
            <div className="v2-modal-steps">
              <div
                className={`v2-modal-step ${disputeModal.step === "confirm" ? "v2-modal-step--active" : "v2-modal-step--done"}`}
              >
                <div className="v2-modal-step-dot">
                  {disputeModal.step === "submit" ? (
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    "1"
                  )}
                </div>
                <span>Confirm On-chain</span>
              </div>
              <div
                className="v2-modal-step-line"
                style={{
                  background:
                    disputeModal.step === "submit"
                      ? "#c4ff46"
                      : "rgba(240,242,245,0.08)",
                }}
              />
              <div
                className={`v2-modal-step ${disputeModal.step === "submit" ? "v2-modal-step--active" : "v2-modal-step--idle"}`}
              >
                <div className="v2-modal-step-dot">2</div>
                <span>Submit Statement</span>
              </div>
            </div>

            {/* Step 1 — Confirm dispute */}
            {disputeModal.step === "confirm" && (
              <div className="v2-modal-body">
                <div className="v2-modal-warn-banner">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p>
                    This will flag the milestone on-chain and lock funds until
                    the dispute is resolved by the arbitrator.
                  </p>
                </div>

                <div className="v2-modal-detail-grid">
                  <div className="v2-modal-detail">
                    <span className="v2-modal-detail-label">Milestone</span>
                    <span className="v2-modal-detail-val">
                      {disputeModal.ms.title}
                    </span>
                  </div>
                  <div className="v2-modal-detail">
                    <span className="v2-modal-detail-label">
                      Amount at Stake
                    </span>
                    <span
                      className="v2-modal-detail-val"
                      style={{ color: "#fbbf24" }}
                    >
                      {formatSats(disputeModal.ms.amountSats)}{" "}
                      <span style={{ opacity: 0.5, fontSize: 10 }}>
                        ≈ ${disputeModal.ms.amountUsd}
                      </span>
                    </span>
                  </div>
                  <div className="v2-modal-detail">
                    <span className="v2-modal-detail-label">Arbitrator</span>
                    <span className="v2-modal-detail-val">
                      {arbitrator.length > 18
                        ? `${arbitrator.slice(0, 16)}…`
                        : arbitrator}
                    </span>
                  </div>
                  {disputeModal.ms.condition && (
                    <div className="v2-modal-detail v2-modal-detail--full">
                      <span className="v2-modal-detail-label">Condition</span>
                      <span
                        className="v2-modal-detail-val"
                        style={{
                          color: "rgba(240,242,245,0.50)",
                          fontSize: 12,
                        }}
                      >
                        {disputeModal.ms.condition}
                      </span>
                    </div>
                  )}
                </div>

                <div className="v2-modal-footer">
                  <button
                    className="v2-btn-secondary"
                    onClick={closeDisputeModal}
                  >
                    Cancel
                  </button>
                  <button
                    className="v2-btn-dispute-confirm"
                    onClick={() => handleDisputeConfirm(disputeModal.ms!)}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    Confirm Dispute On-chain
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 — Submit statement */}
            {disputeModal.step === "submit" && agreementId && (
              <div className="v2-modal-body v2-modal-body--scroll">
                <div className="v2-modal-tx-notice">
                  <span className="v2-spinner-sm" />
                  <span>
                    On-chain dispute transaction submitted. You can now file
                    your statement below.
                  </span>
                </div>
                <DisputeSubmitScreen
                  agreementId={agreementId}
                  milestoneIndex={disputeModal.ms.index}
                  party="A"
                  milestoneDescription={
                    disputeModal.ms.condition || disputeModal.ms.title
                  }
                  contractTerms={{
                    payer: walletAddress ?? t?.payer ?? "",
                    receiver: t?.receiver ?? t?.partyB ?? "",
                    arbitrator: t?.arbitrator ?? "TBD",
                    total_amount: totalAmountUsd,
                    milestone_description:
                      disputeModal.ms.condition || disputeModal.ms.title,
                    milestone_percentage: disputeModal.ms.percentage,
                    milestone_deadline: disputeModal.ms.deadline || undefined,
                    agreement_type: t?.agreement_type ?? "freelance",
                  }}
                  onSubmitted={() => {
                    setDisputeSubmitted((p) => ({
                      ...p,
                      [disputeModal.ms!.index]: true,
                    }));
                    closeDisputeModal();
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   COMPONENT CSS — 2026 Redesign v2
   ════════════════════════════════════════════════════════════ */
const css = `

/* ── Topbar ── */
.v2-topbar {
  position: sticky; top: 0; z-index: 100;
  height: 54px;
  background: rgba(11,12,13,0.90);
  backdrop-filter: blur(24px) saturate(1.8);
  border-bottom: 1px solid rgba(240,242,245,0.07);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px; gap: 12px;
}
.v2-topbar-left  { display: flex; align-items: center; gap: 0; }
.v2-topbar-right { display: flex; align-items: center; gap: 10px; }
.v2-topbar-sep   { width: 1px; height: 16px; background: rgba(240,242,245,0.10); margin: 0 18px; }

.v2-brand { display: flex; align-items: center; gap: 8px; text-decoration: none; }
.v2-brand-mark {
  width: 28px; height: 28px; border-radius: 7px;
  background: #c4ff46; display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 800; color: #0b0c0d;
  font-family: 'Syne', sans-serif; flex-shrink: 0;
  box-shadow: 0 2px 10px rgba(196,255,70,0.28);
}
.v2-brand-name {
  font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 800;
  color: #f0f2f5; letter-spacing: -0.03em;
}

.v2-breadcrumb { display: flex; align-items: center; gap: 0; }
.v2-bc-dim   { font-size: 11px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.30); }
.v2-bc-arrow { font-size: 11px; color: rgba(240,242,245,0.18); margin: 0 6px; }
.v2-bc-cur   { font-size: 11px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.65); font-weight: 600; }

.v2-wallet-pill {
  display: flex; align-items: center; gap: 7px;
  background: rgba(196,255,70,0.06); border: 1px solid rgba(196,255,70,0.15);
  border-radius: 20px; padding: 5px 12px;
}
.v2-wallet-dot {
  width: 5px; height: 5px; border-radius: 50%; background: #c4ff46; flex-shrink: 0;
  animation: v2PulseDot 2s ease infinite;
}
.v2-wallet-addr { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.55); }

.v2-live-badge {
  display: flex; align-items: center; gap: 6px;
  font-size: 10px; font-family: 'DM Mono', monospace; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase; color: #c4ff46;
  background: rgba(196,255,70,0.08); border: 1px solid rgba(196,255,70,0.18);
  border-radius: 20px; padding: 4px 11px;
}
.v2-live-dot {
  width: 5px; height: 5px; border-radius: 50%; background: #c4ff46;
  animation: v2PulseDot 2s ease infinite;
}

/* ── Shell ── */
.v2-shell {
  display: flex; min-height: calc(100vh - 54px); background: #0b0c0d;
}

/* ── Sidebar ── */
.v2-sidebar {
  width: 224px; flex-shrink: 0;
  background: #0e0f10;
  border-right: 1px solid rgba(240,242,245,0.07);
  display: flex; flex-direction: column;
  position: sticky; top: 54px;
  height: calc(100vh - 54px);
  overflow-y: auto; padding: 20px 0 24px;
}
.v2-sidebar-block {
  padding: 0 12px 20px; margin-bottom: 4px;
  border-bottom: 1px solid rgba(240,242,245,0.05);
}
.v2-sidebar-block:last-of-type { border-bottom: none; }
.v2-sidebar-label {
  font-size: 9px; font-family: 'DM Mono', monospace;
  color: rgba(240,242,245,0.28); text-transform: uppercase;
  letter-spacing: 0.14em; padding: 0 4px; margin-bottom: 10px;
}

/* Nav */
.v2-nav { display: flex; flex-direction: column; gap: 2px; }
.v2-nav-item {
  display: flex; align-items: center; gap: 9px;
  width: 100%; padding: 8px 10px; border-radius: 8px;
  font-size: 12px; font-weight: 500; color: rgba(240,242,245,0.40);
  background: none; border: 1px solid transparent;
  cursor: pointer; text-align: left; letter-spacing: -0.01em;
  transition: all 0.15s cubic-bezier(0.16,1,0.3,1);
  font-family: 'DM Sans', sans-serif;
}
.v2-nav-item:hover { color: #f0f2f5; background: rgba(240,242,245,0.05); }
.v2-nav-item--active {
  color: #f0f2f5; background: rgba(196,255,70,0.06);
  border-color: rgba(196,255,70,0.15);
}
.v2-nav-icon {
  color: rgba(240,242,245,0.28); flex-shrink: 0; width: 16px;
  display: flex; align-items: center; justify-content: center;
  transition: color 0.15s;
}
.v2-nav-item--active .v2-nav-icon,
.v2-nav-item:hover .v2-nav-icon { color: #c4ff46; }

/* Ring */
.v2-ring-block {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 16px 12px 20px;
  border-bottom: 1px solid rgba(240,242,245,0.05);
}
.v2-ring-label {
  font-size: 9px; font-family: 'DM Mono', monospace;
  color: rgba(240,242,245,0.28); text-align: center;
  letter-spacing: 0.10em; text-transform: uppercase;
}

/* Meta */
.v2-meta-list { display: flex; flex-direction: column; gap: 10px; padding: 0 4px; }
.v2-meta-row  { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.v2-meta-key  { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.30); }
.v2-meta-val  { font-size: 11px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.75); font-weight: 600; }

/* State tags */
.v2-state-tag {
  font-size: 9px; font-family: 'DM Mono', monospace; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.07em;
  border-radius: 5px; padding: 2px 8px; border: 1px solid;
}
.v2-state-tag--active   { color: #c4ff46; background: rgba(196,255,70,0.08);  border-color: rgba(196,255,70,0.22); }
.v2-state-tag--complete { color: #4ade80; background: rgba(74,222,128,0.08);  border-color: rgba(74,222,128,0.22); }

/* Milestone mini */
.v2-ms-mini-list { display: flex; flex-direction: column; gap: 8px; padding: 0 4px; }
.v2-ms-mini { display: flex; align-items: center; gap: 9px; }
.v2-ms-mini-dot {
  width: 20px; height: 20px; border-radius: 5px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-family: 'DM Mono', monospace; font-weight: 700;
}
.v2-ms-mini-body { flex: 1; min-width: 0; }
.v2-ms-mini-title {
  font-size: 10px; color: rgba(240,242,245,0.60); font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 5px;
}
.v2-ms-mini-track { height: 2px; background: rgba(240,242,245,0.06); border-radius: 1px; overflow: hidden; }
.v2-ms-mini-fill  { height: 100%; border-radius: 1px; transition: width 0.6s cubic-bezier(0.16,1,0.3,1); }
.v2-ms-mini-pct   { font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.28); flex-shrink: 0; }

/* Sidebar footer */
.v2-sidebar-footer { padding: 0 12px; margin-top: auto; padding-top: 16px; }
.v2-btn-ghost-sm {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; padding: 8px 12px; border-radius: 8px;
  background: none; border: 1px solid rgba(240,242,245,0.10);
  color: rgba(240,242,245,0.40); font-size: 11px;
  font-family: 'DM Sans', sans-serif; font-weight: 500;
  cursor: pointer; transition: all 0.15s;
}
.v2-btn-ghost-sm:hover { background: rgba(240,242,245,0.05); color: rgba(240,242,245,0.80); border-color: rgba(240,242,245,0.18); }

/* ── Main ── */
.v2-main {
  flex: 1; min-width: 0;
  padding: 36px 44px 72px;
  display: flex; flex-direction: column; gap: 24px;
}

/* Page header */
.v2-page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.v2-page-header-left {}
.v2-eyebrow {
  font-size: 10px; font-family: 'DM Mono', monospace; color: #c4ff46;
  text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 6px;
}
.v2-page-title {
  font-family: 'Syne', sans-serif; font-size: clamp(24px, 2.5vw, 32px);
  font-weight: 800; color: #f0f2f5; letter-spacing: -0.04em; line-height: 1.05; margin: 0;
}
.v2-agreement-id-chip {
  display: flex; align-items: center; gap: 8px;
  background: rgba(240,242,245,0.04); border: 1px solid rgba(240,242,245,0.10);
  border-radius: 10px; padding: 8px 14px; margin-top: 4px;
}
.v2-agreement-id-label {
  font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.28);
  text-transform: uppercase; letter-spacing: 0.12em;
}
.v2-agreement-id-val { font-size: 12px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.65); font-weight: 600; }

/* Stats grid */
.v2-stats-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px;
  background: rgba(240,242,245,0.06); border-radius: 14px;
  border: 1px solid rgba(240,242,245,0.06); overflow: hidden;
}
@media (max-width: 780px) { .v2-stats-grid { grid-template-columns: 1fr 1fr; } }

.v2-stat-card {
  background: #111214; padding: 20px 18px 16px;
  display: flex; flex-direction: column; gap: 0;
  transition: background 0.15s;
}
.v2-stat-card:hover { background: #141618; }
.v2-stat-icon-wrap {
  width: 32px; height: 32px; border-radius: 9px; margin-bottom: 14px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px;
}
.v2-stat-label {
  font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.30);
  text-transform: uppercase; letter-spacing: 0.11em; margin-bottom: 7px;
}
.v2-stat-value {
  font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 700;
  color: #f0f2f5; letter-spacing: -0.03em; line-height: 1.2;
  word-break: break-all; margin-bottom: 4px;
}
.v2-stat-sub { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.28); }

/* Progress card */
.v2-progress-card {
  background: #111214; border: 1px solid rgba(240,242,245,0.08);
  border-radius: 14px; padding: 18px 20px; display: flex; flex-direction: column; gap: 14px;
}
.v2-progress-top  { display: flex; align-items: center; justify-content: space-between; }
.v2-progress-title {
  display: flex; align-items: center; gap: 7px;
  font-size: 11px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.40);
  text-transform: uppercase; letter-spacing: 0.09em;
}
.v2-progress-stat { display: flex; align-items: baseline; gap: 8px; }
.v2-progress-pct  { font-size: 18px; font-family: 'DM Mono', monospace; font-weight: 800; letter-spacing: -0.03em; }
.v2-progress-frac { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.28); }
.v2-progress-track {
  height: 5px; background: rgba(240,242,245,0.06); border-radius: 3px; overflow: hidden;
}
.v2-progress-fill { height: 100%; border-radius: 3px; transition: width 1s cubic-bezier(0.16,1,0.3,1); }
.v2-progress-segments {
  display: flex; gap: 3px; align-items: center;
}
.v2-progress-seg { display: flex; justify-content: center; }
.v2-progress-seg-dot {
  width: 5px; height: 5px; border-radius: 50%;
  transition: background 0.4s;
}

/* Section head */
.v2-section-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.v2-section-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.35);
  text-transform: uppercase; letter-spacing: 0.10em;
}
.v2-section-count { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.25); }

/* Milestone list */
.v2-ms-list {
  display: flex; flex-direction: column; gap: 2px;
}

.v2-ms-block {
  background: #111214; border: 1px solid rgba(240,242,245,0.07);
  border-radius: 14px; overflow: hidden;
  transition: border-color 0.15s;
}
.v2-ms-block:hover { border-color: rgba(240,242,245,0.12); }
.v2-ms-block--done     { opacity: 0.65; }
.v2-ms-block--disputed { border-color: rgba(251,191,36,0.22) !important; background: rgba(251,191,36,0.02); }
.v2-ms-block--pending  { border-color: rgba(196,255,70,0.15) !important; }

.v2-ms-row {
  display: flex; align-items: flex-start; gap: 0;
  padding: 0; position: relative;
}

.v2-ms-accent-bar {
  width: 3px; flex-shrink: 0; align-self: stretch; min-height: 60px;
  border-radius: 0; transition: background 0.3s;
}

.v2-ms-num {
  width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
  border: 1px solid; margin: 18px 14px 18px 16px;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-family: 'DM Mono', monospace; font-weight: 800;
  transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
}

.v2-ms-info { flex: 1; min-width: 0; padding: 18px 0 18px 2px; }
.v2-ms-title-row { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; flex-wrap: wrap; }
.v2-ms-title { font-size: 14px; font-weight: 600; color: #f0f2f5; letter-spacing: -0.02em; font-family: 'DM Sans', sans-serif; }
.v2-ms-condition { font-size: 12px; color: rgba(240,242,245,0.45); line-height: 1.65; max-width: 440px; margin-bottom: 8px; }
.v2-ms-meta-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.v2-ms-deadline {
  display: flex; align-items: center; gap: 4px;
  font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.28);
}
.v2-tx-link {
  display: flex; align-items: center; gap: 4px;
  font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.35);
  text-decoration: none; transition: color 0.15s;
}
.v2-tx-link:hover { color: #c4ff46; }
.v2-tx-error { font-size: 10px; font-family: 'DM Mono', monospace; color: #f87171; }

.v2-ms-right {
  display: flex; flex-direction: column; align-items: flex-end;
  gap: 10px; flex-shrink: 0; padding: 18px 20px 18px 20px;
}
.v2-ms-amount-block { text-align: right; }
.v2-ms-amount {
  font-family: 'DM Mono', monospace; font-size: 14px; font-weight: 600;
  letter-spacing: -0.02em; line-height: 1; transition: color 0.3s;
}
.v2-ms-amount-sub { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.28); margin-top: 4px; }
.v2-ms-actions { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }

/* Status pill */
.v2-status-pill {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 9px; font-family: 'DM Mono', monospace; font-weight: 700;
  letter-spacing: 0.05em; border: 1px solid; border-radius: 6px;
  padding: 3px 9px; white-space: nowrap;
}
.v2-spinner-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: currentColor; animation: v2PulseDot 1.4s ease infinite;
}

/* Chips */
.v2-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 9px; font-family: 'DM Mono', monospace; font-weight: 700;
  letter-spacing: 0.04em; border-radius: 5px; padding: 2px 8px; border: 1px solid;
}
.v2-chip--dispute { color: #fbbf24; background: rgba(251,191,36,0.10); border-color: rgba(251,191,36,0.28); animation: v2DisputePulse 2.4s ease infinite; }
.v2-chip--pending { color: #c4ff46; background: rgba(196,255,70,0.08); border-color: rgba(196,255,70,0.22); }
.v2-chip--failed  { color: #f87171; background: rgba(248,113,113,0.10); border-color: rgba(248,113,113,0.28); }

/* Action buttons */
.v2-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 12px; border-radius: 7px;
  font-size: 11px; font-family: 'DM Mono', monospace; font-weight: 600;
  cursor: pointer; border: 1px solid;
  transition: all 0.15s cubic-bezier(0.16,1,0.3,1);
  white-space: nowrap; letter-spacing: 0.02em;
}
.v2-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.v2-btn--release {
  color: #c4ff46; background: rgba(196,255,70,0.08); border-color: rgba(196,255,70,0.25);
}
.v2-btn--release:hover:not(:disabled) {
  background: rgba(196,255,70,0.15); border-color: rgba(196,255,70,0.50);
  box-shadow: 0 2px 14px rgba(196,255,70,0.18);
  transform: translateY(-1px);
}

.v2-btn--dispute {
  color: #fbbf24; background: rgba(251,191,36,0.08); border-color: rgba(251,191,36,0.25);
}
.v2-btn--dispute:hover:not(:disabled) {
  background: rgba(251,191,36,0.14); border-color: rgba(251,191,36,0.45);
  transform: translateY(-1px);
}

.v2-btn--evidence {
  color: #fbbf24; background: rgba(251,191,36,0.08); border-color: rgba(251,191,36,0.25);
}
.v2-btn--evidence:hover { background: rgba(251,191,36,0.14); border-color: rgba(251,191,36,0.45); }

.v2-btn--retry {
  color: #f87171; background: rgba(248,113,113,0.08); border-color: rgba(248,113,113,0.25);
}
.v2-btn--retry:hover { background: rgba(248,113,113,0.14); }

.v2-btn--timeout {
  color: rgba(240,242,245,0.35); background: rgba(240,242,245,0.04); border-color: rgba(240,242,245,0.10);
  padding: 5px 9px;
}
.v2-btn--timeout:hover { color: rgba(240,242,245,0.70); background: rgba(240,242,245,0.08); }

.v2-filed-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 10px; font-family: 'DM Mono', monospace; font-weight: 700;
  color: #4ade80; background: rgba(74,222,128,0.10);
  border: 1px solid rgba(74,222,128,0.25); border-radius: 6px; padding: 3px 10px;
}

/* Panels */
.v2-dispute-panel {
  border-top: 1px solid rgba(251,191,36,0.12);
  padding: 20px 22px; background: rgba(251,191,36,0.01);
}
.v2-submit-panel {
  border-top: 1px solid rgba(240,242,245,0.07);
  background: #0e0f10;
}

/* Spinners */
.v2-spinner-xs {
  display: inline-block; width: 7px; height: 7px; border-radius: 50%;
  border: 1.5px solid rgba(196,255,70,0.25); border-top-color: #c4ff46;
  animation: v2Spin 0.65s linear infinite; flex-shrink: 0;
}

/* Info strip */
.v2-info-strip {
  display: flex; gap: 10px; align-items: flex-start;
  background: #111214; border: 1px solid rgba(240,242,245,0.07);
  border-radius: 10px; padding: 13px 16px;
}
.v2-info-icon {
  color: rgba(240,242,245,0.25); flex-shrink: 0; margin-top: 1px;
}
.v2-info-text {
  font-size: 12px; color: rgba(240,242,245,0.35); line-height: 1.7; margin: 0;
}
.v2-info-text strong { color: rgba(240,242,245,0.65); font-weight: 500; }

/* Complete banner */
.v2-complete-banner {
  text-align: center;
  background: linear-gradient(150deg, rgba(74,222,128,0.05) 0%, #111214 55%);
  border: 1px solid rgba(74,222,128,0.18); border-radius: 16px; padding: 48px 28px;
}
.v2-complete-icon {
  width: 56px; height: 56px; border-radius: 50%;
  background: rgba(74,222,128,0.10); border: 1px solid rgba(74,222,128,0.25);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 18px;
}
.v2-complete-title {
  font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 800;
  letter-spacing: -0.04em; color: #f0f2f5; margin-bottom: 8px;
}
.v2-complete-body { font-size: 13px; color: rgba(240,242,245,0.40); margin-bottom: 28px; }
.v2-complete-actions { display: flex; gap: 10px; justify-content: center; }

.v2-btn-primary {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  padding: 11px 24px; border-radius: 9px; cursor: pointer; border: none;
  background: #c4ff46; color: #0b0c0d;
  font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 700;
  letter-spacing: -0.01em; transition: all 0.15s;
}
.v2-btn-primary:hover { background: #d4ff60; box-shadow: 0 4px 20px rgba(196,255,70,0.28); transform: translateY(-1px); }

.v2-btn-secondary {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  padding: 11px 24px; border-radius: 9px; cursor: pointer;
  background: transparent; color: rgba(240,242,245,0.60);
  border: 1px solid rgba(240,242,245,0.12);
  font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500;
  letter-spacing: -0.01em; transition: all 0.15s;
}
.v2-btn-secondary:hover { background: rgba(240,242,245,0.06); color: #f0f2f5; border-color: rgba(240,242,245,0.22); }

/* Animations */
.v2-fade-up { animation: v2FadeUp 0.45s cubic-bezier(0.16,1,0.3,1) both; }
.v2-d1 { animation-delay: 0.06s; }
.v2-d2 { animation-delay: 0.12s; }
.v2-d3 { animation-delay: 0.18s; }
.v2-d4 { animation-delay: 0.24s; }
@keyframes v2FadeUp   { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes v2Spin     { to { transform: rotate(360deg); } }
@keyframes v2PulseDot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.80); } }
@keyframes v2DisputePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

/* Responsive */
@media (max-width: 900px) {
  .v2-sidebar { display: none; }
  .v2-main    { padding: 24px 20px 56px; }
}
@media (max-width: 580px) {
  .v2-stats-grid { grid-template-columns: 1fr 1fr; }
  .v2-ms-row     { flex-direction: column; }
  .v2-ms-right   { flex-direction: row; align-items: center; padding-top: 0; }
}

/* ══════════════════════════════════════════════
   DISPUTE MODAL
   ══════════════════════════════════════════════ */

.v2-modal-backdrop {
  position: fixed; inset: 0; z-index: 999;
  background: rgba(0,0,0,0.72);
  backdrop-filter: blur(6px) saturate(1.2);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  animation: v2ModalBgIn 0.2s ease both;
}
@keyframes v2ModalBgIn { from { opacity: 0; } to { opacity: 1; } }

.v2-modal {
  width: 100%; max-width: 560px;
  background: #111214;
  border: 1px solid rgba(251,191,36,0.18);
  border-radius: 18px; overflow: hidden;
  box-shadow: 0 24px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(251,191,36,0.08);
  animation: v2ModalIn 0.28s cubic-bezier(0.16,1,0.3,1) both;
  display: flex; flex-direction: column;
  max-height: 90vh;
}
@keyframes v2ModalIn {
  from { opacity: 0; transform: translateY(20px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* Header */
.v2-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px 16px;
  border-bottom: 1px solid rgba(240,242,245,0.07);
  flex-shrink: 0;
}
.v2-modal-header-left { display: flex; align-items: center; gap: 12px; }
.v2-modal-icon {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  background: rgba(251,191,36,0.10); border: 1px solid rgba(251,191,36,0.22);
  display: flex; align-items: center; justify-content: center;
}
.v2-modal-title {
  font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 800;
  color: #f0f2f5; letter-spacing: -0.03em;
}
.v2-modal-subtitle {
  font-size: 11px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.35);
  margin-top: 2px;
}
.v2-modal-close {
  width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
  background: rgba(240,242,245,0.05); border: 1px solid rgba(240,242,245,0.10);
  display: flex; align-items: center; justify-content: center;
  color: rgba(240,242,245,0.40); cursor: pointer;
  transition: all 0.15s;
}
.v2-modal-close:hover { background: rgba(240,242,245,0.10); color: #f0f2f5; border-color: rgba(240,242,245,0.22); }

/* Step indicator */
.v2-modal-steps {
  display: flex; align-items: center; gap: 0;
  padding: 14px 20px;
  border-bottom: 1px solid rgba(240,242,245,0.06);
  background: rgba(240,242,245,0.01);
  flex-shrink: 0;
}
.v2-modal-step {
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.30);
  transition: color 0.2s;
}
.v2-modal-step--active { color: rgba(240,242,245,0.80); }
.v2-modal-step--done   { color: #4ade80; }
.v2-modal-step--idle   { color: rgba(240,242,245,0.22); }
.v2-modal-step-dot {
  width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
  border: 1.5px solid currentColor;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700; transition: all 0.2s;
}
.v2-modal-step--active .v2-modal-step-dot { background: rgba(196,255,70,0.10); border-color: #c4ff46; color: #c4ff46; }
.v2-modal-step--done   .v2-modal-step-dot { background: rgba(74,222,128,0.12); border-color: #4ade80; color: #4ade80; }
.v2-modal-step-line {
  flex: 1; height: 1px; margin: 0 12px;
  transition: background 0.4s;
}

/* Body */
.v2-modal-body {
  padding: 20px;
  display: flex; flex-direction: column; gap: 16px;
  flex-shrink: 0;
}
.v2-modal-body--scroll {
  overflow-y: auto; flex: 1;
  padding: 0; /* DisputeSubmitScreen handles its own padding */
}

/* Warn banner */
.v2-modal-warn-banner {
  display: flex; align-items: flex-start; gap: 10px;
  background: rgba(251,191,36,0.06); border: 1px solid rgba(251,191,36,0.18);
  border-radius: 10px; padding: 13px 15px;
}
.v2-modal-warn-banner svg { flex-shrink: 0; margin-top: 1px; }
.v2-modal-warn-banner p {
  font-size: 12px; color: rgba(240,242,245,0.55); line-height: 1.65; margin: 0;
}

/* Detail grid */
.v2-modal-detail-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 1px;
  background: rgba(240,242,245,0.07);
  border: 1px solid rgba(240,242,245,0.07);
  border-radius: 11px; overflow: hidden;
}
.v2-modal-detail {
  background: #161719; padding: 13px 14px;
  display: flex; flex-direction: column; gap: 5px;
}
.v2-modal-detail--full { grid-column: 1 / -1; }
.v2-modal-detail-label {
  font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.28);
  text-transform: uppercase; letter-spacing: 0.11em;
}
.v2-modal-detail-val {
  font-size: 13px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.80);
  font-weight: 600; letter-spacing: -0.01em;
}

/* Footer */
.v2-modal-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 10px;
  padding-top: 4px;
}

/* Dispute confirm button */
.v2-btn-dispute-confirm {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 22px; border-radius: 9px; cursor: pointer;
  background: rgba(251,191,36,0.12); color: #fbbf24;
  border: 1px solid rgba(251,191,36,0.35);
  font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 700;
  letter-spacing: -0.01em; transition: all 0.15s;
}
.v2-btn-dispute-confirm:hover {
  background: rgba(251,191,36,0.20); border-color: rgba(251,191,36,0.55);
  box-shadow: 0 4px 20px rgba(251,191,36,0.18);
  transform: translateY(-1px);
}

/* TX notice in step 2 */
.v2-modal-tx-notice {
  display: flex; align-items: center; gap: 10px;
  background: rgba(196,255,70,0.05); border: 1px solid rgba(196,255,70,0.14);
  border-radius: 9px; padding: 11px 14px; margin: 16px 20px 0;
  font-size: 12px; color: rgba(240,242,245,0.50); font-family: 'DM Mono', monospace;
  flex-shrink: 0;
}
.v2-spinner-sm {
  display: inline-block; flex-shrink: 0;
  width: 12px; height: 12px; border-radius: 50%;
  border: 1.5px solid rgba(196,255,70,0.15); border-top-color: #c4ff46;
  animation: v2Spin 0.65s linear infinite;
}
`;
