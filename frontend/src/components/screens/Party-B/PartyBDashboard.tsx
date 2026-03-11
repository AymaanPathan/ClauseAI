"use client";
// ============================================================
// components/partyB/PartyBDashboard.tsx — with Dispute Evidence
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { getSocket, joinAgreementRoom } from "@/lib/socket";
import { explorerTxUrl } from "@/lib/stacksConfig";
import { getPartyBAgreementIds } from "@/store/slices/partyBSlice";
import DisputeSubmitScreen from "@/components/screens/Shared/DisputeSubmitScreen";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────
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
  amountLocked?: string | null;
  terms?: Record<string, unknown>;
  createdAt?: string;
}

// ── Helpers ──────────────────────────────────────────────────
function statusColor(s: MsStatus) {
  if (s === "complete") return "var(--green)";
  if (s === "disputed") return "var(--amber)";
  if (s === "refunded" || s === "failed") return "#ef4444";
  if (s === "pending") return "var(--text-3)";
  return "var(--text-4)";
}
function statusLabel(s: MsStatus) {
  if (s === "complete") return "Released ✓";
  if (s === "disputed") return "In Dispute ⚑";
  if (s === "refunded") return "Refunded ↩";
  if (s === "failed") return "Tx Failed ✕";
  if (s === "pending") return "Confirming…";
  return "Awaiting Release";
}
function formatSats(sats: number): string {
  if (!sats) return "—";
  return `${(sats / 100_000_000).toFixed(8)} sBTC`;
}
function fundStateColor(s: string) {
  if (s === "locked") return "var(--amber)";
  if (s === "released") return "var(--green)";
  if (s === "disputed") return "#ef4444";
  return "var(--text-4)";
}
function fundStateLabel(s: string) {
  if (s === "locked") return "Active";
  if (s === "released") return "Complete";
  if (s === "disputed") return "Disputed";
  return "Pending";
}

// ── History Agreement Card ────────────────────────────────────
function HistoryCard({
  agreementId,
  walletAddress,
}: {
  agreementId: string;
  walletAddress: string;
}) {
  const [data, setData] = useState<AgreementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `${API_BASE}/api/agreement/${agreementId}/milestones`,
        );
        if (res.ok) setData(await res.json());
      } catch {
        /* ignore */
      }
      setLoading(false);
    }
    load();
  }, [agreementId]);

  if (loading) {
    return (
      <div className="hist-card" style={{ padding: "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="spinner" style={{ width: 12, height: 12 }} />
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--mono)",
              color: "var(--text-4)",
            }}
          >
            Loading #{agreementId}…
          </span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="hist-card" style={{ padding: "14px 18px", opacity: 0.5 }}>
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--mono)",
            color: "var(--text-4)",
          }}
        >
          #{agreementId} — not found
        </span>
      </div>
    );
  }

  const completedMs = data.milestones.filter((m) =>
    ["complete", "refunded"].includes(m.status),
  ).length;
  const progressPct =
    data.milestones.length > 0
      ? Math.round((completedMs / data.milestones.length) * 100)
      : 0;
  const payerName = (data.terms?.payer ??
    data.terms?.partyA ??
    data.partyA ??
    "Payer") as string;
  const displayAmount = data.amountLocked ?? String(data.totalAmountUsd);

  return (
    <div className="hist-card">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 18px",
          cursor: "pointer",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                color: "var(--text-4)",
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "2px 7px",
              }}
            >
              #{agreementId}
            </span>
            <span
              style={{
                fontSize: 9,
                fontFamily: "var(--mono)",
                fontWeight: 700,
                textTransform: "uppercase" as const,
                letterSpacing: "0.06em",
                color: fundStateColor(data.fundState),
                background: fundStateColor(data.fundState) + "15",
                border: `1px solid ${fundStateColor(data.fundState)}40`,
                borderRadius: 10,
                padding: "2px 8px",
              }}
            >
              {fundStateLabel(data.fundState)}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}
            >
              ← {payerName}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--text-3)",
                fontFamily: "var(--mono)",
              }}
            >
              ${displayAmount} USD
            </span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                color: "var(--text-4)",
                marginBottom: 4,
              }}
            >
              {completedMs}/{data.milestones.length} done
            </div>
            <div
              style={{
                height: 3,
                width: 72,
                background: "var(--bg-3)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: "var(--green)",
                  width: `${progressPct}%`,
                  minWidth: progressPct > 0 ? 3 : 0,
                  borderRadius: 2,
                }}
              />
            </div>
          </div>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-4)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 0.2s",
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "12px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {data.milestones.map((ms) => (
            <div
              key={ms.index}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: statusColor(ms.status) + "20",
                  border: `1px solid ${statusColor(ms.status)}40`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 8,
                  fontFamily: "var(--mono)",
                  fontWeight: 700,
                  color: statusColor(ms.status),
                }}
              >
                {ms.status === "complete" ? "✓" : ms.index + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-1)",
                  }}
                >
                  {ms.title}
                </div>
                {ms.condition && (
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-4)",
                      fontFamily: "var(--mono)",
                      marginTop: 1,
                    }}
                  >
                    {ms.condition.length > 55
                      ? ms.condition.slice(0, 55) + "…"
                      : ms.condition}
                  </div>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    color: "var(--text-3)",
                  }}
                >
                  ${ms.amountUsd} · {ms.percentage}%
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: "var(--mono)",
                    fontWeight: 700,
                    color: statusColor(ms.status),
                    background: statusColor(ms.status) + "15",
                    border: `1px solid ${statusColor(ms.status)}30`,
                    borderRadius: 4,
                    padding: "2px 7px",
                  }}
                >
                  {statusLabel(ms.status)}
                </span>
                {ms.txId && (
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
                    tx ↗
                  </a>
                )}
              </div>
            </div>
          ))}
          {data.fundState === "locked" && (
            <div style={{ marginTop: 8 }}>
              <a
                href={`/agreement/${agreementId}`}
                style={{
                  display: "inline-block",
                  fontSize: 12,
                  color: "var(--text-2)",
                  fontFamily: "var(--mono)",
                  textDecoration: "none",
                }}
              >
                Open Live Dashboard →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main PartyBDashboard ──────────────────────────────────────
export default function PartyBDashboard() {
  const { terms, amountLocked, walletAddress, agreementId } = useSelector(
    (s: RootState) => s.partyB,
  );
  const t = terms as any;
  const receiverName = t?.receiver ?? t?.partyB ?? "You";
  const payerName = t?.payer ?? t?.partyA ?? "Payer";
  const reduxAmount = amountLocked ?? t?.total_usd ?? t?.amount_usd;

  const [data, setData] = useState<AgreementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [historyIds, setHistoryIds] = useState<string[]>([]);

  // Track dispute form open/submitted state per milestone index
  const [disputeFormOpen, setDisputeFormOpen] = useState<
    Record<number, boolean>
  >({});
  const [disputeSubmitted, setDisputeSubmitted] = useState<
    Record<number, boolean>
  >({});

  useEffect(() => {
    setHistoryIds(getPartyBAgreementIds());
  }, []);

  const fetchData = useCallback(async () => {
    if (!agreementId) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/agreement/${agreementId}/milestones`,
      );
      if (res.ok) {
        const json = await res.json();
        if (json.milestones && json.milestones.length > 0) {
          setData(json);
          setLoading(false);
          return;
        }
      }
    } catch {
      /* fall through */
    }

    try {
      const res = await fetch(`${API_BASE}/api/agreement/${agreementId}`);
      if (res.ok) {
        const json = await res.json();
        let milestones: DbMilestone[] = [];
        if (t?.milestones && Array.isArray(t.milestones)) {
          milestones = t.milestones.map((ms: any, i: number) => ({
            index: i,
            title: ms.title ?? `Milestone ${i + 1}`,
            percentage: ms.percentage ?? 0,
            condition: ms.condition ?? "",
            deadline: ms.deadline,
            amountUsd: ms.amountUsd ?? "0",
            amountSats: ms.amountSats ?? 0,
            status: "locked" as MsStatus,
          }));
        }
        setData({
          agreementId,
          milestones,
          fundState: json.fundState ?? "locked",
          totalAmountUsd: parseFloat(json.amountLocked ?? reduxAmount ?? "0"),
          totalAmountSats: 0,
          partyA: json.partyA ?? null,
          partyB: json.partyB ?? null,
          arbitrator: null,
          amountLocked: json.amountLocked ?? reduxAmount,
        });
      }
    } catch {
      /* nothing */
    }
    setLoading(false);
  }, [agreementId, reduxAmount, t]);

  useEffect(() => {
    fetchData();
    const quickRetry = setTimeout(fetchData, 2000);
    const interval = setInterval(fetchData, 10_000);
    return () => {
      clearTimeout(quickRetry);
      clearInterval(interval);
    };
  }, [fetchData]);

  // Socket.io
  useEffect(() => {
    if (!agreementId) return;
    const socket = getSocket();
    joinAgreementRoom(agreementId);
    if (socket.connected) setConnected(true);
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    function onMilestoneUpdated(payload: any) {
      if (payload.milestones && payload.milestones.length > 0) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                milestones: payload.milestones,
                fundState: payload.allComplete ? "released" : prev.fundState,
              }
            : prev,
        );
      } else {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            milestones: prev.milestones.map((ms) =>
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
            ),
            fundState: payload.allComplete ? "released" : prev.fundState,
          };
        });
      }
      setLastUpdate(new Date());
      setFlashIndex(payload.milestoneIndex);
      setTimeout(() => setFlashIndex(null), 2500);
    }

    socket.on("milestone:updated", onMilestoneUpdated);
    socket.on("funds:locked", () => setTimeout(fetchData, 1000));
    socket.on("presence:updated", fetchData);

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("milestone:updated", onMilestoneUpdated);
      socket.off("funds:locked");
      socket.off("presence:updated");
    };
  }, [agreementId, fetchData]);

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
    .reduce((s, m) => s + m.amountSats, 0);
  const displayAmount =
    data?.amountLocked ??
    reduxAmount ??
    data?.totalAmountUsd?.toString() ??
    "—";
  const displayPayer = data?.partyA
    ? `${data.partyA.slice(0, 10)}…`
    : payerName;

  return (
    <div className="page" style={{ alignItems: "flex-start", paddingTop: 48 }}>
      <style>{css}</style>
      <div style={{ maxWidth: 680, width: "100%" }}>
        {/* Header */}
        <div className="fade-up" style={{ marginBottom: 28 }}>
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
              <div
                className={`status-pill${connected ? "" : " status-pill--offline"}`}
              >
                <div
                  className={`status-dot${connected ? "" : " status-dot--offline"}`}
                />
                {connected ? "Live" : "Reconnecting…"}
              </div>
              {lastUpdate && (
                <span className="mono-label" style={{ fontSize: 9 }}>
                  Updated {lastUpdate.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>

          {historyIds.length > 1 && (
            <div className="tabs">
              <button
                className={`tab${activeTab === "current" ? " tab--active" : ""}`}
                onClick={() => setActiveTab("current")}
              >
                Current Agreement
              </button>
              <button
                className={`tab${activeTab === "history" ? " tab--active" : ""}`}
                onClick={() => setActiveTab("history")}
              >
                History
                <span className="tab-badge">{historyIds.length}</span>
              </button>
            </div>
          )}
        </div>

        {/* ── HISTORY TAB ── */}
        {activeTab === "history" && (
          <div className="fade-up">
            <div className="mono-label" style={{ marginBottom: 12 }}>
              All agreements you've joined on this device
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {historyIds.map((id) => (
                <HistoryCard
                  key={id}
                  agreementId={id}
                  walletAddress={walletAddress ?? ""}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── CURRENT TAB ── */}
        {activeTab === "current" && (
          <>
            {/* Summary cards */}
            <div
              className="fade-up d1 summary-grid"
              style={{ marginBottom: 24 }}
            >
              {[
                {
                  label: "Total Locked",
                  value:
                    totalSats > 0 ? formatSats(totalSats) : `$${displayAmount}`,
                  sub:
                    totalSats > 0
                      ? `≈ $${displayAmount} USD`
                      : "USD locked in escrow",
                },
                {
                  label: "Your Role",
                  value: receiverName,
                  sub: walletAddress
                    ? `${walletAddress.slice(0, 10)}…`
                    : "Receiver",
                },
                {
                  label: "Earned",
                  value: earnedSats > 0 ? formatSats(earnedSats) : "—",
                  sub: `${completedCount} milestone${completedCount !== 1 ? "s" : ""} released`,
                },
                { label: "Payer", value: displayPayer, sub: "locked funds" },
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
                  {milestones.length > 0
                    ? `${completedCount}/${milestones.length} milestones · ${progressPct}%`
                    : "Waiting for milestone data…"}
                </span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${progressPct > 0 ? progressPct : 2}%` }}
                />
              </div>
            </div>

            {loading && (
              <div
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
                Loading…
              </div>
            )}

            {!loading && milestones.length === 0 && (
              <div
                className="fade-up d2 waiting-card"
                style={{ marginBottom: 24 }}
              >
                <div className="waiting-icon">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-3)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-1)",
                      marginBottom: 4,
                    }}
                  >
                    Waiting for milestone details
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-3)",
                      lineHeight: 1.6,
                    }}
                  >
                    Funds are locked. Milestone details appear once the payer
                    opens their dashboard. Auto-refreshes every 10s.
                  </div>
                </div>
              </div>
            )}

            {/* Milestone cards */}
            {!loading && milestones.length > 0 && (
              <div className="fade-up d2" style={{ marginBottom: 24 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <span className="mono-label">Milestones</span>
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {milestones.map((ms) => {
                    const isDone =
                      ms.status === "complete" || ms.status === "refunded";
                    const isPending = ms.status === "pending";
                    const isDisputed = ms.status === "disputed";
                    const isFlashing = flashIndex === ms.index;
                    const showSubmitForm =
                      isDisputed && disputeFormOpen[ms.index];
                    const alreadySubmitted = disputeSubmitted[ms.index];

                    return (
                      <div key={ms.index}>
                        <div
                          className={`ms-card${isDone ? " ms-card--done" : ""}${isPending ? " ms-card--pending" : ""}${isDisputed ? " ms-card--disputed" : ""}${isFlashing ? " ms-card--flash" : ""}`}
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
                                  <span className="flash-badge">
                                    Just updated!
                                  </span>
                                )}
                              </div>
                              {ms.condition && (
                                <div className="ms-condition">
                                  {ms.condition}
                                </div>
                              )}
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
                                {ms.amountSats > 0
                                  ? formatSats(ms.amountSats)
                                  : `$${ms.amountUsd}`}
                              </div>
                              <div className="ms-pct">
                                {ms.percentage}%
                                {ms.amountUsd !== "0"
                                  ? ` · ≈ $${ms.amountUsd}`
                                  : ""}
                              </div>
                            </div>
                          </div>

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

                          {ms.completedAt && (
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 10,
                                fontFamily: "var(--mono)",
                                color: "var(--text-4)",
                              }}
                            >
                              Released:{" "}
                              {new Date(ms.completedAt).toLocaleString()}
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
                              style={{ color: statusColor(ms.status) }}
                            >
                              {statusLabel(ms.status)}
                            </span>

                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              {/* Disputed: submit evidence button */}
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
                              {isDisputed &&
                                !alreadySubmitted &&
                                !showSubmitForm && (
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
                        </div>

                        {/* ── Dispute submit form (inline below card) ── */}
                        {showSubmitForm && agreementId && (
                          <div className="dispute-form-wrap fade-in">
                            <DisputeSubmitScreen
                              agreementId={agreementId}
                              milestoneIndex={ms.index}
                              party="B"
                              milestoneDescription={ms.condition || ms.title}
                              contractTerms={{
                                // ← ADD THIS
                                payer: data?.partyA ?? "",
                                receiver: data?.partyB ?? walletAddress ?? "",
                                arbitrator:
                                  data?.arbitrator ??
                                  (data?.terms?.arbitrator as string) ??
                                  "TBD",
                                total_amount: data?.totalAmountUsd ?? 0,
                                milestone_description: ms.condition || ms.title,
                                milestone_percentage: ms.percentage,
                                milestone_deadline: ms.deadline || undefined,
                                agreement_type:
                                  (data?.terms?.agreement_type as string) ??
                                  "freelance",
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
            )}

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
                Updates push{" "}
                <strong style={{ color: "var(--text-2)" }}>instantly</strong>{" "}
                via Socket.io. If a milestone is disputed, click{" "}
                <strong style={{ color: "var(--text-2)" }}>
                  Submit Evidence
                </strong>{" "}
                to present your case to the arbitrator.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const css = `
.page-title { font-size: clamp(24px, 3.5vw, 36px); font-weight: 700; letter-spacing: -0.04em; line-height: 1.05; margin: 0; }
.mono-label { font-size: 10px; font-family: var(--mono); color: var(--text-4); text-transform: uppercase; letter-spacing: 0.1em; }
.status-pill { display: flex; align-items: center; gap: 7px; font-size: 11px; font-family: var(--mono); color: var(--green); background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: 20px; padding: 5px 12px; }
.status-pill--offline { color: var(--text-3); background: var(--bg-2); border-color: var(--border); }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: pulse 2s ease-in-out infinite; }
.status-dot--offline { background: var(--text-4); animation: none; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.tabs { display: flex; gap: 4; margin-top: 16px; background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--r-sm); padding: 4px; width: fit-content; }
.tab { background: none; border: none; padding: 6px 16px; font-size: 12px; font-family: var(--mono); color: var(--text-3); cursor: pointer; border-radius: 4px; display: flex; align-items: center; gap: 7px; transition: all 0.15s; }
.tab:hover { color: var(--text-1); }
.tab--active { background: var(--bg-3); color: var(--text-1); font-weight: 600; border: 1px solid var(--border); }
.tab-badge { font-size: 9px; background: var(--bg-1); border: 1px solid var(--border); border-radius: 10px; padding: 1px 6px; color: var(--text-4); }
.hist-card { background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--r); overflow: hidden; transition: border-color 0.2s; }
.hist-card:hover { border-color: var(--border-hi); }
.summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
@media (max-width: 640px) { .summary-grid { grid-template-columns: 1fr 1fr; } }
.summary-card { background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--r-sm); padding: 14px 16px; }
.summary-label { font-size: 9px; font-family: var(--mono); color: var(--text-4); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px; }
.summary-value { font-size: 13px; font-weight: 700; color: var(--text-1); letter-spacing: -0.02em; margin-bottom: 3px; word-break: break-all; }
.summary-sub { font-size: 10px; font-family: var(--mono); color: var(--text-4); }
.progress-track { height: 4px; background: var(--bg-3); border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--green); border-radius: 2px; transition: width 0.6s ease; min-width: 4px; }
.ms-card { background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--r); padding: 16px 18px; transition: border-color 0.3s, box-shadow 0.3s, background 0.3s; }
.ms-card--done { opacity: 0.75; border-color: rgba(34,197,94,0.15); }
.ms-card--pending { border-color: rgba(255,255,255,0.15); background: var(--bg-2); }
.ms-card--disputed { border-color: rgba(245,158,11,0.35); background: rgba(245,158,11,0.03); border-radius: var(--r) var(--r) 0 0; }
.ms-card--flash { animation: flashGreen 2.5s ease; }
@keyframes flashGreen { 0% { border-color: rgba(34,197,94,0.8); box-shadow: 0 0 0 3px rgba(34,197,94,0.15); background: rgba(34,197,94,0.05); } 60% { border-color: rgba(34,197,94,0.4); } 100% { border-color: rgba(34,197,94,0.15); box-shadow: none; background: var(--bg-1); } }
.ms-index { width: 20px; height: 20px; border-radius: 50%; background: var(--bg-3); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 9px; font-family: var(--mono); color: var(--text-3); font-weight: 700; flex-shrink: 0; transition: all 0.3s; }
.ms-title { font-size: 13px; font-weight: 600; color: var(--text-1); }
.ms-condition { font-size: 11px; color: var(--text-3); line-height: 1.6; max-width: 420px; }
.ms-amount { font-size: 14px; font-weight: 700; color: var(--text-1); font-family: var(--mono); transition: color 0.3s; }
.ms-pct { font-size: 10px; color: var(--text-4); font-family: var(--mono); }
.ms-status { font-size: 11px; font-family: var(--mono); font-weight: 600; }
.flash-badge { font-size: 9px; font-family: var(--mono); color: var(--green); background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.25); border-radius: 10px; padding: 2px 8px; }
.action-btn { padding: 5px 12px; border-radius: var(--r-xs); font-size: 11px; font-family: var(--mono); cursor: pointer; border: 1px solid; transition: all 0.15s; display: flex; align-items: center; gap: 5px; background: none; }
.action-btn--evidence { background: rgba(96,165,250,0.08); border-color: rgba(96,165,250,0.3); color: #60a5fa; }
.action-btn--evidence:hover { background: rgba(96,165,250,0.15); border-color: rgba(96,165,250,0.5); }
.submitted-badge { font-size: 10px; font-family: var(--mono); color: var(--green); background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: var(--r-xs); padding: 4px 10px; }
.dispute-form-wrap { border: 1px solid rgba(245,158,11,0.2); border-top: none; border-radius: 0 0 var(--r) var(--r); background: rgba(245,158,11,0.02); overflow: hidden; }
.info-strip { display: flex; gap: 10px; align-items: flex-start; background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--r-sm); padding: 12px 14px; }
.complete-banner { text-align: center; background: rgba(34,197,94,0.06); border: 1px solid rgba(34,197,94,0.2); border-radius: var(--r); padding: 28px 20px; }
.waiting-card { display: flex; gap: 14px; align-items: flex-start; background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--r); padding: 18px 20px; }
.waiting-icon { width: 36px; height: 36px; border-radius: 50%; background: var(--bg-3); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
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
