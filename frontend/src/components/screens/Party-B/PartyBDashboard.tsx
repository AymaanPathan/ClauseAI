"use client";

import {
  disputeMilestoneAsPartyBThunk,
  setMilestoneTxState,
} from "@/store/slices/partyBSlice";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/store";

import { useState, useCallback } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { explorerTxUrl } from "@/lib/stacksConfig";
import { getPartyBAgreementIds } from "@/store/slices/partyBSlice";
import DisputeSubmitScreen from "@/components/screens/Shared/DisputeSubmitScreen";
import {
  useSyncedAgreement,
  type SyncedMilestone,
} from "@/hook/useSyncedAgreement";

type MsStatus = SyncedMilestone["status"];

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

function isSettled(s: MsStatus) {
  return s === "complete" || s === "refunded";
}

function truncateAddr(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 8)}…${addr.slice(-5)}`;
}

function fmtDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDeadline(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  try {
    return new Date(iso).getTime() < Date.now();
  } catch {
    return false;
  }
}

// ── Deadline Badge ─────────────────────────────────────────────
function DeadlineBadge({ iso }: { iso: string | null | undefined }) {
  if (!iso) return null;
  const label = fmtDeadline(iso);
  if (!label) return null;
  const overdue = isOverdue(iso);
  return (
    <span className={`pbb-deadline${overdue ? " pbb-deadline--overdue" : ""}`}>
      <svg
        width="8"
        height="8"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      {overdue ? "Overdue · " : ""}
      {label}
    </span>
  );
}

// ── Arbitrator Decision Banner ────────────────────────────────
interface ArbitratorDecision {
  outcome: "release_to_receiver" | "refund_to_payer" | "split";
  followed_ai: boolean;
  override_reason?: string;
  decided_at: string;
  arbitrator_address: string;
}

function ArbitratorDecisionBanner({
  decision,
  viewerRole,
}: {
  decision: ArbitratorDecision;
  viewerRole: "A" | "B";
}) {
  const isRelease = decision.outcome === "release_to_receiver";
  const c = isRelease ? "#4ade80" : "#f87171";
  const outcomeLabel = isRelease
    ? "Funds Released to Receiver"
    : "Funds Refunded to Payer";

  const personalMsg = isRelease
    ? viewerRole === "B"
      ? "The arbitrator ruled in your favour. Funds were released to your wallet."
      : "The arbitrator ruled in favour of the Receiver."
    : viewerRole === "A"
      ? "The arbitrator ruled in your favour. Funds were returned to your wallet."
      : "The arbitrator ruled in favour of the Payer. Funds were refunded.";

  return (
    <div
      className="pbb-arb-banner"
      style={{ borderColor: `${c}28`, background: `${c}06` }}
    >
      <div
        className="pbb-arb-head"
        style={{ background: `${c}0a`, borderColor: `${c}18` }}
      >
        <span style={{ fontSize: 14 }}>⚖</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pbb-arb-eyebrow" style={{ color: c }}>
            Arbitrator Decision
          </div>
          <div className="pbb-arb-title" style={{ color: c }}>
            {outcomeLabel}
          </div>
        </div>
        {((viewerRole === "B" && isRelease) ||
          (viewerRole === "A" && !isRelease)) && (
          <span
            className="pbb-arb-you"
            style={{ color: c, borderColor: `${c}30`, background: `${c}15` }}
          >
            You
          </span>
        )}
      </div>
      <div className="pbb-arb-body">
        <p className="pbb-arb-msg">{personalMsg}</p>
        {decision.override_reason && (
          <div className="pbb-arb-note">
            <div className="pbb-arb-note-label">Arbitrator&apos;s Note</div>
            <p className="pbb-arb-note-text">
              &ldquo;{decision.override_reason}&rdquo;
            </p>
          </div>
        )}
        <div className="pbb-arb-meta">
          <span className="pbb-arb-meta-item">
            By {truncateAddr(decision.arbitrator_address)}
          </span>
          <span className="pbb-arb-sep">·</span>
          <span className="pbb-arb-meta-item">
            {fmtDate(decision.decided_at)}
          </span>
          <span className="pbb-arb-sep">·</span>
          <span
            className="pbb-arb-ai"
            style={{
              color: decision.followed_ai ? "#4ade80" : "#fbbf24",
              background: decision.followed_ai
                ? "rgba(74,222,128,0.07)"
                : "rgba(251,191,36,0.07)",
              borderColor: decision.followed_ai
                ? "rgba(74,222,128,0.20)"
                : "rgba(251,191,36,0.20)",
            }}
          >
            {decision.followed_ai ? "✓ Followed AI" : "↺ Overrode AI"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── History Card ──────────────────────────────────────────────
function HistoryCard({ agreementId }: { agreementId: string }) {
  const [expanded, setExpanded] = useState(false);
  const {
    milestones,
    fundState,
    amountLocked,
    totalAmountUsd,
    terms,
    partyA,
    loading,
  } = useSyncedAgreement({ agreementId });

  if (loading)
    return (
      <div className="pbb-hist-row">
        <span className="pbb-spinner-sm" />
        <span className="pbb-hist-id">#{agreementId}</span>
      </div>
    );

  if (!milestones.length)
    return (
      <div className="pbb-hist-row" style={{ opacity: 0.4 }}>
        <span className="pbb-hist-id">#{agreementId}</span>
        <span
          style={{
            marginLeft: 6,
            fontSize: 10,
            color: "rgba(255,255,255,.25)",
          }}
        >
          not found
        </span>
      </div>
    );

  const completedMs = milestones.filter((m) => isSettled(m.status)).length;
  const pct =
    milestones.length > 0
      ? Math.round((completedMs / milestones.length) * 100)
      : 0;
  const payerName = ((terms as any)?.payer ??
    (terms as any)?.partyA ??
    partyA ??
    "Payer") as string;
  const displayAmt = amountLocked ?? String(totalAmountUsd);

  return (
    <div
      className={`pbb-hist-row${expanded ? " pbb-hist-row--open" : ""}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="pbb-hist-row-left">
        <span className="pbb-hist-id">#{agreementId}</span>
        <div style={{ minWidth: 0 }}>
          <div className="pbb-hist-payer">← {payerName}</div>
          <div className="pbb-hist-amount">${displayAmt} USD</div>
        </div>
      </div>
      <div className="pbb-hist-row-right">
        <div className="pbb-hist-bar-wrap">
          <div className="pbb-hist-bar-label">
            {completedMs}/{milestones.length}
          </div>
          <div className="pbb-hist-bar">
            <div
              className="pbb-hist-bar-fill"
              style={{
                width: `${pct}%`,
                background: pct === 100 ? "#4ade80" : "rgba(255,255,255,.35)",
              }}
            />
          </div>
        </div>
        <span className={`pbb-state-tag pbb-state-tag--${fundState}`}>
          {fundStateLabel(fundState)}
        </span>
        <svg
          className={`pbb-hist-chevron${expanded ? " pbb-hist-chevron--open" : ""}`}
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
      {expanded && (
        <div className="pbb-hist-expanded" onClick={(e) => e.stopPropagation()}>
          {milestones.map((ms) => (
            <div key={ms.index} className="pbb-hist-ms">
              <div
                className="pbb-hist-ms-dot"
                style={{
                  color: statusColor(ms.status),
                  background: statusColor(ms.status) + "15",
                  borderColor: statusColor(ms.status) + "35",
                }}
              >
                {ms.status === "complete" ? "✓" : ms.index + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pbb-hist-ms-title">{ms.title}</div>
                {ms.condition && (
                  <div className="pbb-hist-ms-cond">
                    {ms.condition.length > 60
                      ? ms.condition.slice(0, 60) + "…"
                      : ms.condition}
                  </div>
                )}
              </div>
              <div className="pbb-hist-ms-right">
                <span className="pbb-hist-ms-amt">${ms.amountUsd}</span>
                <span
                  className="pbb-ms-pill"
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
                    className="pbb-tx-link"
                  >
                    tx ↗
                  </a>
                )}
              </div>
            </div>
          ))}
          {fundState !== "released" && (
            <a
              href={`/agreement/${agreementId}`}
              className="pbb-hist-open-link"
            >
              {fundState === "locked"
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
  const {
    terms: reduxTerms,
    amountLocked: reduxAmountLocked,
    walletAddress,
    agreementId,
    txMilestone,
  } = useSelector((s: RootState) => s.partyB);

  const t = reduxTerms as any;
  const receiverName = t?.receiver ?? t?.partyB ?? "You";
  const payerNameFallback = t?.payer ?? t?.partyA ?? "Payer";
  const dispatch = useDispatch<AppDispatch>();

  const {
    milestones,
    fundState,
    amountLocked,
    partyA,
    totalAmountUsd,
    totalAmountSats,
    terms,
    arbDecisions,
    connected,
    loading,
    lastUpdate,
    flashIndex,
    refetch,
  } = useSyncedAgreement({ agreementId, walletAddress });
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [disputeConfirmMs, setDisputeConfirmMs] =
    useState<SyncedMilestone | null>(null);
  const [disputingIndex, setDisputingIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [historyIds] = useState<string[]>(() => getPartyBAgreementIds());
  const [disputeModalMs, setDisputeModalMs] = useState<SyncedMilestone | null>(
    null,
  );
  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setTimeout(() => setRefreshing(false), 600);
    }
  }
  const [disputeSubmitted, setDisputeSubmitted] = useState<
    Record<number, boolean>
  >({});

  const displayAmount =
    amountLocked ??
    reduxAmountLocked ??
    t?.total_usd ??
    t?.amount_usd ??
    String(totalAmountUsd || "—");
  const displayPayer = partyA
    ? `${partyA.slice(0, 8)}…${partyA.slice(-4)}`
    : payerNameFallback;

  async function handlePartyBDispute(ms: SyncedMilestone) {
    if (!agreementId || !walletAddress) return;
    setDisputeConfirmMs(null);
    setDisputingIndex(ms.index);
    try {
      const result = await dispatch(
        disputeMilestoneAsPartyBThunk({
          agreementId,
          milestoneIndex: ms.index,
          callerAddress: walletAddress,
          onConfirmed: () => {
            refetch();
            setDisputeModalMs(ms);
          },
        }),
      );
      if (disputeMilestoneAsPartyBThunk.rejected.match(result)) {
        console.error("Dispute failed:", result.payload);
      }
    } catch (err) {
      console.error("Dispute failed", err);
    } finally {
      setDisputingIndex(null);
    }
  }

  const completedCount = milestones.filter((m) => isSettled(m.status)).length;
  const progressPct =
    milestones.length > 0
      ? Math.round((completedCount / milestones.length) * 100)
      : 0;
  const earnedSats = milestones
    .filter((m) => m.status === "complete")
    .reduce((s, m) => s + m.amountSats, 0);
  const earnedCount = milestones.filter((m) => m.status === "complete").length;

  const statsCards = [
    {
      label: "Total Locked",
      value:
        totalAmountSats > 0 ? formatSats(totalAmountSats) : `$${displayAmount}`,
      sub: totalAmountSats > 0 ? `≈ $${displayAmount} USD` : "USD in escrow",
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
      sub: `${earnedCount} milestone${earnedCount !== 1 ? "s" : ""} released`,
      icon: "◈",
    },
    { label: "Payer", value: displayPayer, sub: "counterparty", icon: "◎" },
  ];

  return (
    <div>
      <style>{css}</style>

      {/* ── Topbar ── */}
      <header className="pbb-topbar">
        <div className="pbb-topbar-left">
          <button
            className="pbb-ham"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <span />
            <span />
            <span />
          </button>
          <a
            className="pbb-brand"
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
              window.location.href = "/";
            }}
          >
            <span className="pbb-brand-mark">◈</span>
            <span className="pbb-brand-name">ClauseAI</span>
          </a>
          <div className="pbb-nav-sep" />
          <nav className="pbb-breadcrumb">
            <span className="pbb-bc-dim">Agreement</span>
            <span className="pbb-bc-arr">›</span>
            <span className="pbb-bc-id">#{agreementId}</span>
            <span className="pbb-bc-arr pbb-bc-arr-last">›</span>
            <span className="pbb-bc-cur">Party B</span>
          </nav>
        </div>
        <div className="pbb-topbar-right">
          {lastUpdate && (
            <span className="pbb-ts">{lastUpdate.toLocaleTimeString()}</span>
          )}
          {walletAddress && (
            <div className="pbb-wallet">
              <span className="pbb-wallet-dot" />
              <span className="pbb-wallet-addr">
                {walletAddress.slice(0, 10)}…{walletAddress.slice(-6)}
              </span>
            </div>
          )}
          <div className={`pbb-live${connected ? "" : " pbb-live--off"}`}>
            <span
              className={`pbb-live-dot${connected ? "" : " pbb-live-dot--off"}`}
            />
            <span className="pbb-live-label">
              {connected ? "Live" : "Reconnecting"}
            </span>
          </div>
          <button
            className="pbb-refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh agreement state"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={
                refreshing
                  ? { animation: "pbbSpin .7s linear infinite" }
                  : undefined
              }
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            <span className="pbb-refresh-label">
              {refreshing ? "Syncing…" : "Refresh"}
            </span>
          </button>
        </div>
      </header>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="pbb-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Shell ── */}
      <div className="pbb-shell">
        {/* ── Sidebar ── */}
        <aside
          className={`pbb-sidebar${sidebarOpen ? " pbb-sidebar--open" : ""}`}
        >
          <div className="pbb-sb-block">
            <div className="pbb-sb-label">Navigation</div>
            <nav className="pbb-nav">
              <button
                className={`pbb-nav-item${activeTab === "current" ? " pbb-nav-item--active" : ""}`}
                onClick={() => {
                  setActiveTab("current");
                  setSidebarOpen(false);
                }}
              >
                <span className="pbb-nav-icon">
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
              <button
                className={`pbb-nav-item${activeTab === "history" ? " pbb-nav-item--active" : ""}`}
                onClick={() => {
                  setActiveTab("history");
                  setSidebarOpen(false);
                }}
              >
                <span className="pbb-nav-icon">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <rect x="3" y="3" width="18" height="5" rx="1" />
                    <rect x="3" y="10" width="18" height="5" rx="1" />
                    <rect x="3" y="17" width="18" height="4" rx="1" />
                  </svg>
                </span>
                History
                {historyIds.length > 0 && (
                  <span className="pbb-nav-badge">{historyIds.length}</span>
                )}
              </button>
            </nav>
          </div>

          <div className="pbb-ring-wrap">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle
                cx="40"
                cy="40"
                r="32"
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="4"
              />
              <circle
                cx="40"
                cy="40"
                r="32"
                fill="none"
                stroke={progressPct === 100 ? "#4ade80" : "#d4ff00"}
                strokeWidth="4"
                strokeDasharray={`${2 * Math.PI * 32}`}
                strokeDashoffset={`${2 * Math.PI * 32 * (1 - progressPct / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
                style={{
                  transition:
                    "stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1)",
                }}
              />
              <text
                x="40"
                y="44"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="13"
                fontWeight="700"
                fontFamily="'DM Mono',monospace"
              >
                {progressPct}%
              </text>
            </svg>
            <div className="pbb-ring-label">
              {completedCount}/{milestones.length} milestones
            </div>
          </div>

          <div className="pbb-sb-block">
            <div className="pbb-sb-label">Agreement</div>
            <div className="pbb-meta-list">
              <div className="pbb-meta-row">
                <span className="pbb-meta-key">Status</span>
                <span className={`pbb-state-tag pbb-state-tag--${fundState}`}>
                  {fundStateLabel(fundState)}
                </span>
              </div>
              <div className="pbb-meta-row">
                <span className="pbb-meta-key">Milestones</span>
                <span className="pbb-meta-val">
                  {completedCount}/{milestones.length}
                </span>
              </div>
              <div className="pbb-meta-row">
                <span className="pbb-meta-key">Progress</span>
                <span className="pbb-meta-val">{progressPct}%</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="pbb-main">
          {/* ── History Tab ── */}
          {activeTab === "history" && (
            <div>
              <div className="pbb-page-header" style={{ marginBottom: 0 }}>
                <div>
                  <div className="pbb-eyebrow">Transaction History</div>
                  <h1 className="pbb-page-title">All Agreements</h1>
                </div>
              </div>
              <div className="pbb-hist-list">
                {historyIds.map((id) => (
                  <HistoryCard key={id} agreementId={id} />
                ))}
                {historyIds.length === 0 && (
                  <div className="pbb-loading">
                    <span className="pbb-loading-text">No agreements yet.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Current Tab ── */}
          {activeTab === "current" && (
            <>
              <div className="pbb-page-header">
                <div>
                  <div className="pbb-eyebrow">Receiver Dashboard</div>
                  <h1 className="pbb-page-title">Your Dashboard</h1>
                </div>
                {walletAddress && (
                  <div className="pbb-wallet-chip">
                    <span className="pbb-wallet-dot" />
                    <span className="pbb-wallet-addr">
                      {walletAddress.slice(0, 10)}…{walletAddress.slice(-6)}
                    </span>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="pbb-stats">
                {statsCards.map(({ label, value, sub, icon }) => (
                  <div key={label} className="pbb-stat">
                    <div className="pbb-stat-icon">{icon}</div>
                    <div className="pbb-stat-label">{label}</div>
                    <div className="pbb-stat-value">{value}</div>
                    <div className="pbb-stat-sub">{sub}</div>
                  </div>
                ))}
              </div>

              {/* Progress */}
              <div className="pbb-prog-card">
                <div className="pbb-prog-top">
                  <span className="pbb-prog-title">Completion</span>
                  <div className="pbb-prog-right">
                    <span
                      className="pbb-prog-pct"
                      style={{
                        color: progressPct === 100 ? "#4ade80" : "#d4ff00",
                      }}
                    >
                      {progressPct}%
                    </span>
                    <span className="pbb-prog-frac">
                      {milestones.length > 0
                        ? `${completedCount} of ${milestones.length}`
                        : "Awaiting data"}
                    </span>
                  </div>
                </div>
                <div className="pbb-prog-track">
                  <div
                    className="pbb-prog-fill"
                    style={{
                      width: `${progressPct > 0 ? progressPct : 0.5}%`,
                      background: progressPct === 100 ? "#4ade80" : "#d4ff00",
                    }}
                  />
                </div>
              </div>

              {loading && (
                <div className="pbb-loading">
                  <span className="pbb-spinner-sm" />
                  <span className="pbb-loading-text">
                    Fetching milestone data…
                  </span>
                </div>
              )}

              {!loading && milestones.length === 0 && (
                <div className="pbb-empty-state">
                  <div className="pbb-empty-icon">
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
                    <div className="pbb-empty-title">
                      Awaiting milestone data
                    </div>
                    <div className="pbb-empty-body">
                      Funds are locked. Details appear once the payer opens
                      their dashboard.
                    </div>
                  </div>
                </div>
              )}

              {!loading && milestones.length > 0 && (
                <div>
                  <div className="pbb-sec-head">
                    <span className="pbb-sec-title">Milestones</span>
                    <span className="pbb-sec-count">
                      {milestones.length} total
                    </span>
                  </div>
                  <div className="pbb-ms-list">
                    {milestones.map((ms) => {
                      const isDone = isSettled(ms.status);
                      const isPending = ms.status === "pending";
                      const isDisputed = ms.status === "disputed";
                      const isFlashing = flashIndex === ms.index;
                      const alreadySub = disputeSubmitted[ms.index];
                      const arbDecision = arbDecisions[ms.index] ?? null;
                      const showArbBanner = isDone && arbDecision !== null;
                      const deadlineDt: string | null =
                        (ms as any).deadline_dt ?? null;
                      const overdue =
                        isOverdue(deadlineDt) && !isDone && !isDisputed;

                      return (
                        <div
                          key={ms.index}
                          className={[
                            "pbb-ms-block",
                            isDone ? "pbb-ms-block--done" : "",
                            isDisputed ? "pbb-ms-block--disp" : "",
                            isPending ? "pbb-ms-block--pending" : "",
                            isFlashing ? "pbb-ms-block--flash" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <div className="pbb-ms-row">
                            {/* Number */}
                            <div
                              className={[
                                "pbb-ms-num",
                                isDone ? "pbb-ms-num--done" : "",
                                isDisputed ? "pbb-ms-num--disp" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
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
                            <div className="pbb-ms-info">
                              <div className="pbb-ms-title-row">
                                <span className="pbb-ms-title">{ms.title}</span>
                                {isDisputed && (
                                  <span className="pbb-chip pbb-chip--disp">
                                    ⚑ Dispute
                                  </span>
                                )}
                                {isPending && (
                                  <span className="pbb-chip pbb-chip--pending">
                                    <span className="pbb-spinner-xs" />
                                    Confirming
                                  </span>
                                )}
                                {isDone && arbDecision && (
                                  <span className="pbb-chip pbb-chip--arb">
                                    ⚖ Arbitrated
                                  </span>
                                )}
                                {overdue && (
                                  <span className="pbb-chip pbb-chip--overdue">
                                    ⚠ Overdue
                                  </span>
                                )}
                                {isFlashing && !isDisputed && !isDone && (
                                  <span className="pbb-chip pbb-chip--flash">
                                    Updated
                                  </span>
                                )}
                              </div>

                              {ms.condition && (
                                <p className="pbb-ms-cond">{ms.condition}</p>
                              )}

                              <div className="pbb-ms-meta">
                                {deadlineDt ? (
                                  <DeadlineBadge iso={deadlineDt} />
                                ) : ms.deadline ? (
                                  <span className="pbb-ms-dl">
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
                                ) : null}
                                {ms.txId && (
                                  <a
                                    href={ms.txUrl ?? explorerTxUrl(ms.txId)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="pbb-tx-link"
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
                                    {ms.txId.slice(0, 12)}… ↗
                                    {isPending && (
                                      <span className="pbb-spinner-xs" />
                                    )}
                                  </a>
                                )}
                                {ms.completedAt && (
                                  <span className="pbb-ms-released">
                                    {ms.status === "complete"
                                      ? "Released"
                                      : "Settled"}{" "}
                                    {new Date(ms.completedAt).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Right */}
                            <div className="pbb-ms-right">
                              <div className="pbb-ms-amt-block">
                                <div
                                  className={`pbb-ms-amt${isDone ? " pbb-ms-amt--done" : ""}`}
                                >
                                  {ms.amountSats > 0
                                    ? formatSats(ms.amountSats)
                                    : `$${ms.amountUsd}`}
                                </div>
                                <div className="pbb-ms-amt-sub">
                                  {ms.percentage}%
                                </div>
                              </div>
                              <div className="pbb-ms-actions">
                                <span
                                  className="pbb-ms-pill"
                                  style={{
                                    color: statusColor(ms.status),
                                    background: statusColor(ms.status) + "10",
                                    borderColor: statusColor(ms.status) + "28",
                                  }}
                                >
                                  {isPending && (
                                    <span className="pbb-spinner-dot" />
                                  )}
                                  {statusLabel(ms.status)}
                                </span>

                                {!isDone &&
                                  !isPending &&
                                  !isDisputed &&
                                  (() => {
                                    const bTxStatus =
                                      txMilestone?.[ms.index]?.status ?? "idle";
                                    const isDisputingThis =
                                      bTxStatus === "pending" ||
                                      bTxStatus === "confirming";
                                    return (
                                      <>
                                        <button
                                          className="pbb-btn pbb-btn--dispute"
                                          onClick={() =>
                                            setDisputeConfirmMs(ms)
                                          }
                                          disabled={isDisputingThis}
                                        >
                                          {isDisputingThis ? (
                                            <>
                                              <span className="pbb-spinner-xs" />
                                              {bTxStatus === "confirming"
                                                ? " Confirming…"
                                                : " Submitting…"}
                                            </>
                                          ) : (
                                            "⚑ Dispute"
                                          )}
                                        </button>
                                        {bTxStatus === "failed" && (
                                          <button
                                            className="pbb-btn pbb-btn--retry"
                                            onClick={() =>
                                              dispatch(
                                                setMilestoneTxState({
                                                  index: ms.index,
                                                  tx: {
                                                    status: "idle",
                                                    txId: null,
                                                    error: null,
                                                  },
                                                }),
                                              )
                                            }
                                          >
                                            ↺ Retry
                                          </button>
                                        )}
                                      </>
                                    );
                                  })()}

                                {isDisputed && !alreadySub && (
                                  <button
                                    className="pbb-btn pbb-btn--evidence"
                                    onClick={() => setDisputeModalMs(ms)}
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
                                    Evidence
                                  </button>
                                )}
                                {isDisputed && alreadySub && (
                                  <span className="pbb-filed">
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
                              </div>
                            </div>
                          </div>

                          {showArbBanner && arbDecision && (
                            <div className="pbb-disp-panel">
                              <ArbitratorDecisionBanner
                                decision={arbDecision}
                                viewerRole="B"
                              />
                            </div>
                          )}

                          {isDisputed && !showArbBanner && (
                            <div className="pbb-disp-panel">
                              <span className="pbb-disp-awaiting">
                                ⚑ Dispute is open — awaiting arbitrator decision
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {progressPct === 100 && milestones.length > 0 && (
                <div className="pbb-complete-banner">
                  <div className="pbb-complete-icon">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#0a0a0a"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div className="pbb-complete-title">
                    All milestones settled
                  </div>
                  <p className="pbb-complete-body">
                    {formatSats(earnedSats)} released to your wallet
                  </p>
                </div>
              )}

              <div className="pbb-info-strip">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(255,255,255,.28)"
                  strokeWidth="1.5"
                  style={{ flexShrink: 0, marginTop: 2 }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="pbb-info-text">
                  Updates push{" "}
                  <strong
                    style={{ color: "rgba(255,255,255,.55)", fontWeight: 500 }}
                  >
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

      {/* ── Evidence / Dispute Modal ── */}
      {disputeModalMs && agreementId && (
        <div
          className="pbb-modal-bd"
          onClick={(e) => {
            if (e.currentTarget === e.target) setDisputeModalMs(null);
          }}
        >
          <div className="pbb-modal">
            <div className="pbb-modal-head">
              <div className="pbb-modal-head-left">
                <div className="pbb-modal-icon">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--amber,#fbbf24)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <div>
                  <div className="pbb-modal-eyebrow">
                    File Evidence · Dispute
                  </div>
                  <div className="pbb-modal-title">{disputeModalMs.title}</div>
                </div>
              </div>
              <button
                className="pbb-modal-close"
                onClick={() => setDisputeModalMs(null)}
              >
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
            <div className="pbb-modal-body pbb-modal-body--scroll">
              <DisputeSubmitScreen
                agreementId={agreementId}
                milestoneIndex={disputeModalMs.index}
                party="B"
                milestoneDescription={
                  disputeModalMs.condition || disputeModalMs.title
                }
                contractTerms={{
                  payer: partyA ?? t?.payer ?? "",
                  receiver: walletAddress ?? t?.receiver ?? t?.partyB ?? "",
                  arbitrator:
                    (terms as any)?.arbitrator ?? t?.arbitrator ?? "TBD",
                  total_amount: totalAmountUsd ?? 0,
                  milestone_description:
                    disputeModalMs.condition || disputeModalMs.title,
                  milestone_percentage: disputeModalMs.percentage,
                  milestone_deadline:
                    (disputeModalMs as any).deadline_dt ||
                    disputeModalMs.deadline ||
                    undefined,
                  agreement_type:
                    (terms as any)?.agreement_type ??
                    t?.agreement_type ??
                    "freelance",
                }}
                onSubmitted={() => {
                  setDisputeSubmitted((p) => ({
                    ...p,
                    [disputeModalMs.index]: true,
                  }));
                  setDisputeModalMs(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Dispute Confirm Modal ── */}
      {disputeConfirmMs && (
        <div className="pbb-modal-bd" onClick={() => setDisputeConfirmMs(null)}>
          <div
            className="pbb-modal pbb-modal--confirm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pbb-modal-head">
              <div className="pbb-modal-head-left">
                <div className="pbb-modal-icon">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--amber,#fbbf24)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <div>
                  <div className="pbb-modal-title">Open Dispute</div>
                  <div className="pbb-modal-subtitle">
                    {disputeConfirmMs.title}
                  </div>
                </div>
              </div>
              <button
                className="pbb-modal-close"
                onClick={() => setDisputeConfirmMs(null)}
              >
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
            <div className="pbb-modal-body">
              <div className="pbb-modal-warn">
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
                  This will flag the milestone on-chain and lock funds until the
                  arbitrator resolves it.
                </p>
              </div>
              <div className="pbb-modal-grid">
                <div className="pbb-modal-cell">
                  <span className="pbb-modal-cell-label">Milestone</span>
                  <span className="pbb-modal-cell-val">
                    {disputeConfirmMs.title}
                  </span>
                </div>
                {(disputeConfirmMs as any).deadline_dt && (
                  <div className="pbb-modal-cell">
                    <span className="pbb-modal-cell-label">Deadline</span>
                    <span
                      className="pbb-modal-cell-val"
                      style={{ fontSize: 11, color: "rgba(255,255,255,.55)" }}
                    >
                      {fmtDeadline((disputeConfirmMs as any).deadline_dt)}
                    </span>
                  </div>
                )}
              </div>
              <div className="pbb-modal-footer">
                <button
                  className="pbb-cta-secondary"
                  onClick={() => setDisputeConfirmMs(null)}
                >
                  Cancel
                </button>
                <button
                  className="pbb-cta-dispute"
                  disabled={disputingIndex === disputeConfirmMs.index}
                  onClick={() => handlePartyBDispute(disputeConfirmMs)}
                >
                  {disputingIndex === disputeConfirmMs.index
                    ? "Submitting…"
                    : "Confirm Dispute On-chain →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scoped CSS ────────────────────────────────────────────────
const css = `
@keyframes pbbSpin  { to{transform:rotate(360deg)} }
@keyframes pbbPulse { 0%,100%{opacity:1}50%{opacity:.4} }
@keyframes pbbFlash { 0%{background:rgba(212,255,0,.12)}100%{background:transparent} }
@keyframes pbbSlide { from{transform:translateX(-100%)}to{transform:translateX(0)} }

/* ── Topbar ──────────────────────────────────────────────────── */
.pbb-topbar { position:sticky;top:0;z-index:200;height:56px;background:#0a0a0a;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:space-between;padding:0 28px;gap:12px; }
.pbb-topbar-left  { display:flex;align-items:center;min-width:0;overflow:hidden; }
.pbb-topbar-right { display:flex;align-items:center;gap:10px;flex-shrink:0; }

.pbb-ham { display:none;flex-direction:column;justify-content:center;gap:4.5px;width:34px;height:34px;background:none;border:1px solid rgba(255,255,255,.10);border-radius:6px;cursor:pointer;padding:0 9px;flex-shrink:0;margin-right:12px; }
.pbb-ham span { display:block;height:1.5px;background:rgba(255,255,255,.55);border-radius:2px; }

.pbb-brand { display:flex;align-items:center;gap:9px;text-decoration:none;flex-shrink:0; }
.pbb-brand-mark { width:28px;height:28px;border-radius:6px;background:#d4ff00;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:#0a0a0a;font-family:'Syne',sans-serif;flex-shrink:0; }
.pbb-brand-name { font-family:'Syne',sans-serif;font-size:15px;font-weight:800;color:#fff;letter-spacing:-.02em; }

.pbb-nav-sep { width:1px;height:16px;background:rgba(255,255,255,.08);margin:0 20px;flex-shrink:0; }

.pbb-breadcrumb { display:flex;align-items:center;overflow:hidden; }
.pbb-bc-dim { font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.22);white-space:nowrap; }
.pbb-bc-id  { font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.22);max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.pbb-bc-arr { font-size:11px;color:rgba(255,255,255,.15);margin:0 6px;flex-shrink:0; }
.pbb-bc-cur { font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.55);flex-shrink:0; }

.pbb-ts { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.20); }

.pbb-wallet { display:flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.10);border-radius:4px;padding:5px 12px; }
.pbb-wallet-dot  { width:5px;height:5px;border-radius:50%;background:#d4ff00;flex-shrink:0; }
.pbb-wallet-addr { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.45); }

.pbb-wallet-chip { display:flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.10);border-radius:4px;padding:6px 12px;flex-shrink:0; }


/* ── Refresh button ─────────────────────────────────────────── */
.pbb-refresh-btn { display:flex;align-items:center;gap:6px;padding:4px 12px;border-radius:4px;background:none;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.40);font-size:11px;font-family:'DM Mono',monospace;font-weight:600;cursor:pointer;letter-spacing:.04em;min-height:28px;transition:border-color .15s,color .15s,opacity .15s; }
.pbb-refresh-btn:hover:not(:disabled) { border-color:rgba(255,255,255,.28);color:rgba(255, 255, 255, 0.8); }
.pbb-refresh-btn:disabled { cursor:not-allowed;opacity:.55; }
@media (max-width:580px) { .pbb-refresh-label { display:none; } .pbb-refresh-btn { padding:4px 8px; } }

.pbb-live     { display:flex;align-items:center;gap:6px;font-size:10px;font-family:'DM Mono',monospace;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#d4ff00;border:1px solid rgba(212,255,0,.25);border-radius:4px;padding:4px 10px;white-space:nowrap; }
.pbb-live--off { color:rgba(255,255,255,.30);border-color:rgba(255,255,255,.12); }
.pbb-live-dot { width:5px;height:5px;border-radius:50%;background:#d4ff00;flex-shrink:0;animation:pbbPulse 2s ease infinite; }
.pbb-live-dot--off { background:rgba(255,255,255,.30);animation:none; }
.pbb-live-label {}

/* ── Shell / Overlay / Sidebar ───────────────────────────────── */
.pbb-shell   { display:flex;min-height:calc(100vh - 56px);background:#0a0a0a; }
.pbb-overlay { display:none;position:fixed;inset:0;z-index:150;background:rgba(0,0,0,.65);backdrop-filter:blur(4px); }
.pbb-sidebar { width:220px;flex-shrink:0;background:#0d0d0d;border-right:1px solid rgba(255,255,255,.07);display:flex;flex-direction:column;position:sticky;top:56px;height:calc(100vh - 56px);overflow-y:auto;padding:20px 0 24px;transition:transform .26s cubic-bezier(.16,1,.3,1); }
.pbb-sb-block { padding:0 14px 20px;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,.05); }
.pbb-sb-block:last-of-type { border-bottom:none; }
.pbb-sb-label { font-size:9px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.22);text-transform:uppercase;letter-spacing:.14em;margin-bottom:10px; }

.pbb-nav     { display:flex;flex-direction:column;gap:1px; }
.pbb-nav-item { display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border-radius:4px;font-size:12px;font-weight:500;color:rgba(255,255,255,.35);background:none;border:none;cursor:pointer;text-align:left;font-family:'DM Sans',sans-serif;min-height:40px; }
.pbb-nav-item:hover { color:#fff;background:rgba(255,255,255,.05); }
.pbb-nav-item--active { color:#fff;background:rgba(255,255,255,.06); }
.pbb-nav-icon { color:rgba(255,255,255,.25);flex-shrink:0;width:16px;display:flex;align-items:center;justify-content:center; }
.pbb-nav-item--active .pbb-nav-icon,.pbb-nav-item:hover .pbb-nav-icon { color:#d4ff00; }
.pbb-nav-badge { margin-left:auto;font-size:9px;font-family:'DM Mono',monospace;font-weight:700;color:#d4ff00;background:rgba(212,255,0,.12);border:1px solid rgba(212,255,0,.25);border-radius:3px;padding:1px 6px; }

.pbb-ring-wrap  { display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 14px 20px;border-bottom:1px solid rgba(255,255,255,.05); }
.pbb-ring-label { font-size:9px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.25);text-align:center;letter-spacing:.10em;text-transform:uppercase; }

.pbb-meta-list { display:flex;flex-direction:column;gap:10px; }
.pbb-meta-row  { display:flex;align-items:center;justify-content:space-between;gap:8px; }
.pbb-meta-key  { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.25); }
.pbb-meta-val  { font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.70);font-weight:600; }

.pbb-state-tag { font-size:9px;font-family:'DM Mono',monospace;font-weight:700;text-transform:uppercase;letter-spacing:.07em;border-radius:3px;padding:2px 7px;border:1px solid; }
.pbb-state-tag--locked   { color:#d4ff00;border-color:rgba(212,255,0,.30); }
.pbb-state-tag--pending  { color:rgba(255,255,255,.40);border-color:rgba(255,255,255,.15); }
.pbb-state-tag--released { color:#4ade80;border-color:rgba(74,222,128,.30); }
.pbb-state-tag--disputed { color:#fbbf24;border-color:rgba(251,191,36,.30); }

/* ── Main ────────────────────────────────────────────────────── */
.pbb-main { flex:1;min-width:0;padding:40px 48px 72px;display:flex;flex-direction:column;gap:28px; }

.pbb-page-header { display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap; }
.pbb-eyebrow     { font-size:10px;font-family:'DM Mono',monospace;color:#d4ff00;text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px; }
.pbb-page-title  { font-family:'Syne',sans-serif;font-size:clamp(22px,3vw,36px);font-weight:800;color:#fff;letter-spacing:-.04em;line-height:1;margin:0; }

/* ── Stats ───────────────────────────────────────────────────── */
.pbb-stats { display:grid;grid-template-columns:repeat(4,1fr);border:1px solid rgba(255,255,255,.07); }
.pbb-stat  { padding:24px 20px 20px;display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,.07);min-width:0; }
.pbb-stat:last-child { border-right:none; }
.pbb-stat-icon  { font-size:18px;margin-bottom:20px;opacity:.6; }
.pbb-stat-label { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.30);text-transform:uppercase;letter-spacing:.10em;margin-bottom:8px; }
.pbb-stat-value { font-family:'Syne',sans-serif;font-size:16px;font-weight:700;color:#fff;letter-spacing:-.03em;line-height:1.2;word-break:break-all;margin-bottom:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.pbb-stat-sub   { font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.25);overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }

/* ── Progress ────────────────────────────────────────────────── */
.pbb-prog-card { border:1px solid rgba(255,255,255,.07);padding:20px;display:flex;flex-direction:column;gap:14px; }
.pbb-prog-top  { display:flex;align-items:center;justify-content:space-between; }
.pbb-prog-title { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.30);text-transform:uppercase;letter-spacing:.09em; }
.pbb-prog-right { display:flex;align-items:baseline;gap:8px; }
.pbb-prog-pct   { font-size:20px;font-family:'DM Mono',monospace;font-weight:800;letter-spacing:-.03em; }
.pbb-prog-frac  { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.25); }
.pbb-prog-track { height:3px;background:rgba(255,255,255,.06);overflow:hidden; }
.pbb-prog-fill  { height:100%;transition:width .8s ease; }

/* ── Loading / Empty ─────────────────────────────────────────── */
.pbb-loading      { padding:24px 0;display:flex;align-items:center;gap:10px;color:rgba(255,255,255,.30);font-size:12px;font-family:'DM Mono',monospace; }
.pbb-loading-text { font-size:12px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.30); }
.pbb-empty-state  { display:flex;align-items:flex-start;gap:14px;border:1px solid rgba(255,255,255,.07);padding:24px 20px; }
.pbb-empty-icon   { width:36px;height:36px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.25);flex-shrink:0; }
.pbb-empty-title  { font-size:14px;font-weight:600;color:rgba(255,255,255,.60);margin-bottom:4px; }
.pbb-empty-body   { font-size:12px;color:rgba(255,255,255,.28);line-height:1.6; }

/* ── Section ─────────────────────────────────────────────────── */
.pbb-sec-head  { display:flex;align-items:center;justify-content:space-between;margin-bottom:12px; }
.pbb-sec-title { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.30);text-transform:uppercase;letter-spacing:.10em; }
.pbb-sec-count { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.20); }

/* ── Milestone list ──────────────────────────────────────────── */
.pbb-ms-list { display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.07); }
.pbb-ms-block { background:#0d0d0d;border-bottom:1px solid rgba(255,255,255,.06); }
.pbb-ms-block:last-child { border-bottom:none; }
.pbb-ms-block--done    { opacity:.55; }
.pbb-ms-block--disp    { background:rgba(251,191,36,.02);border-left:2px solid rgba(251,191,36,.35); }
.pbb-ms-block--pending { background:rgba(255,255,255,.01); }
.pbb-ms-block--flash   { animation:pbbFlash .4s ease; }
.pbb-ms-row   { display:flex;align-items:flex-start; }
.pbb-ms-num   { width:28px;height:28px;border-radius:4px;flex-shrink:0;border:1px solid rgba(255,255,255,.15);margin:20px 16px 20px 18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-family:'DM Mono',monospace;font-weight:800;color:rgba(255,255,255,.40); }
.pbb-ms-num--done { border-color:#4ade80;color:#4ade80; }
.pbb-ms-num--disp { border-color:rgba(251,191,36,.50);color:#fbbf24; }
.pbb-ms-info  { flex:1;min-width:0;padding:20px 0 20px 2px; }
.pbb-ms-title-row { display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap; }
.pbb-ms-title { font-size:14px;font-weight:600;color:#fff;letter-spacing:-.02em;font-family:'DM Sans',sans-serif; }
.pbb-ms-cond  { font-size:12px;color:rgba(255,255,255,.38);line-height:1.65;max-width:440px;margin-bottom:8px; }
.pbb-ms-meta  { display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
.pbb-ms-dl    { display:flex;align-items:center;gap:4px;font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.22); }
.pbb-ms-released { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.28); }
.pbb-tx-link  { display:flex;align-items:center;gap:4px;font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.28);text-decoration:none; }
.pbb-tx-link:hover { color:#d4ff00; }
.pbb-ms-right { display:flex;flex-direction:column;align-items:flex-end;gap:10px;flex-shrink:0;padding:20px 22px; }
.pbb-ms-amt-block { text-align:right; }
.pbb-ms-amt     { font-family:'DM Mono',monospace;font-size:14px;font-weight:600;letter-spacing:-.02em;line-height:1;color:#fff; }
.pbb-ms-amt--done { color:#4ade80; }
.pbb-ms-amt-sub { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.22);margin-top:4px; }
.pbb-ms-actions { display:flex;align-items:center;gap:5px;flex-wrap:wrap;justify-content:flex-end; }

.pbb-ms-pill { display:inline-flex;align-items:center;gap:5px;font-size:9px;font-family:'DM Mono',monospace;font-weight:700;letter-spacing:.05em;border:1px solid;border-radius:3px;padding:3px 8px;white-space:nowrap; }
.pbb-spinner-dot { width:5px;height:5px;border-radius:50%;background:currentColor;animation:pbbPulse 1.4s ease infinite; }

.pbb-chip { display:inline-flex;align-items:center;gap:5px;font-size:9px;font-family:'DM Mono',monospace;font-weight:700;letter-spacing:.04em;border-radius:3px;padding:2px 7px;border:1px solid; }
.pbb-chip--disp    { color:#fbbf24;border-color:rgba(251,191,36,.30); }
.pbb-chip--pending { color:rgba(255,255,255,.55);border-color:rgba(255,255,255,.12); }
.pbb-chip--arb     { color:#fbbf24;background:rgba(251,191,36,.10);border-color:rgba(251,191,36,.25); }
.pbb-chip--overdue { color:#f87171;background:rgba(248,113,113,.08);border-color:rgba(248,113,113,.20); }
.pbb-chip--flash   { color:#d4ff00;background:rgba(212,255,0,.08);border-color:rgba(212,255,0,.20); }

.pbb-btn { display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:4px;font-size:11px;font-family:'DM Mono',monospace;font-weight:600;cursor:pointer;border:1px solid;white-space:nowrap;letter-spacing:.02em;min-height:28px; }
.pbb-btn:disabled { opacity:.35;cursor:not-allowed; }
.pbb-btn--dispute  { color:rgba(255,255,255,.70);background:transparent;border-color:rgba(255,255,255,.15); }
.pbb-btn--dispute:hover:not(:disabled) { border-color:rgba(255,255,255,.30);color:#fff; }
.pbb-btn--evidence { color:#fbbf24;background:transparent;border-color:rgba(251,191,36,.25); }
.pbb-btn--evidence:hover { border-color:rgba(251,191,36,.50); }
.pbb-btn--retry    { color:#f87171;background:transparent;border-color:rgba(248,113,113,.25); }
.pbb-btn--retry:hover { border-color:rgba(248,113,113,.45); }
.pbb-filed { display:inline-flex;align-items:center;gap:5px;font-size:10px;font-family:'DM Mono',monospace;font-weight:700;color:#4ade80;border:1px solid rgba(74,222,128,.25);border-radius:3px;padding:3px 9px; }

.pbb-disp-panel   { border-top:1px solid rgba(251,191,36,.10);padding:16px 22px; }
.pbb-disp-awaiting { font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.28); }

/* ── Deadline badge ──────────────────────────────────────────── */
.pbb-deadline { display:inline-flex;align-items:center;gap:5px;font-size:9px;font-family:'DM Mono',monospace;font-weight:600;color:rgba(255,255,255,.35);background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:4px;padding:2px 8px;letter-spacing:.02em; }
.pbb-deadline--overdue { color:#f87171;background:rgba(248,113,113,.07);border-color:rgba(248,113,113,.20); }

/* ── Arbitrator banner ───────────────────────────────────────── */
.pbb-arb-banner { margin:4px 0 8px;border:1px solid;border-radius:6px;overflow:hidden; }
.pbb-arb-head   { display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid; }
.pbb-arb-eyebrow{ font-size:9px;font-family:'DM Mono',monospace;font-weight:700;text-transform:uppercase;letter-spacing:.10em;margin-bottom:2px; }
.pbb-arb-title  { font-size:12px;font-weight:700;letter-spacing:-.02em; }
.pbb-arb-you    { font-size:9px;font-family:'DM Mono',monospace;font-weight:700;text-transform:uppercase;letter-spacing:.06em;border:1px solid;border-radius:3px;padding:2px 7px;flex-shrink:0; }
.pbb-arb-body   { padding:10px 14px;display:flex;flex-direction:column;gap:8px; }
.pbb-arb-msg    { font-size:12px;color:rgba(255,255,255,.45);line-height:1.6;margin:0; }
.pbb-arb-note   { background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:5px;padding:9px 11px; }
.pbb-arb-note-label { font-size:9px;font-family:'DM Mono',monospace;font-weight:600;text-transform:uppercase;letter-spacing:.10em;color:rgba(255,255,255,.30);margin-bottom:5px; }
.pbb-arb-note-text  { font-size:12px;color:rgba(255,255,255,.55);line-height:1.65;font-style:italic;margin:0; }
.pbb-arb-meta   { display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
.pbb-arb-meta-item { font-size:9px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.28); }
.pbb-arb-sep    { color:rgba(255,255,255,.15);font-size:10px; }
.pbb-arb-ai     { font-size:8px;font-family:'DM Mono',monospace;font-weight:700;text-transform:uppercase;letter-spacing:.08em;border:1px solid;border-radius:3px;padding:2px 6px; }

/* ── Info / Complete ─────────────────────────────────────────── */
.pbb-info-strip { display:flex;align-items:flex-start;gap:10px;border:1px solid rgba(255,255,255,.07);padding:14px 16px; }
.pbb-info-text  { font-size:12px;color:rgba(255,255,255,.28);line-height:1.7;margin:0; }
.pbb-complete-banner { text-align:center;border:1px solid rgba(74,222,128,.20);padding:48px 28px; }
.pbb-complete-icon   { width:52px;height:52px;border-radius:50%;background:#d4ff00;display:flex;align-items:center;justify-content:center;margin:0 auto 18px; }
.pbb-complete-title  { font-family:'Syne',sans-serif;font-size:22px;font-weight:800;letter-spacing:-.04em;color:#fff;margin-bottom:8px; }
.pbb-complete-body   { font-size:13px;color:rgba(255,255,255,.35);margin-bottom:0; }

/* ── History ─────────────────────────────────────────────────── */
.pbb-hist-list { display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.07);margin-top:24px; }
.pbb-hist-row  { display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);transition:background .15s; }
.pbb-hist-row:last-child { border-bottom:none; }
.pbb-hist-row:hover { background:rgba(255,255,255,.02); }
.pbb-hist-row--open { background:rgba(255,255,255,.02); }
.pbb-hist-row-left  { display:flex;align-items:center;gap:10px;flex:1;min-width:0; }
.pbb-hist-row-right { display:flex;align-items:center;gap:14px;flex-shrink:0; }
.pbb-hist-id     { font-size:11px;font-family:'DM Mono',monospace;font-weight:700;color:rgba(255,255,255,.35);flex-shrink:0; }
.pbb-hist-payer  { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.28); }
.pbb-hist-amount { font-size:12px;font-family:'DM Mono',monospace;font-weight:600;color:rgba(255,255,255,.60); }
.pbb-hist-bar-wrap  { display:flex;flex-direction:column;align-items:flex-end;gap:4px; }
.pbb-hist-bar-label { font-size:9px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.28); }
.pbb-hist-bar    { width:52px;height:3px;background:rgba(255,255,255,.07);overflow:hidden; }
.pbb-hist-bar-fill { height:100%;transition:width .4s ease; }
.pbb-hist-chevron { color:rgba(255,255,255,.25);transition:transform .2s; }
.pbb-hist-chevron--open { transform:rotate(180deg); }
.pbb-hist-expanded { width:100%;flex-basis:100%;border-top:1px solid rgba(255,255,255,.06);padding:12px 0 4px;display:flex;flex-direction:column;gap:0; }
.pbb-hist-ms { display:flex;align-items:center;gap:10px;padding:8px 0; }
.pbb-hist-ms-dot { width:20px;height:20px;border-radius:3px;flex-shrink:0;border:1px solid;display:flex;align-items:center;justify-content:center;font-size:9px;font-family:'DM Mono',monospace;font-weight:700; }
.pbb-hist-ms-title { font-size:12px;font-weight:500;color:rgba(255,255,255,.55); }
.pbb-hist-ms-cond  { font-size:10px;color:rgba(255,255,255,.28);margin-top:2px; }
.pbb-hist-ms-right { display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:auto; }
.pbb-hist-ms-amt { font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.45); }
.pbb-hist-open-link { display:inline-block;margin-top:8px;font-size:11px;font-family:'DM Mono',monospace;color:#d4ff00;text-decoration:none; }
.pbb-hist-open-link:hover { text-decoration:underline; }

/* ── Spinners ────────────────────────────────────────────────── */
.pbb-spinner-xs { display:inline-block;width:7px;height:7px;border-radius:50%;border:1.5px solid rgba(255,255,255,.15);border-top-color:rgba(255,255,255,.6);animation:pbbSpin .65s linear infinite;flex-shrink:0; }
.pbb-spinner-sm { display:inline-block;flex-shrink:0;width:12px;height:12px;border-radius:50%;border:1.5px solid rgba(255,255,255,.12);border-top-color:rgba(255,255,255,.60);animation:pbbSpin .65s linear infinite; }

/* ── Modal ───────────────────────────────────────────────────── */
.pbb-modal-bd { position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.80);display:flex;align-items:center;justify-content:center;padding:16px; }
.pbb-modal    { width:100%;max-width:640px;background:#111;border:1px solid rgba(255,255,255,.10);overflow:hidden;display:flex;flex-direction:column;max-height:90vh; }
.pbb-modal--confirm { max-width:440px; }
.pbb-modal-head { display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0; }
.pbb-modal-head-left { display:flex;align-items:center;gap:12px;min-width:0; }
.pbb-modal-icon { width:34px;height:34px;border-radius:4px;flex-shrink:0;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.20);display:flex;align-items:center;justify-content:center; }
.pbb-modal-eyebrow { font-size:9px;font-family:'DM Mono',monospace;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:.10em;margin-bottom:3px; }
.pbb-modal-title   { font-family:'Syne',sans-serif;font-size:15px;font-weight:800;color:#fff;letter-spacing:-.03em; }
.pbb-modal-subtitle{ font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.28);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px; }
.pbb-modal-close   { width:28px;height:28px;border-radius:4px;flex-shrink:0;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.10);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.35);cursor:pointer; }
.pbb-modal-close:hover { background:rgba(255,255,255,.10);color:#fff; }
.pbb-modal-body    { padding:20px;display:flex;flex-direction:column;gap:16px;flex-shrink:0; }
.pbb-modal-body--scroll { overflow-y:auto;flex:1;padding:0; }
.pbb-modal-warn { display:flex;align-items:flex-start;gap:10px;border:1px solid rgba(251,191,36,.18);padding:13px 14px; }
.pbb-modal-warn svg { flex-shrink:0;margin-top:1px; }
.pbb-modal-warn p { font-size:12px;color:rgba(255,255,255,.45);line-height:1.65;margin:0; }
.pbb-modal-grid { display:grid;grid-template-columns:1fr 1fr;border:1px solid rgba(255,255,255,.07); }
.pbb-modal-cell { background:#161616;padding:13px 14px;display:flex;flex-direction:column;gap:5px;border-right:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06); }
.pbb-modal-cell:nth-child(even) { border-right:none; }
.pbb-modal-cell-label { font-size:9px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.25);text-transform:uppercase;letter-spacing:.11em; }
.pbb-modal-cell-val   { font-size:13px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.75);font-weight:600;letter-spacing:-.01em;word-break:break-all; }
.pbb-modal-footer { display:flex;align-items:center;justify-content:flex-end;gap:10px;padding-top:4px; }

.pbb-cta-secondary { display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 24px;border-radius:4px;cursor:pointer;background:transparent;color:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.12);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500; }
.pbb-cta-secondary:hover { border-color:rgba(255,255,255,.22);color:#fff; }
.pbb-cta-dispute  { display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 20px;border-radius:4px;cursor:pointer;background:#d4ff00;color:#0a0a0a;border:none;font-family:'Syne',sans-serif;font-size:13px;font-weight:700; }
.pbb-cta-dispute:hover:not(:disabled) { background:#e0ff33; }
.pbb-cta-dispute:disabled { opacity:.45;cursor:not-allowed; }

/* ═══════════════════════════════════════════════════════════════
   RESPONSIVE BREAKPOINTS
   ═══════════════════════════════════════════════════════════════ */

/* ── 1024px ─────────────────────────────────────────────────── */
@media (max-width:1024px) {
  .pbb-topbar { padding:0 20px; }
  .pbb-main   { padding:32px 32px 64px;gap:22px; }
  .pbb-stats  { grid-template-columns:repeat(2,1fr); }
  .pbb-stat:nth-child(2) { border-right:none; }
  .pbb-stat:nth-child(3) { border-right:1px solid rgba(255,255,255,.07); }
  .pbb-stat:nth-child(4) { border-right:none; }
}

/* ── 900px — sidebar becomes a drawer ──────────────────────── */
@media (max-width:900px) {
  .pbb-ham { display:flex; }
  .pbb-overlay { display:block; }
  .pbb-sidebar {
    position:fixed;left:0;bottom:0;z-index:160;
    width:260px;height:100vh;top:0;
    transform:translateX(-100%);
    border-right:1px solid rgba(255,255,255,.10);
  }
  .pbb-sidebar--open { transform:translateX(0);animation:pbbSlide .26s cubic-bezier(.16,1,.3,1); }
  .pbb-main { padding:24px 20px 56px; }
}

/* ── 768px ──────────────────────────────────────────────────── */
@media (max-width:768px) {
  .pbb-topbar { padding:0 16px;height:50px;gap:8px; }
  .pbb-nav-sep { margin:0 12px; }
  .pbb-bc-id,.pbb-bc-arr-last,.pbb-bc-cur { display:none; }
  .pbb-ts { display:none; }
  .pbb-main { padding:20px 16px 52px;gap:18px; }
  .pbb-page-title { font-size:22px; }
  .pbb-stats { grid-template-columns:repeat(2,1fr); }
  .pbb-stat  { padding:16px 14px; }
  .pbb-stat-icon { font-size:15px;margin-bottom:14px; }
  .pbb-ms-right { padding:14px 16px; }
}

/* ── 580px ──────────────────────────────────────────────────── */
@media (max-width:580px) {
  .pbb-topbar { height:48px;padding:0 12px; }
  .pbb-brand-name { font-size:13px; }
  .pbb-live-label { display:none; }
  .pbb-live { padding:4px 8px; }
  .pbb-wallet { padding:4px 9px; }
  .pbb-wallet-addr { font-size:9px; }

  .pbb-main { padding:16px 12px 48px;gap:16px; }
  .pbb-page-title { font-size:20px; }

  .pbb-stats { grid-template-columns:1fr 1fr; }
  .pbb-stat  { padding:14px 12px; }
  .pbb-stat-value { font-size:13px; }
  .pbb-stat-sub   { font-size:9px; }

  .pbb-prog-card { padding:14px; }
  .pbb-prog-pct  { font-size:16px; }

  /* Milestone rows: stack vertically */
  .pbb-ms-row  { flex-direction:column; }
  .pbb-ms-num  { margin:12px 0 0 14px;align-self:flex-start; }
  .pbb-ms-info { padding:8px 14px; }
  .pbb-ms-title { font-size:13px; }
  .pbb-ms-cond  { font-size:11px;max-width:100%; }
  .pbb-ms-right { flex-direction:row;align-items:center;justify-content:space-between;padding:8px 14px 14px;gap:8px; }
  .pbb-ms-amt-block { text-align:left; }
  .pbb-ms-amt   { font-size:12px; }
  .pbb-ms-actions { justify-content:flex-start; }

  .pbb-disp-panel { padding:12px 14px; }

  .pbb-complete-banner { padding:28px 16px; }
  .pbb-complete-title  { font-size:18px; }

  .pbb-info-strip { padding:12px 14px; }
  .pbb-info-text  { font-size:11px; }

  .pbb-hist-row    { padding:12px; }
  .pbb-hist-bar    { width:40px; }
  .pbb-hist-row-right { gap:8px; }

  /* Modal: bottom sheet */
  .pbb-modal-bd { align-items:flex-end;padding:0; }
  .pbb-modal,.pbb-modal--confirm { max-width:100%;border-radius:0;border-left:none;border-right:none;border-bottom:none;max-height:92vh; }
  .pbb-modal-head { padding:14px 16px; }
  .pbb-modal-body { padding:14px 16px;gap:12px; }
  .pbb-modal-footer { flex-direction:column-reverse;gap:8px; }
  .pbb-cta-secondary,.pbb-cta-dispute { width:100%;justify-content:center;padding:12px 16px; }
  .pbb-modal-grid { grid-template-columns:1fr; }
  .pbb-modal-cell { border-right:none !important; }
}

/* ── 400px ──────────────────────────────────────────────────── */
@media (max-width:400px) {
  .pbb-topbar { padding:0 10px; }
  .pbb-brand-name { display:none; }
  .pbb-wallet { display:none; }
  .pbb-nav-sep,.pbb-breadcrumb { display:none; }
  .pbb-main { padding:14px 10px 48px; }
  .pbb-stats { grid-template-columns:1fr; }
  .pbb-stat  { border-right:none !important;border-bottom:1px solid rgba(255,255,255,.07); }
  .pbb-stat:last-child { border-bottom:none; }
  .pbb-btn { padding:5px 8px;font-size:10px; }
  .pbb-ms-amt { font-size:11px; }
  .pbb-hist-bar-wrap { display:none; }
}

/* ── Touch targets ──────────────────────────────────────────── */
@media (max-width:768px) {
  .pbb-btn { min-height:36px; }
  .pbb-cta-secondary,.pbb-cta-dispute { min-height:44px; }
  .pbb-nav-item { min-height:44px; }
  .pbb-modal-close { width:36px;height:36px; }
}

/* ── Safe area (iOS notch) ──────────────────────────────────── */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .pbb-main { padding-bottom: max(56px, calc(env(safe-area-inset-bottom) + 24px)); }
  .pbb-topbar { padding-left: max(12px, env(safe-area-inset-left)); padding-right: max(12px, env(safe-area-inset-right)); }
  .pbb-sidebar { padding-bottom: max(24px, env(safe-area-inset-bottom)); }
}

/* ── Overflow guard ─────────────────────────────────────────── */
.pbb-main,.pbb-ms-block,.pbb-ms-info,.pbb-stat,.pbb-modal { min-width:0;max-width:100%; }
`;
