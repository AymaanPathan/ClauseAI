"use client";
// ============================================================
// components/partyB/PartyBDashboard.tsx — PRODUCTION v2
//
// Live milestone feed for Party B.
// • Fetches initial state from MongoDB via GET /api/agreement/:id/milestones
// • Connects to Socket.io room `agreement:{id}` for instant updates
// • Updates milestone cards in real-time when Party A releases / disputes
// ============================================================

import { useEffect, useRef, useState, useCallback } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import {
  getSocket,
  joinAgreementRoom,
  MilestoneUpdatedPayload,
} from "@/lib/socket";
import { explorerTxUrl } from "@/lib/stacksConfig";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────
type MsStatus =
  | "locked"
  | "pending"
  | "complete"
  | "disputed"
  | "refunded"
  | "failed";

interface DbMilestone {
  index: number;
  title: string;
  percentage: number;
  condition: string;
  deadline?: string;
  amountUsd: string;
  amountSats: number;
  status: MsStatus;
  txId?: string;
  txUrl?: string;
  completedAt?: string;
  disputedAt?: string;
}

interface AgreementData {
  agreementId: string;
  milestones: DbMilestone[];
  fundState: string;
  totalAmountUsd: number;
  totalAmountSats: number;
  partyA: string | null;
  partyB: string | null;
  arbitrator: string | null;
}

// ── Helpers ────────────────────────────────────────────────────
function statusColor(s: MsStatus) {
  if (s === "complete") return "var(--green)";
  if (s === "disputed") return "var(--amber)";
  if (s === "refunded") return "#ef4444";
  if (s === "failed") return "#ef4444";
  if (s === "pending") return "var(--text-3)";
  return "var(--text-4)";
}

function statusLabel(s: MsStatus) {
  if (s === "complete") return "Released ✓";
  if (s === "disputed") return "In Dispute";
  if (s === "refunded") return "Refunded";
  if (s === "failed") return "Tx Failed";
  if (s === "pending") return "Confirming…";
  return "Awaiting Release";
}

function statusIcon(s: MsStatus) {
  if (s === "complete") return "✓";
  if (s === "disputed") return "⚑";
  if (s === "refunded") return "↩";
  if (s === "failed") return "✕";
  if (s === "pending") return "◌";
  return "○";
}

function formatSats(sats: number): string {
  return `${(sats / 100_000_000).toFixed(8)} sBTC`;
}

// ── Component ──────────────────────────────────────────────────
export default function PartyBDashboard() {
  const { terms, amountLocked, walletAddress, agreementId } = useSelector(
    (s: RootState) => s.partyB,
  );

  const t = terms as any;
  const receiverName = t?.receiver ?? t?.partyB ?? "You";
  const payerName = t?.payer ?? t?.partyA ?? "Payer";
  const displayAmount = amountLocked ?? t?.total_usd ?? t?.amount_usd ?? "—";

  // ── Fetch agreement data from DB ───────────────────────────
  const [data, setData] = useState<AgreementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!agreementId) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/agreement/${agreementId}/milestones`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [agreementId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Socket.io — real-time updates ─────────────────────────
  useEffect(() => {
    if (!agreementId) return;

    const socket = getSocket();
    joinAgreementRoom(agreementId);

    function onMilestoneUpdated(payload: MilestoneUpdatedPayload) {
      setData((prev) => {
        if (!prev) return prev;
        const updated = prev.milestones.map((ms) =>
          ms.index === payload.milestoneIndex
            ? {
                ...ms,
                status: payload.status as MsStatus,
                txId: payload.txId,
                txUrl: payload.txUrl,
                completedAt:
                  payload.status === "complete"
                    ? new Date().toISOString()
                    : ms.completedAt,
              }
            : ms,
        );
        return {
          ...prev,
          milestones: updated,
          fundState: payload.allComplete ? "released" : prev.fundState,
        };
      });
      setLastUpdate(new Date());
      setFlashIndex(payload.milestoneIndex);
      setTimeout(() => setFlashIndex(null), 2500);
    }

    socket.on("milestone:updated", onMilestoneUpdated);
    socket.on("funds:locked", () => fetchData());

    return () => {
      socket.off("milestone:updated", onMilestoneUpdated);
      socket.off("funds:locked");
    };
  }, [agreementId, fetchData]);

  // ── Derived state ───────────────────────────────────────────
  const milestones = data?.milestones ?? [];
  const completedCount = milestones.filter((m) =>
    ["complete", "refunded"].includes(m.status),
  ).length;
  const progressPct =
    milestones.length > 0
      ? Math.round((completedCount / milestones.length) * 100)
      : 0;
  const totalSats = data?.totalAmountSats ?? 0;
  const earnedSats = milestones
    .filter((m) => m.status === "complete")
    .reduce((sum, m) => sum + m.amountSats, 0);

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
              <div className="mono-label">
                Agreement #{agreementId} · Party B
              </div>
              <h2 className="page-title">Your Dashboard</h2>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 6,
              }}
            >
              <div className="status-pill">
                <div className="status-dot" />
                Live
              </div>
              {lastUpdate && (
                <span className="mono-label" style={{ fontSize: 9 }}>
                  Updated {lastUpdate.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="fade-up d1 summary-grid" style={{ marginBottom: 24 }}>
          {[
            {
              label: "Total Locked",
              value: formatSats(totalSats),
              sub: `≈ $${displayAmount} USD`,
            },
            {
              label: "Your Role",
              value: receiverName,
              sub: walletAddress ? `${walletAddress.slice(0, 8)}…` : "Receiver",
            },
            {
              label: "Earned",
              value: formatSats(earnedSats),
              sub: `${completedCount} milestone${completedCount !== 1 ? "s" : ""} released`,
            },
            {
              label: "Payer",
              value: payerName,
              sub: data?.partyA ? `${data.partyA.slice(0, 8)}…` : "—",
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

        {/* Loading / Error */}
        {loading && (
          <div
            className="fade-up d2"
            style={{
              textAlign: "center",
              padding: "40px 0",
              color: "var(--text-3)",
              fontSize: 13,
            }}
          >
            <span
              className="spinner"
              style={{
                width: 16,
                height: 16,
                margin: "0 auto 12px",
                display: "block",
              }}
            />
            Loading milestone data…
          </div>
        )}

        {error && !loading && (
          <div
            className="fade-up d2 info-strip"
            style={{ marginBottom: 20, borderColor: "rgba(239,68,68,0.3)" }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={{ fontSize: 11, color: "#ef4444", margin: 0 }}>
              Could not load milestone data: {error}.{" "}
              <button
                onClick={fetchData}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--green)",
                  cursor: "pointer",
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                }}
              >
                Retry ↺
              </button>
            </p>
          </div>
        )}

        {/* Milestone cards */}
        {!loading && milestones.length > 0 && (
          <div className="fade-up d2" style={{ marginBottom: 24 }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>
              Milestones
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {milestones.map((ms) => {
                const isDone =
                  ms.status === "complete" || ms.status === "refunded";
                const isPending = ms.status === "pending";
                const isFlashing = flashIndex === ms.index;

                return (
                  <div
                    key={ms.index}
                    className={`ms-card${isDone ? " ms-card--done" : ""}${isPending ? " ms-card--pending" : ""}${isFlashing ? " ms-card--flash" : ""}`}
                  >
                    {/* Milestone header */}
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
                          <div
                            className="ms-index"
                            style={
                              isDone
                                ? {
                                    background: "rgba(34,197,94,0.12)",
                                    borderColor: "rgba(34,197,94,0.3)",
                                    color: "var(--green)",
                                  }
                                : {}
                            }
                          >
                            {isDone ? "✓" : ms.index + 1}
                          </div>
                          <span className="ms-title">{ms.title}</span>
                          {isFlashing && (
                            <span className="flash-badge">Just updated!</span>
                          )}
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
                        <div
                          className="ms-amount"
                          style={isDone ? { color: "var(--green)" } : {}}
                        >
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

                    {/* Tx link */}
                    {ms.txId && (
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
                          href={ms.txUrl ?? explorerTxUrl(ms.txId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 10,
                            fontFamily: "var(--mono)",
                            color: "var(--text-3)",
                            textDecoration: "none",
                          }}
                        >
                          {ms.txId.slice(0, 14)}… ↗
                        </a>
                        {isPending && (
                          <span
                            className="spinner"
                            style={{ width: 10, height: 10 }}
                          />
                        )}
                      </div>
                    )}

                    {/* Completion time */}
                    {ms.completedAt && (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 10,
                          fontFamily: "var(--mono)",
                          color: "var(--text-4)",
                        }}
                      >
                        Completed: {new Date(ms.completedAt).toLocaleString()}
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
                        style={{ color: statusColor(ms.status) }}
                      >
                        {statusLabel(ms.status)}
                      </span>
                      {ms.status === "disputed" && (
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: "var(--mono)",
                            color: "var(--amber)",
                            background: "rgba(245,158,11,0.1)",
                            border: "1px solid rgba(245,158,11,0.2)",
                            borderRadius: 4,
                            padding: "2px 8px",
                          }}
                        >
                          Awaiting arbitration
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* All complete banner */}
        {progressPct === 100 && milestones.length > 0 && (
          <div
            className="fade-up d3 complete-banner"
            style={{ marginBottom: 24 }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--text-1)",
                marginBottom: 4,
              }}
            >
              All milestones complete!
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>
              {formatSats(earnedSats)} released to your wallet
            </div>
          </div>
        )}

        {/* Info strip */}
        <div className="fade-up d3 info-strip">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-3)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, marginTop: 2 }}
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
            This dashboard updates{" "}
            <strong style={{ color: "var(--text-2)" }}>in real-time</strong> via
            Socket.io. When the payer releases a milestone, you'll see it here
            instantly — no refresh needed. All data is verified on-chain via the
            Stacks API.
          </p>
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
.ms-card--done { opacity: 0.75; border-color: rgba(34,197,94,0.15); }
.ms-card--pending { border-color: rgba(255,255,255,0.15); background: var(--bg-2); }
.ms-card--flash { animation: flashGreen 2.5s ease; }
@keyframes flashGreen {
  0% { border-color: rgba(34,197,94,0.8); box-shadow: 0 0 0 2px rgba(34,197,94,0.2); background: rgba(34,197,94,0.05); }
  60% { border-color: rgba(34,197,94,0.4); box-shadow: 0 0 0 1px rgba(34,197,94,0.1); }
  100% { border-color: var(--border); box-shadow: none; background: var(--bg-1); }
}
.ms-index { width: 20px; height: 20px; border-radius: 50%; background: var(--bg-3); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 9px; font-family: var(--mono); color: var(--text-3); font-weight: 700; flex-shrink: 0; transition: all 0.3s; }
.ms-title { font-size: 13px; font-weight: 600; color: var(--text-1); }
.ms-condition { font-size: 11px; color: var(--text-3); line-height: 1.6; max-width: 420px; }
.ms-amount { font-size: 14px; font-weight: 700; color: var(--text-1); font-family: var(--mono); transition: color 0.3s; }
.ms-pct { font-size: 10px; color: var(--text-4); font-family: var(--mono); }
.ms-deadline { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-family: var(--mono); color: var(--text-4); }
.ms-status { font-size: 11px; font-family: var(--mono); font-weight: 600; }
.flash-badge { font-size: 9px; font-family: var(--mono); color: var(--green); background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.25); border-radius: 10px; padding: 2px 8px; animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
.info-strip { display: flex; gap: 10px; align-items: flex-start; background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--r-sm); padding: 12px 14px; }
.complete-banner { text-align: center; background: rgba(34,197,94,0.06); border: 1px solid rgba(34,197,94,0.2); border-radius: var(--r); padding: 28px 20px; }
.spinner { display: inline-block; border: 2px solid var(--bg-3); border-top-color: var(--green); border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
`;
