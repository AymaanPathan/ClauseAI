"use client";
// ============================================================
// components/partyB/PartyBDashboard.tsx — 2026 redesign
// Uses ONLY class names from globals.css + dashboard-additions.css
//
// Change from original:
//   • DisputeSubmitScreen now opens in a fixed modal overlay
//     instead of an inline db-submit-panel.
//   • Removed: disputeFormOpen state, db-submit-panel block.
//   • Added: disputeModalMs state, DisputeModal component.
//   • Everything else is byte-for-byte identical.
// ============================================================

import { useEffect, useState, useCallback, useRef } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import {
  getSocket,
  joinAgreementRoom,
  joinDisputeRoom,
  leaveDisputeRoom,
} from "@/lib/socket";
import { explorerTxUrl } from "@/lib/stacksConfig";
import { getPartyBAgreementIds } from "@/store/slices/partyBSlice";
import DisputeSubmitScreen from "@/components/screens/Shared/DisputeSubmitScreen";
import DisputeDetailView from "../Shared/Disputedetailview";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

function statusColor(s: MsStatus) {
  if (s === "complete") return "var(--green)";
  if (s === "disputed") return "var(--amber)";
  if (s === "refunded" || s === "failed") return "var(--red)";
  if (s === "pending") return "var(--text-3)";
  return "var(--text-4)";
}
function statusLabel(s: MsStatus) {
  if (s === "complete") return "Released";
  if (s === "disputed") return "In Dispute";
  if (s === "refunded") return "Refunded";
  if (s === "failed") return "Failed";
  if (s === "pending") return "Confirming";
  return "Locked";
}
function formatSats(sats: number): string {
  if (!sats) return "—";
  return `${(sats / 100_000_000).toFixed(8)} sBTC`;
}
function fundStateLabel(s: string) {
  if (s === "locked") return "Active";
  if (s === "released") return "Complete";
  if (s === "disputed") return "Disputed";
  return "Pending";
}

const OPEN_DISPUTE_STATUSES = new Set([
  "awaiting_statements",
  "party_a_submitted",
  "party_b_submitted",
  "ai_pending",
  "ai_complete",
]);

// ── Dispute Modal ─────────────────────────────────────────────

interface DisputeModalProps {
  ms: DbMilestone;
  agreementId: string;
  data: AgreementData;
  walletAddress: string;
  onClose: () => void;
  onSubmitted: () => void;
}

function DisputeModal({
  ms,
  agreementId,
  data,
  walletAddress,
  onClose,
  onSubmitted,
}: DisputeModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const contractTerms = {
    payer: data.partyA ?? "",
    receiver: data.partyB ?? walletAddress ?? "",
    arbitrator: data.arbitrator ?? (data.terms?.arbitrator as string) ?? "TBD",
    total_amount: data.totalAmountUsd ?? 0,
    milestone_description: ms.condition || ms.title,
    milestone_percentage: ms.percentage,
    milestone_deadline: ms.deadline || undefined,
    agreement_type: (data.terms?.agreement_type as string) ?? "freelance",
  };

  return (
    <>
      <style>{`
        .pbd-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(5,5,7,0.82);
          backdrop-filter: blur(20px) saturate(1.4);
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
          animation: pbdFadeIn 0.18s ease both;
        }
        @keyframes pbdFadeIn { from { opacity: 0 } to { opacity: 1 } }

        .pbd-sheet {
          width: 100%; max-width: 640px; max-height: 90vh;
          background: var(--bg-1); border: 1px solid var(--border-hi);
          border-radius: 20px; overflow: hidden;
          display: flex; flex-direction: column;
          box-shadow: 0 48px 96px rgba(0,0,0,0.72),
                      inset 0 0 0 1px rgba(255,255,255,0.04);
          animation: pbdSlideUp 0.28s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes pbdSlideUp {
          from { opacity: 0; transform: translateY(28px) scale(0.97) }
          to   { opacity: 1; transform: translateY(0)    scale(1)    }
        }

        .pbd-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 24px; flex-shrink: 0;
          background: var(--bg-2); border-bottom: 1px solid var(--border);
        }
        .pbd-header-left { display: flex; align-items: center; gap: 14px; }
        .pbd-header-icon {
          width: 40px; height: 40px; border-radius: 11px; flex-shrink: 0;
          background: rgba(251,191,36,0.10); border: 1px solid rgba(251,191,36,0.26);
          display: flex; align-items: center; justify-content: center;
        }
        .pbd-header-eyebrow {
          font-size: 10px; font-family: var(--mono); font-weight: 600;
          color: var(--amber); text-transform: uppercase; letter-spacing: 0.10em;
          margin-bottom: 3px;
        }
        .pbd-header-title {
          font-family: var(--font-display); font-size: 16px; font-weight: 700;
          color: var(--text-1); letter-spacing: -0.03em;
        }
        .pbd-close-btn {
          width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
          background: var(--bg-3); border: 1px solid var(--border);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: var(--text-4);
          transition: background 0.14s, border-color 0.14s, color 0.14s;
          font-family: var(--font);
        }
        .pbd-close-btn:hover {
          background: var(--bg-4); border-color: var(--border-hi); color: var(--text-1);
        }
        .pbd-body {
          flex: 1; overflow-y: auto; padding: 24px;
        }
        .pbd-body::-webkit-scrollbar { width: 4px; }
        .pbd-body::-webkit-scrollbar-thumb { background: var(--bg-5); border-radius: 2px; }
      `}</style>

      <div
        ref={overlayRef}
        className="pbd-overlay"
        onClick={(e) => {
          if (e.target === overlayRef.current) onClose();
        }}
      >
        <div className="pbd-sheet" role="dialog" aria-modal="true">
          {/* Header */}
          <div className="pbd-header">
            <div className="pbd-header-left">
              <div className="pbd-header-icon">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--amber)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <div className="pbd-header-eyebrow">
                  File Evidence · Dispute
                </div>
                <div className="pbd-header-title">{ms.title}</div>
              </div>
            </div>
            <button
              className="pbd-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <svg
                width="12"
                height="12"
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

          {/* Body */}
          <div className="pbd-body">
            <DisputeSubmitScreen
              agreementId={agreementId}
              milestoneIndex={ms.index}
              party="B"
              milestoneDescription={ms.condition || ms.title}
              contractTerms={contractTerms}
              onSubmitted={() => {
                onSubmitted();
                onClose();
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

// ── History Card ──────────────────────────────────────────────

function HistoryCard({ agreementId }: { agreementId: string }) {
  const [data, setData] = useState<AgreementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/agreement/${agreementId}/milestones`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [agreementId]);

  if (loading)
    return (
      <div className="db-hist-row">
        <span className="spinner" style={{ width: 10, height: 10 }} />
        <span className="db-hist-id">#{agreementId}</span>
      </div>
    );
  if (!data)
    return (
      <div className="db-hist-row" style={{ opacity: 0.4 }}>
        <span className="db-hist-id">#{agreementId}</span>
        <span className="label" style={{ marginLeft: 6 }}>
          not found
        </span>
      </div>
    );

  const completedMs = data.milestones.filter((m) =>
    ["complete", "refunded"].includes(m.status),
  ).length;
  const pct =
    data.milestones.length > 0
      ? Math.round((completedMs / data.milestones.length) * 100)
      : 0;
  const payerName = (data.terms?.payer ??
    data.terms?.partyA ??
    data.partyA ??
    "Payer") as string;
  const displayAmt = data.amountLocked ?? String(data.totalAmountUsd);

  return (
    <div
      className={`db-hist-row${expanded ? " db-hist-row--open" : ""}`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Left */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flex: 1,
          minWidth: 0,
        }}
      >
        <span className="db-hist-id">#{agreementId}</span>
        <div style={{ minWidth: 0 }}>
          <div className="db-hist-payer">← {payerName}</div>
          <div className="db-hist-amount">${displayAmt} USD</div>
        </div>
      </div>
      {/* Right */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexShrink: 0,
        }}
      >
        <div className="db-hist-bar-wrap">
          <div className="db-hist-bar-label">
            {completedMs}/{data.milestones.length}
          </div>
          <div className="db-hist-bar">
            <div
              className="db-hist-bar-fill"
              style={{
                width: `${pct}%`,
                background: pct === 100 ? "var(--green)" : "var(--text-3)",
              }}
            />
          </div>
        </div>
        <span className={`state-tag state-tag--${data.fundState}`}>
          {fundStateLabel(data.fundState)}
        </span>
        <svg
          className={`db-hist-chevron${expanded ? " db-hist-chevron--open" : ""}`}
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="db-hist-expanded" onClick={(e) => e.stopPropagation()}>
          {data.milestones.map((ms) => (
            <div key={ms.index} className="db-hist-ms">
              <div
                className="db-hist-ms-dot"
                style={{
                  color: statusColor(ms.status),
                  background: statusColor(ms.status) + "15",
                  borderColor: statusColor(ms.status) + "35",
                }}
              >
                {ms.status === "complete" ? "✓" : ms.index + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="db-hist-ms-title">{ms.title}</div>
                {ms.condition && (
                  <div className="db-hist-ms-cond">
                    {ms.condition.length > 60
                      ? ms.condition.slice(0, 60) + "…"
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
                <span className="db-hist-ms-amt">${ms.amountUsd}</span>
                <span
                  className="ms-status-pill"
                  style={{
                    color: statusColor(ms.status),
                    background: statusColor(ms.status) + "10",
                    borderColor: statusColor(ms.status) + "28",
                  }}
                >
                  {statusLabel(ms.status)}
                </span>
                {ms.txId && (
                  <a
                    href={ms.txUrl ?? explorerTxUrl(ms.txId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="db-ms-tx-link"
                  >
                    tx ↗
                  </a>
                )}
              </div>
            </div>
          ))}
          {data.fundState !== "released" && (
            <a href={`/agreement/${agreementId}`} className="db-hist-open-link">
              {data.fundState === "locked"
                ? "Open Live Dashboard →"
                : "Resume Agreement →"}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────

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

  // Replaces disputeFormOpen — stores which ms is open in the modal (null = closed)
  const [disputeModalMs, setDisputeModalMs] = useState<DbMilestone | null>(
    null,
  );
  const [disputeSubmitted, setDisputeSubmitted] = useState<
    Record<number, boolean>
  >({});
  const joinedDisputeRooms = useState<Set<number>>(() => new Set())[0];

  useEffect(() => {
    setHistoryIds(getPartyBAgreementIds());
  }, []);

  const markMilestoneDisputed = useCallback((milestoneIndex: number) => {
    setData((prev) => {
      if (!prev) return prev;
      const already = prev.milestones.find((m) => m.index === milestoneIndex);
      if (!already || already.status === "disputed") return prev;
      return {
        ...prev,
        milestones: prev.milestones.map((ms) =>
          ms.index === milestoneIndex
            ? { ...ms, status: "disputed" as MsStatus }
            : ms,
        ),
      };
    });
  }, []);

  const checkArbitrateDisputes = useCallback(
    async (milestones: DbMilestone[]) => {
      if (!agreementId) return;
      await Promise.all(
        milestones.map(async (ms) => {
          try {
            const res = await fetch(
              `${API_BASE}/api/arbitrate/${agreementId}/${ms.index}`,
            );
            if (!res.ok) return;
            const json = await res.json();
            if (json.dispute && OPEN_DISPUTE_STATUSES.has(json.dispute.status))
              markMilestoneDisputed(ms.index);
          } catch {
            /* ignore */
          }
        }),
      );
    },
    [agreementId, markMilestoneDisputed],
  );

  const fetchData = useCallback(async () => {
    if (!agreementId) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/agreement/${agreementId}/milestones`,
      );
      if (res.ok) {
        const json = await res.json();
        if (json.milestones?.length > 0) {
          setData(json);
          setLoading(false);
          checkArbitrateDisputes(json.milestones);
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
        if (milestones.length > 0) checkArbitrateDisputes(milestones);
      }
    } catch {
      /* nothing */
    }
    setLoading(false);
  }, [agreementId, reduxAmount, t, checkArbitrateDisputes]);

  useEffect(() => {
    fetchData();
    const q = setTimeout(fetchData, 2000);
    const iv = setInterval(fetchData, 10_000);
    return () => {
      clearTimeout(q);
      clearInterval(iv);
    };
  }, [fetchData]);

  useEffect(() => {
    if (!agreementId) return;
    const socket = getSocket();
    joinAgreementRoom(agreementId);
    if (socket.connected) setConnected(true);
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    function onMilestoneUpdated(payload: any) {
      if (payload.milestones?.length > 0) {
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

    function onDisputeUpdated(payload: any) {
      if (payload.agreement_id && payload.agreement_id !== agreementId) return;
      const idx: number = payload.milestone_index;
      if (idx === undefined || idx === null) return;
      markMilestoneDisputed(idx);
      setLastUpdate(new Date());
      setFlashIndex(idx);
      setTimeout(() => setFlashIndex(null), 2500);
      if (!joinedDisputeRooms.has(idx)) {
        joinDisputeRoom(agreementId!, idx);
        joinedDisputeRooms.add(idx);
      }
    }

    socket.on("milestone:updated", onMilestoneUpdated);
    socket.on("dispute:updated", onDisputeUpdated);
    socket.on("funds:locked", () => setTimeout(fetchData, 1000));
    socket.on("presence:updated", fetchData);

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("milestone:updated", onMilestoneUpdated);
      socket.off("dispute:updated", onDisputeUpdated);
      socket.off("funds:locked");
      socket.off("presence:updated");
      joinedDisputeRooms.forEach((idx) => leaveDisputeRoom(agreementId, idx));
    };
  }, [agreementId, fetchData, markMilestoneDisputed, joinedDisputeRooms]);

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
    ? `${data.partyA.slice(0, 8)}…${data.partyA.slice(-4)}`
    : payerName;

  const statsCards = [
    {
      label: "Total Locked",
      value: totalSats > 0 ? formatSats(totalSats) : `$${displayAmount}`,
      sub: totalSats > 0 ? `≈ $${displayAmount} USD` : "USD in escrow",
      icon: "◈",
    },
    {
      label: "Your Role",
      value: receiverName,
      sub: walletAddress
        ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-4)}`
        : "Receiver",
      icon: "◉",
    },
    {
      label: "Earned",
      value: earnedSats > 0 ? formatSats(earnedSats) : "—",
      sub: `${completedCount} milestone${completedCount !== 1 ? "s" : ""} released`,
      icon: "◈",
    },
    { label: "Payer", value: displayPayer, sub: "counterparty", icon: "◎" },
  ];

  return (
    <div>
      {/* ── Topbar ── */}
      <div className="db-topbar">
        <div className="db-topbar-left">
          <a
            className="db-brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              const id = agreementId;
              if (id) {
                localStorage.removeItem(`pB_screen_${id}`);
                localStorage.removeItem(`pB_fundsLocked_${id}`);
                localStorage.removeItem(`pB_amountLocked_${id}`);
                localStorage.removeItem(`pB_wallet_${id}`);
              }
              localStorage.removeItem("pB_agreementId");
              localStorage.removeItem("pA_screen");
              localStorage.removeItem("pA_agreementId");
              window.location.href = "/";
            }}
          >
            <span className="db-brand-mark">◈</span>
            <span className="db-brand-name">ClauseAI</span>
          </a>
          <div className="db-topbar-sep" />
          <nav className="db-breadcrumb">
            <span>Agreement</span>
            <span className="db-breadcrumb-sep">/</span>
            <span>#{agreementId}</span>
            <span className="db-breadcrumb-sep">/</span>
            <span className="db-breadcrumb-cur">Party B</span>
          </nav>
        </div>
        <div className="db-topbar-right">
          {lastUpdate && (
            <span className="db-timestamp">
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <div
            className={`db-live-badge${connected ? "" : " db-live-badge--off"}`}
          >
            <span
              className={`db-live-dot${connected ? "" : " db-live-dot--off"}`}
            />
            {connected ? "Live" : "Reconnecting"}
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
              <button
                className={`db-nav-item${activeTab === "current" ? " db-nav-item--active" : ""}`}
                onClick={() => setActiveTab("current")}
              >
                <span className="db-nav-icon">▣</span> Dashboard
              </button>
              <button
                className={`db-nav-item${activeTab === "history" ? " db-nav-item--active" : ""}`}
                onClick={() => setActiveTab("history")}
              >
                <span className="db-nav-icon">◫</span> History
                {historyIds.length > 0 && (
                  <span className="db-nav-badge">{historyIds.length}</span>
                )}
              </button>
            </nav>
          </div>

          <div className="db-sidebar-section">
            <div className="db-sidebar-label">Agreement</div>
            <div className="db-meta-list">
              <div className="db-meta-row">
                <span className="db-meta-key">Status</span>
                <span
                  className={`state-tag state-tag--${data?.fundState ?? "idle"}`}
                >
                  {fundStateLabel(data?.fundState ?? "idle")}
                </span>
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
              {data?.arbitrator && (
                <div className="db-meta-row">
                  <span className="db-meta-key">Arbitrator</span>
                  <span className="db-meta-val">
                    {data.arbitrator.slice(0, 8)}…
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Progress ring */}
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
                stroke={progressPct === 100 ? "var(--green)" : "var(--amber)"}
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
            <div className="db-ring-label">Overall</div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="db-main">
          {/* ── HISTORY TAB ── */}
          {activeTab === "history" && (
            <div className="fade-up">
              <div className="db-page-header" style={{ marginBottom: 0 }}>
                <div>
                  <div className="db-eyebrow">Transaction History</div>
                  <h1 className="db-page-title">All Agreements</h1>
                </div>
              </div>
              <div className="db-hist-list" style={{ marginTop: 24 }}>
                {historyIds.map((id) => (
                  <HistoryCard key={id} agreementId={id} />
                ))}
                {historyIds.length === 0 && (
                  <div className="db-loading">
                    <span className="db-loading-text">No agreements yet.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── CURRENT TAB ── */}
          {activeTab === "current" && (
            <>
              {/* Page header */}
              <div className="db-page-header fade-up">
                <div>
                  <div className="db-eyebrow">Receiver Dashboard</div>
                  <h1 className="db-page-title">Your Dashboard</h1>
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

              {/* Stats grid */}
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

              {/* Progress bar */}
              <div className="db-progress-wrap fade-up d2">
                <div className="db-progress-header">
                  <span className="label">Completion</span>
                  <span className="label">
                    {milestones.length > 0
                      ? `${completedCount} of ${milestones.length} milestones`
                      : "Awaiting data"}
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

              {/* Loading */}
              {loading && (
                <div className="db-loading fade-in">
                  <span className="spinner" style={{ width: 16, height: 16 }} />
                  <span className="db-loading-text">
                    Fetching milestone data…
                  </span>
                </div>
              )}

              {/* Empty state */}
              {!loading && milestones.length === 0 && (
                <div className="db-empty-state fade-up d3">
                  <div className="db-empty-icon">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div>
                    <div className="db-empty-title">
                      Awaiting milestone data
                    </div>
                    <div className="db-empty-body">
                      Funds are locked. Details appear once the payer opens
                      their dashboard.
                    </div>
                  </div>
                </div>
              )}

              {/* Milestones */}
              {!loading && milestones.length > 0 && (
                <div className="fade-up d3">
                  <div className="db-section-head">
                    <span className="label">Milestones</span>
                    <span className="db-section-count">
                      {milestones.length} total
                    </span>
                  </div>
                  <div className="db-ms-list">
                    {milestones.map((ms) => {
                      const isDone =
                        ms.status === "complete" || ms.status === "refunded";
                      const isPending = ms.status === "pending";
                      const isDisputed = ms.status === "disputed";
                      const isFlashing = flashIndex === ms.index;
                      const alreadySub = disputeSubmitted[ms.index];

                      return (
                        <div key={ms.index} className="db-ms-block">
                          <div
                            className={[
                              "db-ms-row",
                              isDone ? "db-ms-row--done" : "",
                              isPending ? "db-ms-row--pending" : "",
                              isDisputed ? "db-ms-row--disputed" : "",
                              isFlashing ? "db-ms-row--flash" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {/* Index dot */}
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

                            {/* Info */}
                            <div className="db-ms-info">
                              <div className="db-ms-title-row">
                                <span className="db-ms-title">{ms.title}</span>
                                {isDisputed && (
                                  <span className="db-dispute-chip">
                                    ⚑ Dispute
                                  </span>
                                )}
                                {isFlashing && !isDisputed && (
                                  <span className="db-flash-chip">Updated</span>
                                )}
                              </div>
                              {ms.condition && (
                                <div className="db-ms-condition">
                                  {ms.condition}
                                </div>
                              )}
                              {ms.deadline && (
                                <div className="db-ms-deadline">
                                  ⏱ {ms.deadline}
                                </div>
                              )}
                              {ms.txId && (
                                <div className="db-ms-tx">
                                  <span className="db-ms-tx-label">TX</span>
                                  <a
                                    href={ms.txUrl ?? explorerTxUrl(ms.txId)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="db-ms-tx-link"
                                  >
                                    {ms.txId.slice(0, 12)}… ↗
                                  </a>
                                  {isPending && (
                                    <span
                                      className="spinner"
                                      style={{ width: 8, height: 8 }}
                                    />
                                  )}
                                </div>
                              )}
                              {ms.completedAt && (
                                <div className="db-ms-released">
                                  Released{" "}
                                  {new Date(ms.completedAt).toLocaleString()}
                                </div>
                              )}
                            </div>

                            {/* Right */}
                            <div className="db-ms-right">
                              <div>
                                <div
                                  className={`db-ms-amount${isDone ? " db-ms-amount--done" : ""}`}
                                >
                                  {ms.amountSats > 0
                                    ? formatSats(ms.amountSats)
                                    : `$${ms.amountUsd}`}
                                </div>
                                <div className="db-ms-pct">
                                  {ms.percentage}%
                                </div>
                              </div>
                              <div className="db-ms-actions">
                                <span
                                  className="ms-status-pill"
                                  style={{
                                    color: statusColor(ms.status),
                                    background: statusColor(ms.status) + "10",
                                    borderColor: statusColor(ms.status) + "28",
                                  }}
                                >
                                  {statusLabel(ms.status)}
                                </span>

                                {/* Evidence — opens modal instead of inline form */}
                                {isDisputed && !alreadySub && (
                                  <button
                                    className="db-btn db-btn--evidence"
                                    onClick={() => setDisputeModalMs(ms)}
                                  >
                                    📄 Evidence
                                  </button>
                                )}
                                {isDisputed && alreadySub && (
                                  <span className="db-submitted-badge">
                                    ✓ Filed
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Dispute detail panel — unchanged */}
                          {isDisputed && agreementId && (
                            <div className="db-dispute-panel">
                              <DisputeDetailView
                                agreementId={agreementId}
                                milestoneIndex={ms.index}
                                viewerRole="B"
                              />
                            </div>
                          )}

                          {/* db-submit-panel removed — DisputeSubmitScreen now in modal */}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Complete banner */}
              {progressPct === 100 && milestones.length > 0 && (
                <div className="db-complete-banner fade-up">
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "var(--text-1)",
                      letterSpacing: "-0.03em",
                      marginBottom: 4,
                    }}
                  >
                    All milestones complete
                  </div>
                  <div
                    className="label"
                    style={{
                      textTransform: "none",
                      letterSpacing: 0,
                      fontSize: 11,
                    }}
                  >
                    {formatSats(earnedSats)} released to your wallet
                  </div>
                </div>
              )}

              {/* Info strip */}
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
                  Updates push{" "}
                  <strong style={{ color: "var(--text-2)", fontWeight: 500 }}>
                    instantly
                  </strong>{" "}
                  via Socket.io. When a milestone is disputed, submit your
                  evidence so the arbitrator can review your case.
                </p>
              </div>
            </>
          )}
        </main>
      </div>

      {/* ── Dispute Modal — portalled outside db-shell so it covers everything ── */}
      {disputeModalMs && agreementId && data && (
        <DisputeModal
          ms={disputeModalMs}
          agreementId={agreementId}
          data={data}
          walletAddress={walletAddress ?? ""}
          onClose={() => setDisputeModalMs(null)}
          onSubmitted={() => {
            setDisputeSubmitted((p) => ({
              ...p,
              [disputeModalMs.index]: true,
            }));
            setDisputeModalMs(null);
          }}
        />
      )}
    </div>
  );
}
