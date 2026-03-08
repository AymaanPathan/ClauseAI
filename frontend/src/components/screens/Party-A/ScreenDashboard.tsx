"use client";

import { useState } from "react";

import { setScreen, markComplete, resetAll } from "@/store/slices/partyASlice";
import { isV2, ParsedAgreementV2 } from "@/api/parseApi";
import { AppDispatch, RootState } from "@/store";
import { useDispatch, useSelector } from "react-redux";

type MilestoneStatus =
  | "locked"
  | "pending"
  | "complete"
  | "disputed"
  | "refunded";

interface MilestoneUI {
  index: number;
  title: string;
  percentage: number;
  condition: string;
  deadline: string;
  status: MilestoneStatus;
  amountUsd: string;
}

function statusColor(s: MilestoneStatus) {
  if (s === "complete") return "var(--green)";
  if (s === "disputed") return "var(--amber)";
  if (s === "refunded") return "var(--red)";
  return "var(--text-3)";
}

function statusLabel(s: MilestoneStatus) {
  if (s === "complete") return "Released ✓";
  if (s === "disputed") return "In Dispute";
  if (s === "refunded") return "Refunded";
  if (s === "pending") return "Pending";
  return "Locked";
}

export default function ScreenDashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const {
    editedTerms,
    agreementId,
    walletAddress,
    amountLocked,
    fundState,
    txMilestone,
  } = useSelector((s: RootState) => s.partyA);

  const t = editedTerms as any;
  const v2 = isV2(editedTerms)
    ? (editedTerms as unknown as ParsedAgreementV2)
    : null;
  const payerName = t?.payer ?? t?.partyA ?? "Payer";
  const receiverName = t?.receiver ?? t?.partyB ?? "Receiver";
  const totalAmount = t?.total_usd ?? t?.amount_usd ?? amountLocked ?? "—";
  const arbitrator = t?.arbitrator ?? "TBD";

  // Build milestone list
  const milestones: MilestoneUI[] = v2?.milestones?.map((ms, i) => ({
    index: i,
    title: ms.title || `Milestone ${i + 1}`,
    percentage: ms.percentage,
    condition: ms.condition,
    deadline: ms.deadline,
    status: "locked" as MilestoneStatus,
    amountUsd: (((parseFloat(totalAmount) || 0) * ms.percentage) / 100).toFixed(
      2,
    ),
  })) ?? [
    {
      index: 0,
      title: "Full Payment",
      percentage: 100,
      condition: t?.condition ?? "Payer confirms work is complete.",
      deadline: t?.deadline ?? "",
      status: "locked" as MilestoneStatus,
      amountUsd: totalAmount,
    },
  ];

  const [msStatuses, setMsStatuses] = useState<Record<number, MilestoneStatus>>(
    Object.fromEntries(milestones.map((m) => [m.index, m.status])),
  );
  const [actionLoading, setActionLoading] = useState<Record<number, string>>(
    {},
  );
  const [actionError, setActionError] = useState<Record<number, string>>({});

  const allComplete = milestones.every((m) =>
    ["complete", "refunded"].includes(msStatuses[m.index] ?? "locked"),
  );

  async function handleAction(
    index: number,
    action: "complete" | "dispute" | "timeout",
  ) {
    setActionLoading((prev) => ({ ...prev, [index]: action }));
    setActionError((prev) => ({ ...prev, [index]: "" }));
    try {
      // In real implementation, dispatch the appropriate thunk:
      // complete → completeMilestoneThunk
      // dispute  → disputeMilestoneThunk
      // timeout  → triggerMilestoneTimeoutThunk
      await new Promise((r) => setTimeout(r, 1200)); // placeholder

      const nextStatus: MilestoneStatus =
        action === "complete"
          ? "complete"
          : action === "dispute"
            ? "disputed"
            : "refunded";

      setMsStatuses((prev) => ({ ...prev, [index]: nextStatus }));

      if (
        action === "complete" &&
        milestones.every((m, i) =>
          i === index
            ? true
            : ["complete", "refunded"].includes(
                msStatuses[m.index] ?? "locked",
              ),
        )
      ) {
        dispatch(markComplete());
      }
    } catch (err) {
      setActionError((prev) => ({
        ...prev,
        [index]: err instanceof Error ? err.message : "Action failed",
      }));
    } finally {
      setActionLoading((prev) => ({ ...prev, [index]: "" }));
    }
  }

  const completedCount = milestones.filter(
    (m) => msStatuses[m.index] === "complete",
  ).length;
  const progressPct =
    milestones.length > 0
      ? Math.round((completedCount / milestones.length) * 100)
      : 0;

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
              Escrow Active
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="fade-up d1 summary-grid" style={{ marginBottom: 24 }}>
          {[
            {
              label: "Total Locked",
              value: `$${totalAmount}`,
              sub: "in escrow",
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
              const status = msStatuses[ms.index] ?? "locked";
              const loading = actionLoading[ms.index];
              const error = actionError[ms.index];
              const isDone = status === "complete" || status === "refunded";

              return (
                <div
                  key={ms.index}
                  className={`ms-card${isDone ? " ms-card--done" : ""}`}
                >
                  {/* MS header */}
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
                      <div className="ms-amount">${ms.amountUsd}</div>
                      <div className="ms-pct">{ms.percentage}%</div>
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

                  {/* Status */}
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

                    {/* Actions — only shown when locked/pending */}
                    {!isDone && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="action-btn action-btn--complete"
                          onClick={() => handleAction(ms.index, "complete")}
                          disabled={!!loading}
                        >
                          {loading === "complete" ? (
                            <span
                              className="spinner"
                              style={{ width: 10, height: 10 }}
                            />
                          ) : (
                            "✓ Release"
                          )}
                        </button>
                        <button
                          className="action-btn action-btn--dispute"
                          onClick={() => handleAction(ms.index, "dispute")}
                          disabled={!!loading}
                        >
                          {loading === "dispute" ? (
                            <span
                              className="spinner"
                              style={{ width: 10, height: 10 }}
                            />
                          ) : (
                            "⚑ Dispute"
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {error && (
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--red)",
                        fontFamily: "var(--mono)",
                        marginTop: 6,
                      }}
                    >
                      ⚠ {error}
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
            send a milestone payment to the receiver. Click{" "}
            <strong style={{ color: "var(--text-2)" }}>Dispute</strong> to open
            arbitration — the arbitrator will review both sides and decide.
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
.page-title {
  font-size: clamp(24px, 3.5vw, 36px); font-weight: 700;
  letter-spacing: -0.04em; line-height: 1.05; margin: 0;
}
.mono-label {
  font-size: 10px; font-family: var(--mono); color: var(--text-4);
  text-transform: uppercase; letter-spacing: 0.1em;
}
.status-pill {
  display: flex; align-items: center; gap: 7px;
  font-size: 11px; font-family: var(--mono); color: var(--green);
  background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2);
  border-radius: 20px; padding: 5px 12px;
}
.status-dot {
  width: 6px; height: 6px; border-radius: 50%; background: var(--green);
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.summary-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
}
@media (max-width: 640px) { .summary-grid { grid-template-columns: 1fr 1fr; } }
.summary-card {
  background: var(--bg-1); border: 1px solid var(--border);
  border-radius: var(--r-sm); padding: 14px 16px;
}
.summary-label { font-size: 9px; font-family: var(--mono); color: var(--text-4); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px; }
.summary-value { font-size: 14px; font-weight: 700; color: var(--text-1); letter-spacing: -0.02em; margin-bottom: 3px; }
.summary-sub { font-size: 10px; font-family: var(--mono); color: var(--text-4); }
.progress-track {
  height: 4px; background: var(--bg-3); border-radius: 2px; overflow: hidden;
}
.progress-fill {
  height: 100%; background: var(--green); border-radius: 2px;
  transition: width 0.6s ease; min-width: 4px;
}
.ms-card {
  background: var(--bg-1); border: 1px solid var(--border);
  border-radius: var(--r); padding: 16px 18px; transition: all 0.3s;
}
.ms-card--done {
  opacity: 0.6;
}
.ms-index {
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--bg-3); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-family: var(--mono); color: var(--text-3); font-weight: 700; flex-shrink: 0;
}
.ms-title { font-size: 13px; font-weight: 600; color: var(--text-1); }
.ms-condition { font-size: 11px; color: var(--text-3); line-height: 1.6; max-width: 420px; }
.ms-amount { font-size: 14px; font-weight: 700; color: var(--text-1); font-family: var(--mono); }
.ms-pct { font-size: 10px; color: var(--text-4); font-family: var(--mono); }
.ms-deadline {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 10px; font-family: var(--mono); color: var(--text-4);
}
.ms-status { font-size: 11px; font-family: var(--mono); font-weight: 600; }
.action-btn {
  padding: 5px 12px; border-radius: var(--r-xs); font-size: 11px;
  font-family: var(--mono); cursor: pointer; border: 1px solid;
  transition: all var(--fast) var(--ease); display: flex; align-items: center; gap: 5px;
}
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.action-btn--complete {
  background: rgba(34,197,94,0.08); border-color: rgba(34,197,94,0.3); color: var(--green);
}
.action-btn--complete:hover:not(:disabled) {
  background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.5);
}
.action-btn--dispute {
  background: rgba(245,158,11,0.08); border-color: rgba(245,158,11,0.3); color: var(--amber);
}
.action-btn--dispute:hover:not(:disabled) {
  background: rgba(245,158,11,0.15); border-color: rgba(245,158,11,0.5);
}
.info-strip {
  display: flex; gap: 10px; align-items: flex-start;
  background: var(--bg-2); border: 1px solid var(--border);
  border-radius: var(--r-sm); padding: 12px 14px;
}
`;
