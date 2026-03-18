"use client";
// ============================================================
// components/partyA/ScreenDashboard.tsx — FULLY RESPONSIVE
// Breakpoints: 1024 / 900 / 768 / 580 / 400
// Key changes vs original:
//   - Hamburger button opens sidebar as a slide-in drawer on mobile
//   - Overlay backdrop closes sidebar on outside tap
//   - Stats grid 4→2→1 col cascade
//   - Milestone rows stack vertically on phones
//   - Topbar items progressively collapse
//   - Modal becomes a bottom sheet on mobile
//   - All touch targets ≥ 44px
//   - iOS safe-area insets applied
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
import DisputeSubmitScreen from "@/components/screens/Shared/DisputeSubmitScreen";
import { getSocket, joinAgreementRoom, joinDisputeRoom } from "@/lib/socket";
import {
  useSyncedAgreement,
  type SyncedMilestone,
} from "@/hook/useSyncedAgreement";

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
  deadline_dt: string | null;
  deadline: string;
  amountUsd: string;
  amountSats: number;
}
interface ArbitratorDecision {
  outcome: "release_to_receiver" | "refund_to_payer" | "split";
  followed_ai: boolean;
  override_reason?: string;
  decided_at: string;
  arbitrator_address: string;
}

function statusMeta(s: MilestoneUIStatus) {
  switch (s) {
    case "complete":
      return {
        label: "Released",
        color: "#4ade80",
        bg: "rgba(74,222,128,0.08)",
        border: "rgba(74,222,128,0.18)",
      };
    case "disputed":
      return {
        label: "In Dispute",
        color: "#d4ff00",
        bg: "rgba(212,255,0,0.08)",
        border: "rgba(212,255,0,0.20)",
      };
    case "refunded":
      return {
        label: "Refunded",
        color: "#f87171",
        bg: "rgba(248,113,113,0.08)",
        border: "rgba(248,113,113,0.18)",
      };
    case "failed":
      return {
        label: "Tx Failed",
        color: "#f87171",
        bg: "rgba(248,113,113,0.08)",
        border: "rgba(248,113,113,0.18)",
      };
    case "pending":
      return {
        label: "Confirming",
        color: "rgba(255,255,255,0.45)",
        bg: "rgba(255,255,255,0.04)",
        border: "rgba(255,255,255,0.10)",
      };
    default:
      return {
        label: "Locked",
        color: "rgba(255,255,255,0.25)",
        bg: "rgba(255,255,255,0.03)",
        border: "rgba(255,255,255,0.08)",
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

const truncateAddr = (a: string) =>
  a ? `${a.slice(0, 8)}…${a.slice(-5)}` : "";
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
function fmtDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
const isOverdue = (iso: string | null | undefined) => {
  try {
    return !!iso && new Date(iso).getTime() < Date.now();
  } catch {
    return false;
  }
};

function DeadlineBadge({ iso }: { iso: string | null | undefined }) {
  if (!iso) return null;
  const label = fmtDeadline(iso);
  if (!label) return null;
  const overdue = isOverdue(iso);
  return (
    <span className={`db-deadline${overdue ? " db-deadline--overdue" : ""}`}>
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

function ArbitratorDecisionBanner({
  decision,
  viewerRole,
}: {
  decision: ArbitratorDecision;
  viewerRole: "A" | "B";
}) {
  const isRelease = decision.outcome === "release_to_receiver";
  const c = isRelease ? "#4ade80" : "#f87171";
  return (
    <div
      className="db-arb-banner"
      style={{ borderColor: `${c}28`, background: `${c}06` }}
    >
      <div
        className="db-arb-head"
        style={{ background: `${c}0a`, borderColor: `${c}18` }}
      >
        <span style={{ fontSize: 13 }}>⚖</span>
        <div>
          <div className="db-arb-eyebrow" style={{ color: c }}>
            Arbitrator Decision
          </div>
          <div className="db-arb-title" style={{ color: c }}>
            {isRelease
              ? "Funds Released to Receiver"
              : "Funds Refunded to Payer"}
          </div>
        </div>
      </div>
      <div className="db-arb-body">
        <p className="db-arb-msg">
          {isRelease
            ? "The arbitrator ruled in favour of the Receiver."
            : "The arbitrator ruled in your favour. Funds were returned to your wallet."}
        </p>
        {decision.override_reason && (
          <div className="db-arb-note">
            <div className="db-arb-note-label">Arbitrator's Note</div>
            <p className="db-arb-note-text">"{decision.override_reason}"</p>
          </div>
        )}
        <div className="db-arb-meta">
          <span className="db-arb-meta-item">
            By {truncateAddr(decision.arbitrator_address)}
          </span>
          <span className="db-arb-sep">·</span>
          <span className="db-arb-meta-item">
            {fmtDate(decision.decided_at)}
          </span>
          <span className="db-arb-sep">·</span>
          <span
            className="db-arb-ai"
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

export default function ScreenDashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const {
    editedTerms,
    agreementId,
    walletAddress,
    amountLocked: reduxAmountLocked,
    txMilestone,
    milestoneOnChainStatuses,
  } = useSelector((s: RootState) => s.partyA);

  const t = editedTerms as any;
  const v2 = isV2(editedTerms)
    ? (editedTerms as unknown as ParsedAgreementV2)
    : null;
  const totalAmountUsd = parseFloat(
    String(t?.total_usd ?? t?.amount_usd ?? reduxAmountLocked ?? "0"),
  );
  const totalSats = usdToSatsPreview(totalAmountUsd);
  const payerName = t?.payer ?? t?.partyA ?? "Payer";
  const receiverName = t?.receiver ?? t?.partyB ?? "Receiver";
  const arbitratorTerms = t?.arbitrator ?? "TBD";
  const termsMillestones: any[] = t?.milestones ?? [];

  const milestonesMeta: MilestoneUI[] = v2?.milestones?.map((ms, i) => {
    const tm = termsMillestones.find(
      (x: any) => x.title === ms.title || x.index === i,
    );
    return {
      index: i,
      title: ms.title || `Milestone ${i + 1}`,
      percentage: ms.percentage,
      condition: ms.condition ?? "",
      deadline_dt: ms.deadline_dt ?? tm?.deadline_dt ?? null,
      deadline: ms.deadline ?? tm?.deadline ?? "",
      amountUsd: (((totalAmountUsd || 0) * ms.percentage) / 100).toFixed(2),
      amountSats: Math.round((totalSats * ms.percentage) / 100),
    };
  }) ?? [
    {
      index: 0,
      title: "Full Payment",
      percentage: 100,
      condition: t?.condition ?? "Payer confirms work is complete.",
      deadline_dt: termsMillestones[0]?.deadline_dt ?? null,
      deadline: t?.deadline ?? "",
      amountUsd: String(totalAmountUsd),
      amountSats: totalSats,
    },
  ];

  const localOptimistic: Record<
    number,
    { status: string; txId?: string | null; txUrl?: string | null }
  > = {};
  if (txMilestone) {
    Object.entries(txMilestone).forEach(([i, tx]) => {
      if (["pending", "confirming", "failed"].includes(tx.status))
        localOptimistic[parseInt(i)] = {
          status: tx.status,
          txId: tx.txId,
          txUrl: tx.txUrl,
        };
    });
  }

  const {
    milestones: dbMilestones,
    arbDecisions: dbArbDecisions,
    arbitrator: dbArbitrator,
    connected,
    loading,
    lastUpdate,
    flashIndex,
    refetch,
  } = useSyncedAgreement({ agreementId, walletAddress, localOptimistic });

  const getStatus = useCallback(
    (index: number): MilestoneUIStatus => {
      const tx = txMilestone?.[index];
      if (tx?.status === "pending" || tx?.status === "confirming")
        return "pending";
      if (tx?.status === "failed") return "failed";
      const dbMs = dbMilestones.find((m) => m.index === index);
      if (dbMs) return dbMs.status as MilestoneUIStatus;
      const oc = milestoneOnChainStatuses?.[index];
      if (oc !== undefined) {
        switch (oc) {
          case 2:
            return "complete";
          case 3:
            return "disputed";
          case 4:
            return "refunded";
          default:
            return "locked";
        }
      }
      return "locked";
    },
    [txMilestone, dbMilestones, milestoneOnChainStatuses],
  );

  const arbDecisions = dbArbDecisions;
  const displayArbitrator = dbArbitrator ?? arbitratorTerms;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [evidenceModalMs, setEvidenceModalMs] = useState<MilestoneUI | null>(
    null,
  );
  const [disputeSubmitted, setDisputeSubmitted] = useState<
    Record<number, boolean>
  >({});
  const [savedToDb, setSavedToDb] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(0);
  const [disputeModal, setDisputeModal] = useState<{
    open: boolean;
    ms: MilestoneUI | null;
    step: "confirm" | "submit";
  }>({ open: false, ms: null, step: "confirm" });

  const openDisputeModal = (ms: MilestoneUI) =>
    setDisputeModal({ open: true, ms, step: "confirm" });
  const closeDisputeModal = () =>
    setDisputeModal({ open: false, ms: null, step: "confirm" });

  useEffect(() => {
    if (!agreementId || savedToDb || milestonesMeta.length === 0) return;
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
        milestones: milestonesMeta.map((ms) => ({
          index: ms.index,
          title: ms.title,
          percentage: ms.percentage,
          condition: ms.condition,
          deadline: ms.deadline || undefined,
          deadline_dt: ms.deadline_dt || "",
          amountUsd: ms.amountUsd,
          amountSats: ms.amountSats,
        })),
      }),
    );
  }, [agreementId]); // eslint-disable-line

  useEffect(() => {
    if (!agreementId) return;
    const socket = getSocket();
    joinAgreementRoom(agreementId);
    const onDisp = (p: any) => {
      if (p.agreement_id && p.agreement_id !== agreementId) return;
      setLastRefresh(Date.now());
      const idx = p.milestone_index ?? p.milestoneIndex;
      if (idx !== undefined) joinDisputeRoom(agreementId!, idx);
    };
    socket.on("dispute:updated", onDisp);
    return () => {
      socket.off("dispute:updated", onDisp);
    };
  }, [agreementId]);

  useEffect(() => {
    if (!txMilestone) return;
    Object.entries(txMilestone).forEach(([i, tx]) => {
      if ((tx.status === "pending" || tx.status === "confirming") && tx.txId)
        dispatch(
          pollMilestoneTxThunk({
            milestoneIndex: parseInt(i),
            txId: tx.txId,
            agreementId: agreementId ?? undefined,
            action: "complete",
            callerAddress: walletAddress ?? undefined,
            onConfirmed: () => {
              setLastRefresh(Date.now());
              refetch();
            },
          }),
        );
    });
  }, [txMilestone]); // eslint-disable-line

  useEffect(() => {
    if (lastRefresh > 0) refetch();
  }, [lastRefresh]); // eslint-disable-line

  async function handleDisputeConfirm(ms: MilestoneUI) {
    if (!agreementId) return;
    const r = await dispatch(
      disputeMilestoneThunk({ agreementId, milestoneIndex: ms.index }),
    );
    if (disputeMilestoneThunk.fulfilled.match(r)) {
      dispatch(
        pollMilestoneTxThunk({
          milestoneIndex: ms.index,
          txId: r.payload.txId,
          agreementId,
          action: "dispute",
          callerAddress: walletAddress ?? undefined,
          onConfirmed: () => {
            setLastRefresh(Date.now());
            setDisputeModal((p) => ({ ...p, step: "submit" }));
          },
        }),
      );
      setDisputeModal((p) => ({ ...p, step: "submit" }));
    }
  }
  async function handleRelease(ms: MilestoneUI) {
    if (!agreementId || !walletAddress) return;
    const r = await dispatch(
      completeMilestoneThunk({
        agreementId,
        milestoneIndex: ms.index,
        milestoneAmountSats: BigInt(ms.amountSats),
      }),
    );
    if (completeMilestoneThunk.fulfilled.match(r))
      dispatch(
        pollMilestoneTxThunk({
          milestoneIndex: ms.index,
          txId: r.payload.txId,
          agreementId,
          action: "complete",
          callerAddress: walletAddress,
          onConfirmed: () => {
            setLastRefresh(Date.now());
            refetch();
          },
        }),
      );
  }
  async function handleTimeout(ms: MilestoneUI) {
    if (!agreementId) return;
    const r = await dispatch(
      triggerTimeoutThunk({
        agreementId,
        milestoneIndex: ms.index,
        milestoneAmountSats: BigInt(ms.amountSats),
      }),
    );
    if (triggerTimeoutThunk.fulfilled.match(r))
      dispatch(
        pollMilestoneTxThunk({
          milestoneIndex: ms.index,
          txId: r.payload.txId,
          agreementId,
          action: "timeout",
          callerAddress: walletAddress ?? undefined,
          onConfirmed: () => {
            setLastRefresh(Date.now());
            refetch();
          },
        }),
      );
  }

  const completedCount = milestonesMeta.filter((m) =>
    ["complete", "refunded"].includes(getStatus(m.index)),
  ).length;
  const progressPct =
    milestonesMeta.length > 0
      ? Math.round((completedCount / milestonesMeta.length) * 100)
      : 0;
  const allComplete = milestonesMeta.every((m) =>
    ["complete", "refunded"].includes(getStatus(m.index)),
  );
  const releasedUsd = milestonesMeta
    .filter((m) => getStatus(m.index) === "complete")
    .reduce((s, m) => s + parseFloat(m.amountUsd), 0);

  return (
    <div>
      <style>{css}</style>

      {/* ── Topbar ── */}
      <header className="db-topbar">
        <div className="db-topbar-left">
          <button
            className="db-ham"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <span />
            <span />
            <span />
          </button>
          <a
            className="db-brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              localStorage.removeItem("pA_screen");
              localStorage.removeItem("pA_agreementId");
              window.location.href = "/";
            }}
          >
            <span className="db-brand-mark">◈</span>
            <span className="db-brand-name">ClauseAI</span>
          </a>
          <div className="db-nav-sep" />
          <nav className="db-breadcrumb">
            <span className="db-bc-dim">Agreement</span>
            <span className="db-bc-arr">›</span>
            <span className="db-bc-id">#{agreementId}</span>
            <span className="db-bc-arr db-bc-arr-last">›</span>
            <span className="db-bc-cur">Party A</span>
          </nav>
        </div>
        <div className="db-topbar-right">
          {lastUpdate && (
            <span className="db-ts">{lastUpdate.toLocaleTimeString()}</span>
          )}
          {walletAddress && (
            <div className="db-wallet">
              <span className="db-wallet-dot" />
              <span className="db-wallet-addr">
                {walletAddress.slice(0, 8)}…{walletAddress.slice(-5)}
              </span>
            </div>
          )}
          <div className={`db-live${connected ? "" : " db-live--off"}`}>
            <span
              className={`db-live-dot${connected ? "" : " db-live-dot--off"}`}
            />
            <span className="db-live-label">
              {connected ? "sBTC Live" : "Reconnecting"}
            </span>
          </div>
        </div>
      </header>

      {sidebarOpen && (
        <div className="db-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="db-shell">
        {/* ── Sidebar ── */}
        <aside
          className={`db-sidebar${sidebarOpen ? " db-sidebar--open" : ""}`}
        >
          <div className="db-sb-block">
            <div className="db-sb-label">Navigation</div>
            <nav className="db-nav">
              <button
                className="db-nav-item db-nav-item--active"
                onClick={() => setSidebarOpen(false)}
              >
                <span className="db-nav-icon">
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
                  className="db-nav-item"
                  onClick={() => {
                    dispatch(setScreen("complete"));
                    setSidebarOpen(false);
                  }}
                >
                  <span className="db-nav-icon">
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

          <div className="db-ring-wrap">
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
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
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
            <div className="db-ring-label">
              {completedCount}/{milestonesMeta.length} milestones
            </div>
          </div>

          <div className="db-sb-block">
            <div className="db-sb-label">Agreement</div>
            <div className="db-meta-list">
              {[
                {
                  k: "Status",
                  v: (
                    <span
                      className={`db-state-tag ${allComplete ? "db-state-tag--complete" : "db-state-tag--active"}`}
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
                <div key={k} className="db-meta-row">
                  <span className="db-meta-key">{k}</span>
                  <span className="db-meta-val">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {milestonesMeta.length > 1 && (
            <div className="db-sb-block">
              <div className="db-sb-label">Milestones</div>
              <div className="db-mini-list">
                {milestonesMeta.map((ms, i) => {
                  const st = getStatus(ms.index);
                  const col = MS_COLORS[i % MS_COLORS.length];
                  return (
                    <div key={i} className="db-mini">
                      <div
                        className="db-mini-dot"
                        style={{
                          background: col + "15",
                          border: `1px solid ${col}30`,
                          color: col,
                        }}
                      >
                        {st === "complete" ? "✓" : i + 1}
                      </div>
                      <div className="db-mini-body">
                        <div className="db-mini-title">{ms.title}</div>
                        <div className="db-mini-track">
                          <div
                            className="db-mini-fill"
                            style={{
                              width: `${ms.percentage}%`,
                              background: col,
                            }}
                          />
                        </div>
                      </div>
                      <div className="db-mini-pct">{ms.percentage}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="db-sb-footer">
            <button
              className="db-ghost-sm"
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

        {/* ── Main ── */}
        <main className="db-main">
          <div className="db-page-header">
            <div>
              <div className="db-eyebrow">Payer Dashboard</div>
              <h1 className="db-page-title">Manage Agreement</h1>
            </div>
            <div className="db-id-chip">
              <span className="db-id-label">ID</span>
              <span className="db-id-val">#{agreementId}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="db-stats">
            {[
              {
                label: "Total Locked",
                value: formatSats(totalSats),
                sub: `≈ $${totalAmountUsd.toLocaleString()} USD`,
                icon: "◈",
                accent: "#d4ff00",
              },
              {
                label: "Payer",
                value: payerName,
                sub: walletAddress ? `${walletAddress.slice(0, 8)}…` : "You",
                icon: "◉",
                accent: "#ffffff",
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
                  displayArbitrator.length > 14
                    ? `${displayArbitrator.slice(0, 12)}…`
                    : displayArbitrator,
                sub: "dispute resolver",
                icon: "⚖",
                accent: "#60a5fa",
              },
            ].map(({ label, value, sub, icon, accent }) => (
              <div key={label} className="db-stat">
                <div className="db-stat-icon" style={{ color: accent }}>
                  {icon}
                </div>
                <div className="db-stat-label">{label}</div>
                <div className="db-stat-value">{value}</div>
                <div className="db-stat-sub">{sub}</div>
              </div>
            ))}
          </div>

          {/* Progress */}
          <div className="db-prog-card">
            <div className="db-prog-top">
              <span className="db-prog-title">Contract Progress</span>
              <div className="db-prog-right">
                <span
                  className="db-prog-pct"
                  style={{ color: progressPct === 100 ? "#4ade80" : "#d4ff00" }}
                >
                  {progressPct}%
                </span>
                <span className="db-prog-frac">
                  {completedCount}/{milestonesMeta.length}
                </span>
              </div>
            </div>
            <div className="db-prog-track">
              <div
                className="db-prog-fill"
                style={{
                  width: `${progressPct > 0 ? progressPct : 0.5}%`,
                  background: progressPct === 100 ? "#4ade80" : "#d4ff00",
                }}
              />
            </div>
          </div>

          {/* Milestones */}
          <div>
            <div className="db-sec-head">
              <span className="db-sec-title">Milestones</span>
              <span className="db-sec-count">
                {milestonesMeta.length} total
              </span>
            </div>
            {loading && milestonesMeta.length === 0 && (
              <div className="db-ms-loading">
                <span className="db-spinner-sm" /> Loading milestone data…
              </div>
            )}
            <div className="db-ms-list">
              {milestonesMeta.map((ms) => {
                const status = getStatus(ms.index);
                const meta = statusMeta(status);
                const tx = txMilestone?.[ms.index];
                const isDone = ["complete", "refunded"].includes(status);
                const isPending = status === "pending";
                const isFailed = status === "failed";
                const isDisp = status === "disputed";
                const alreadySub = disputeSubmitted[ms.index];
                const accent = MS_COLORS[ms.index % MS_COLORS.length];
                const arbDecision = arbDecisions[ms.index] ?? null;
                const showArbBanner = isDone && arbDecision !== null;
                const overdue = isOverdue(ms.deadline_dt) && !isDone && !isDisp;
                const isFlashing = flashIndex === ms.index;
                const dbMs = dbMilestones.find((m) => m.index === ms.index);
                const dTxId = tx?.txId ?? dbMs?.txId;
                const dTxUrl = tx?.txUrl ?? dbMs?.txUrl;
                return (
                  <div
                    key={ms.index}
                    className={[
                      "db-ms-block",
                      isDone ? "db-ms-block--done" : "",
                      isDisp ? "db-ms-block--disp" : "",
                      isPending ? "db-ms-block--pending" : "",
                      isFlashing ? "db-ms-block--flash" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div className="db-ms-row">
                      <div
                        className="db-ms-bar"
                        style={{
                          background: isDone
                            ? "#4ade80"
                            : isDisp
                              ? "#d4ff00"
                              : accent,
                        }}
                      />
                      <div
                        className="db-ms-num"
                        style={{
                          borderColor: isDone
                            ? "#4ade80"
                            : isDisp
                              ? "#d4ff00"
                              : accent + "60",
                          color: isDone
                            ? "#4ade80"
                            : isDisp
                              ? "#d4ff00"
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
                      <div className="db-ms-info">
                        <div className="db-ms-title-row">
                          <span className="db-ms-title">{ms.title}</span>
                          {isDisp && (
                            <span className="db-chip db-chip--disp">
                              ⚑ Dispute
                            </span>
                          )}
                          {isPending && (
                            <span className="db-chip db-chip--pending">
                              <span className="db-spinner-xs" />
                              Confirming
                            </span>
                          )}
                          {isFailed && (
                            <span className="db-chip db-chip--failed">
                              ⚠ Failed
                            </span>
                          )}
                          {isDone && arbDecision && (
                            <span className="db-chip db-chip--arb">
                              ⚖ Arbitrated
                            </span>
                          )}
                          {overdue && (
                            <span className="db-chip db-chip--overdue">
                              ⚠ Overdue
                            </span>
                          )}
                          {isFlashing && !isDone && !isPending && (
                            <span className="db-chip db-chip--flash">
                              Updated
                            </span>
                          )}
                        </div>
                        {ms.condition && (
                          <p className="db-ms-cond">{ms.condition}</p>
                        )}
                        <div className="db-ms-meta">
                          <DeadlineBadge iso={ms.deadline_dt} />
                          {!ms.deadline_dt && ms.deadline && (
                            <span className="db-ms-dl">
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
                          {dTxId && (
                            <a
                              href={dTxUrl ?? explorerTxUrl(dTxId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="db-tx-link"
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
                              {dTxId.slice(0, 10)}… ↗
                            </a>
                          )}
                          {tx?.error && (
                            <span className="db-tx-err">⚠ {tx.error}</span>
                          )}
                        </div>
                      </div>
                      <div className="db-ms-right">
                        <div className="db-ms-amt-block">
                          <div
                            className="db-ms-amt"
                            style={{ color: isDone ? "#4ade80" : "#ffffff" }}
                          >
                            {formatSats(ms.amountSats)}
                          </div>
                          <div className="db-ms-amt-sub">
                            {ms.percentage}% · ≈ ${ms.amountUsd}
                          </div>
                        </div>
                        <div className="db-ms-actions">
                          <span
                            className="db-status-pill"
                            style={{
                              color: meta.color,
                              background: meta.bg,
                              borderColor: meta.border,
                            }}
                          >
                            {status === "pending" && (
                              <span className="db-spinner-dot" />
                            )}
                            {meta.label}
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
                          {isDisp && !alreadySub && (
                            <button
                              className="db-btn db-btn--evidence"
                              onClick={() => setEvidenceModalMs(ms)}
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
                          {isDisp && alreadySub && (
                            <span className="db-filed">
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
                          {!isDone && !isPending && !isFailed && !isDisp && (
                            <>
                              <button
                                className="db-btn db-btn--release"
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
                                className="db-btn db-btn--dispute"
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
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    {showArbBanner && arbDecision && (
                      <div className="db-disp-panel">
                        <ArbitratorDecisionBanner
                          decision={arbDecision}
                          viewerRole="A"
                        />
                      </div>
                    )}
                    {isDisp && !showArbBanner && (
                      <div className="db-disp-panel">
                        <span className="db-disp-awaiting">
                          ⚑ Dispute is open — awaiting arbitrator decision
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="db-info-strip">
            <p className="db-info-text">
              Click <strong>Release</strong> to send sBTC on-chain once work is
              approved. Use <strong>Dispute</strong> to open arbitration if
              deliverables are unsatisfactory.
            </p>
          </div>

          {allComplete && (
            <div className="db-complete-banner">
              <div className="db-complete-icon">
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
              <div className="db-complete-title">Agreement Complete</div>
              <p className="db-complete-body">
                All milestones have been settled on-chain.
              </p>
              <div className="db-complete-actions">
                <button
                  className="db-cta-primary"
                  onClick={() => dispatch(setScreen("complete"))}
                >
                  View Summary
                </button>
                <button
                  className="db-cta-secondary"
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
          className="db-modal-bd"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDisputeModal();
          }}
        >
          <div className="db-modal">
            <div className="db-modal-head">
              <div className="db-modal-head-left">
                <div className="db-modal-icon">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#d4ff00"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <div>
                  <div className="db-modal-title">Open Dispute</div>
                  <div className="db-modal-subtitle">
                    {disputeModal.ms.title}
                  </div>
                </div>
              </div>
              <button className="db-modal-close" onClick={closeDisputeModal}>
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
            <div className="db-modal-steps">
              <div
                className={`db-modal-step ${disputeModal.step === "confirm" ? "db-modal-step--active" : "db-modal-step--done"}`}
              >
                <div className="db-modal-step-dot">
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
                className="db-modal-step-line"
                style={{
                  background:
                    disputeModal.step === "submit"
                      ? "#d4ff00"
                      : "rgba(255,255,255,0.08)",
                }}
              />
              <div
                className={`db-modal-step ${disputeModal.step === "submit" ? "db-modal-step--active" : "db-modal-step--idle"}`}
              >
                <div className="db-modal-step-dot">2</div>
                <span>Submit Statement</span>
              </div>
            </div>
            {disputeModal.step === "confirm" && (
              <div className="db-modal-body">
                <div className="db-modal-warn">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#d4ff00"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p>
                    This will flag the milestone on-chain and lock funds until
                    the dispute is resolved.
                  </p>
                </div>
                <div className="db-modal-grid">
                  <div className="db-modal-cell">
                    <span className="db-modal-cell-label">Milestone</span>
                    <span className="db-modal-cell-val">
                      {disputeModal.ms.title}
                    </span>
                  </div>
                  <div className="db-modal-cell">
                    <span className="db-modal-cell-label">Amount</span>
                    <span
                      className="db-modal-cell-val"
                      style={{ color: "#d4ff00" }}
                    >
                      {formatSats(disputeModal.ms.amountSats)}{" "}
                      <span style={{ opacity: 0.4, fontSize: 10 }}>
                        ≈ ${disputeModal.ms.amountUsd}
                      </span>
                    </span>
                  </div>
                  <div className="db-modal-cell">
                    <span className="db-modal-cell-label">Arbitrator</span>
                    <span className="db-modal-cell-val">
                      {displayArbitrator.length > 18
                        ? `${displayArbitrator.slice(0, 16)}…`
                        : displayArbitrator}
                    </span>
                  </div>
                  {disputeModal.ms.deadline_dt && (
                    <div className="db-modal-cell">
                      <span className="db-modal-cell-label">Deadline</span>
                      <span
                        className="db-modal-cell-val"
                        style={{
                          color: "rgba(255,255,255,0.55)",
                          fontSize: 11,
                        }}
                      >
                        {fmtDeadline(disputeModal.ms.deadline_dt)}
                      </span>
                    </div>
                  )}
                  {disputeModal.ms.condition && (
                    <div className="db-modal-cell db-modal-cell--full">
                      <span className="db-modal-cell-label">Condition</span>
                      <span
                        className="db-modal-cell-val"
                        style={{
                          color: "rgba(255,255,255,0.45)",
                          fontSize: 12,
                        }}
                      >
                        {disputeModal.ms.condition}
                      </span>
                    </div>
                  )}
                </div>
                <div className="db-modal-footer">
                  <button
                    className="db-cta-secondary"
                    onClick={closeDisputeModal}
                  >
                    Cancel
                  </button>
                  <button
                    className="db-cta-dispute"
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
            {disputeModal.step === "submit" && agreementId && (
              <div className="db-modal-body db-modal-body--scroll">
                <div className="db-modal-tx-notice">
                  <span className="db-spinner-sm" />
                  On-chain dispute submitted. File your statement below.
                </div>
                <DisputeSubmitScreen
                  agreementId={agreementId}
                  milestoneIndex={disputeModal.ms!.index}
                  party="A"
                  milestoneDescription={
                    disputeModal.ms!.condition || disputeModal.ms!.title
                  }
                  contractTerms={{
                    payer: walletAddress ?? t?.payer ?? "",
                    receiver: t?.receiver ?? t?.partyB ?? "",
                    arbitrator: displayArbitrator,
                    total_amount: totalAmountUsd,
                    milestone_description:
                      disputeModal.ms!.condition || disputeModal.ms!.title,
                    milestone_percentage: disputeModal.ms!.percentage,
                    milestone_deadline:
                      disputeModal.ms!.deadline_dt ||
                      disputeModal.ms!.deadline ||
                      undefined,
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

      {/* ── Evidence Modal ── */}
      {evidenceModalMs && agreementId && (
        <div
          className="db-modal-bd"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEvidenceModalMs(null);
          }}
        >
          <div className="db-modal db-modal--evidence">
            <div className="db-modal-head">
              <div className="db-modal-head-left">
                <div className="db-modal-icon">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#d4ff00"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <div>
                  <div className="db-modal-eyebrow">
                    File Evidence · Dispute
                  </div>
                  <div className="db-modal-title">{evidenceModalMs.title}</div>
                </div>
              </div>
              <button
                className="db-modal-close"
                onClick={() => setEvidenceModalMs(null)}
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
            <div className="db-modal-body db-modal-body--scroll">
              <DisputeSubmitScreen
                agreementId={agreementId}
                milestoneIndex={evidenceModalMs.index}
                party="A"
                milestoneDescription={
                  evidenceModalMs.condition || evidenceModalMs.title
                }
                contractTerms={{
                  payer: walletAddress ?? t?.payer ?? "",
                  receiver: t?.receiver ?? t?.partyB ?? "",
                  arbitrator: displayArbitrator,
                  total_amount: totalAmountUsd,
                  milestone_description:
                    evidenceModalMs.condition || evidenceModalMs.title,
                  milestone_percentage: evidenceModalMs.percentage,
                  milestone_deadline:
                    evidenceModalMs.deadline_dt ||
                    evidenceModalMs.deadline ||
                    undefined,
                  agreement_type: t?.agreement_type ?? "freelance",
                }}
                onSubmitted={() => {
                  setDisputeSubmitted((p) => ({
                    ...p,
                    [evidenceModalMs.index]: true,
                  }));
                  setEvidenceModalMs(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const css = `
@keyframes dbSpin  { to{transform:rotate(360deg)} }
@keyframes dbPulse { 0%,100%{opacity:1}50%{opacity:.4} }
@keyframes dbFlash { 0%{background:rgba(212,255,0,.12)}100%{background:transparent} }
@keyframes dbSlide { from{transform:translateX(-100%)}to{transform:translateX(0)} }

/* ── Topbar ─────────────────────────────────────────────────── */
.db-topbar { position:sticky;top:0;z-index:200;height:56px;background:#0a0a0a;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:space-between;padding:0 28px;gap:12px; }
.db-topbar-left  { display:flex;align-items:center;min-width:0;overflow:hidden; }
.db-topbar-right { display:flex;align-items:center;gap:10px;flex-shrink:0; }
.db-ham { display:none;flex-direction:column;justify-content:center;gap:4.5px;width:34px;height:34px;background:none;border:1px solid rgba(255,255,255,.10);border-radius:6px;cursor:pointer;padding:0 9px;flex-shrink:0;margin-right:12px; }
.db-ham span { display:block;height:1.5px;background:rgba(255,255,255,.55);border-radius:2px; }
.db-nav-sep { width:1px;height:16px;background:rgba(255,255,255,.08);margin:0 20px;flex-shrink:0; }
.db-brand { display:flex;align-items:center;gap:9px;text-decoration:none;flex-shrink:0; }
.db-brand-mark { width:28px;height:28px;border-radius:6px;background:#d4ff00;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:#0a0a0a;font-family:'Syne',sans-serif;flex-shrink:0; }
.db-brand-name { font-family:'Syne',sans-serif;font-size:15px;font-weight:800;color:#fff;letter-spacing:-.02em; }
.db-breadcrumb { display:flex;align-items:center;overflow:hidden; }
.db-bc-dim { font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.22);white-space:nowrap; }
.db-bc-id  { font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.22);max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.db-bc-arr { font-size:11px;color:rgba(255,255,255,.15);margin:0 6px;flex-shrink:0; }
.db-bc-cur { font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.55);flex-shrink:0; }
.db-ts     { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.20); }
.db-wallet { display:flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.10);border-radius:4px;padding:5px 12px; }
.db-wallet-dot  { width:5px;height:5px;border-radius:50%;background:#d4ff00;flex-shrink:0; }
.db-wallet-addr { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.45); }
.db-live        { display:flex;align-items:center;gap:6px;font-size:10px;font-family:'DM Mono',monospace;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#d4ff00;border:1px solid rgba(212,255,0,.25);border-radius:4px;padding:4px 10px;white-space:nowrap; }
.db-live--off   { color:rgba(255,255,255,.30);border-color:rgba(255,255,255,.12); }
.db-live-dot    { width:5px;height:5px;border-radius:50%;background:#d4ff00;flex-shrink:0;animation:dbPulse 2s ease infinite; }
.db-live-dot--off { background:rgba(255,255,255,.30);animation:none; }
.db-live-label  {}

/* ── Shell / sidebar ────────────────────────────────────────── */
.db-shell   { display:flex;min-height:calc(100vh - 56px);background:#0a0a0a; }
.db-overlay { display:none;position:fixed;inset:0;z-index:150;background:rgba(0,0,0,.65);backdrop-filter:blur(4px); }
.db-sidebar { width:220px;flex-shrink:0;background:#0d0d0d;border-right:1px solid rgba(255,255,255,.07);display:flex;flex-direction:column;position:sticky;top:56px;height:calc(100vh - 56px);overflow-y:auto;padding:20px 0 24px;transition:transform .26s cubic-bezier(.16,1,.3,1); }
.db-sb-block { padding:0 14px 20px;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,.05); }
.db-sb-block:last-of-type { border-bottom:none; }
.db-sb-label { font-size:9px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.22);text-transform:uppercase;letter-spacing:.14em;margin-bottom:10px; }
.db-nav      { display:flex;flex-direction:column;gap:1px; }
.db-nav-item { display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border-radius:4px;font-size:12px;font-weight:500;color:rgba(255,255,255,.35);background:none;border:none;cursor:pointer;text-align:left;font-family:'DM Sans',sans-serif;min-height:40px; }
.db-nav-item:hover { color:#fff;background:rgba(255,255,255,.05); }
.db-nav-item--active { color:#fff;background:rgba(255,255,255,.06); }
.db-nav-icon { color:rgba(255,255,255,.25);flex-shrink:0;width:16px;display:flex;align-items:center;justify-content:center; }
.db-nav-item--active .db-nav-icon,.db-nav-item:hover .db-nav-icon { color:#d4ff00; }
.db-ring-wrap  { display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 14px 20px;border-bottom:1px solid rgba(255,255,255,.05); }
.db-ring-label { font-size:9px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.25);text-align:center;letter-spacing:.10em;text-transform:uppercase; }
.db-meta-list  { display:flex;flex-direction:column;gap:10px; }
.db-meta-row   { display:flex;align-items:center;justify-content:space-between;gap:8px; }
.db-meta-key   { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.25); }
.db-meta-val   { font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.70);font-weight:600; }
.db-state-tag  { font-size:9px;font-family:'DM Mono',monospace;font-weight:700;text-transform:uppercase;letter-spacing:.07em;border-radius:3px;padding:2px 7px;border:1px solid; }
.db-state-tag--active   { color:#d4ff00;border-color:rgba(212,255,0,.30); }
.db-state-tag--complete { color:#4ade80;border-color:rgba(74,222,128,.30); }
.db-mini-list  { display:flex;flex-direction:column;gap:8px; }
.db-mini       { display:flex;align-items:center;gap:9px; }
.db-mini-dot   { width:18px;height:18px;border-radius:3px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-family:'DM Mono',monospace;font-weight:700; }
.db-mini-body  { flex:1;min-width:0; }
.db-mini-title { font-size:10px;color:rgba(255,255,255,.50);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px; }
.db-mini-track { height:1px;background:rgba(255,255,255,.06);overflow:hidden; }
.db-mini-fill  { height:100%; }
.db-mini-pct   { font-size:9px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.22);flex-shrink:0; }
.db-sb-footer  { padding:0 14px;margin-top:auto;padding-top:16px; }
.db-ghost-sm   { display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:8px 12px;border-radius:4px;background:none;border:1px solid rgba(255,255,255,.10);color:rgba(255,255,255,.35);font-size:11px;font-family:'DM Sans',sans-serif;font-weight:500;cursor:pointer;min-height:38px; }
.db-ghost-sm:hover { border-color:rgba(255,255,255,.20);color:rgba(255,255,255,.70); }

/* ── Main ───────────────────────────────────────────────────── */
.db-main { flex:1;min-width:0;padding:40px 48px 72px;display:flex;flex-direction:column;gap:28px; }
.db-page-header { display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap; }
.db-eyebrow     { font-size:10px;font-family:'DM Mono',monospace;color:#d4ff00;text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px; }
.db-page-title  { font-family:'Syne',sans-serif;font-size:clamp(22px,3vw,36px);font-weight:800;color:#fff;letter-spacing:-.04em;line-height:1;margin:0; }
.db-id-chip     { display:flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,.10);border-radius:4px;padding:8px 14px;flex-shrink:0; }
.db-id-label    { font-size:9px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.22);text-transform:uppercase;letter-spacing:.12em; }
.db-id-val      { font-size:12px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.60);font-weight:600; }

/* Stats */
.db-stats { display:grid;grid-template-columns:repeat(4,1fr);border:1px solid rgba(255,255,255,.07); }
.db-stat  { padding:24px 20px 20px;display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,.07);min-width:0; }
.db-stat:last-child { border-right:none; }
.db-stat-icon  { font-size:18px;margin-bottom:20px;opacity:.6; }
.db-stat-label { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.30);text-transform:uppercase;letter-spacing:.10em;margin-bottom:8px; }
.db-stat-value { font-family:'Syne',sans-serif;font-size:16px;font-weight:700;color:#fff;letter-spacing:-.03em;line-height:1.2;word-break:break-all;margin-bottom:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.db-stat-sub   { font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.25);overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }

/* Progress */
.db-prog-card { border:1px solid rgba(255,255,255,.07);padding:20px;display:flex;flex-direction:column;gap:14px; }
.db-prog-top  { display:flex;align-items:center;justify-content:space-between; }
.db-prog-title { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.30);text-transform:uppercase;letter-spacing:.09em; }
.db-prog-right { display:flex;align-items:baseline;gap:8px; }
.db-prog-pct   { font-size:20px;font-family:'DM Mono',monospace;font-weight:800;letter-spacing:-.03em; }
.db-prog-frac  { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.25); }
.db-prog-track { height:3px;background:rgba(255,255,255,.06);overflow:hidden; }
.db-prog-fill  { height:100%;transition:width .8s ease; }

/* Section */
.db-sec-head  { display:flex;align-items:center;justify-content:space-between;margin-bottom:12px; }
.db-sec-title { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.30);text-transform:uppercase;letter-spacing:.10em; }
.db-sec-count { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.20); }
.db-ms-loading { padding:24px 0;display:flex;align-items:center;gap:10px;color:rgba(255,255,255,.30);font-size:12px;font-family:'DM Mono',monospace; }

/* Milestone list */
.db-ms-list { display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.07); }
.db-ms-block { background:#0d0d0d;border-bottom:1px solid rgba(255,255,255,.06); }
.db-ms-block:last-child { border-bottom:none; }
.db-ms-block--done    { opacity:.55; }
.db-ms-block--disp    { background:rgba(212,255,0,.02);border-left:2px solid rgba(212,255,0,.35); }
.db-ms-block--pending { background:rgba(255,255,255,.01); }
.db-ms-block--flash   { animation:dbFlash .4s ease; }
.db-ms-row    { display:flex;align-items:flex-start; }
.db-ms-bar    { width:2px;flex-shrink:0;align-self:stretch;min-height:60px; }
.db-ms-num    { width:28px;height:28px;border-radius:4px;flex-shrink:0;border:1px solid;margin:20px 16px 20px 18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-family:'DM Mono',monospace;font-weight:800; }
.db-ms-info   { flex:1;min-width:0;padding:20px 0 20px 2px; }
.db-ms-title-row { display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap; }
.db-ms-title  { font-size:14px;font-weight:600;color:#fff;letter-spacing:-.02em;font-family:'DM Sans',sans-serif; }
.db-ms-cond   { font-size:12px;color:rgba(255,255,255,.38);line-height:1.65;max-width:440px;margin-bottom:8px; }
.db-ms-meta   { display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
.db-ms-dl     { display:flex;align-items:center;gap:4px;font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.22); }
.db-tx-link   { display:flex;align-items:center;gap:4px;font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.28);text-decoration:none; }
.db-tx-link:hover { color:#d4ff00; }
.db-tx-err    { font-size:10px;font-family:'DM Mono',monospace;color:#f87171; }
.db-ms-right  { display:flex;flex-direction:column;align-items:flex-end;gap:10px;flex-shrink:0;padding:20px 22px; }
.db-ms-amt-block { text-align:right; }
.db-ms-amt    { font-family:'DM Mono',monospace;font-size:14px;font-weight:600;letter-spacing:-.02em;line-height:1; }
.db-ms-amt-sub{ font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.22);margin-top:4px; }
.db-ms-actions{ display:flex;align-items:center;gap:5px;flex-wrap:wrap;justify-content:flex-end; }
.db-status-pill{ display:inline-flex;align-items:center;gap:5px;font-size:9px;font-family:'DM Mono',monospace;font-weight:700;letter-spacing:.05em;border:1px solid;border-radius:3px;padding:3px 8px;white-space:nowrap; }
.db-spinner-dot{ width:5px;height:5px;border-radius:50%;background:currentColor;animation:dbPulse 1.4s ease infinite; }
.db-chip      { display:inline-flex;align-items:center;gap:5px;font-size:9px;font-family:'DM Mono',monospace;font-weight:700;letter-spacing:.04em;border-radius:3px;padding:2px 7px;border:1px solid; }
.db-chip--disp   { color:#d4ff00;border-color:rgba(212,255,0,.30); }
.db-chip--pending{ color:rgba(255,255,255,.55);border-color:rgba(255,255,255,.12); }
.db-chip--failed { color:#f87171;border-color:rgba(248,113,113,.28); }
.db-chip--arb    { color:#fbbf24;background:rgba(251,191,36,.10);border-color:rgba(251,191,36,.25); }
.db-chip--overdue{ color:#f87171;background:rgba(248,113,113,.08);border-color:rgba(248,113,113,.20); }
.db-chip--flash  { color:#d4ff00;background:rgba(212,255,0,.08);border-color:rgba(212,255,0,.20); }
.db-btn       { display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:4px;font-size:11px;font-family:'DM Mono',monospace;font-weight:600;cursor:pointer;border:1px solid;white-space:nowrap;letter-spacing:.02em;min-height:28px; }
.db-btn:disabled { opacity:.35;cursor:not-allowed; }
.db-btn--release  { color:#0a0a0a;background:#d4ff00;border-color:#d4ff00; }
.db-btn--release:hover:not(:disabled)  { background:#e0ff33; }
.db-btn--dispute  { color:rgba(255,255,255,.70);background:transparent;border-color:rgba(255,255,255,.15); }
.db-btn--dispute:hover:not(:disabled)  { border-color:rgba(255,255,255,.30);color:#fff; }
.db-btn--evidence { color:#d4ff00;background:transparent;border-color:rgba(212,255,0,.25); }
.db-btn--evidence:hover { border-color:rgba(212,255,0,.50); }
.db-btn--retry    { color:#f87171;background:transparent;border-color:rgba(248,113,113,.25); }
.db-btn--retry:hover { border-color:rgba(248,113,113,.45); }
.db-filed     { display:inline-flex;align-items:center;gap:5px;font-size:10px;font-family:'DM Mono',monospace;font-weight:700;color:#4ade80;border:1px solid rgba(74,222,128,.25);border-radius:3px;padding:3px 9px; }
.db-disp-panel   { border-top:1px solid rgba(212,255,0,.10);padding:16px 22px; }
.db-disp-awaiting{ font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.28); }

/* Deadline badge */
.db-deadline       { display:inline-flex;align-items:center;gap:5px;font-size:9px;font-family:'DM Mono',monospace;font-weight:600;color:rgba(255,255,255,.35);background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:4px;padding:2px 8px;letter-spacing:.02em; }
.db-deadline--overdue { color:#f87171;background:rgba(248,113,113,.07);border-color:rgba(248,113,113,.20); }

/* Arb banner */
.db-arb-banner { margin:4px 0 8px;border:1px solid;border-radius:6px;overflow:hidden; }
.db-arb-head   { display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid; }
.db-arb-eyebrow{ font-size:9px;font-family:'DM Mono',monospace;font-weight:700;text-transform:uppercase;letter-spacing:.10em;margin-bottom:2px; }
.db-arb-title  { font-size:12px;font-weight:700;letter-spacing:-.02em; }
.db-arb-body   { padding:10px 14px;display:flex;flex-direction:column;gap:8px; }
.db-arb-msg    { font-size:12px;color:rgba(255,255,255,.45);line-height:1.6;margin:0; }
.db-arb-note   { background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:5px;padding:9px 11px; }
.db-arb-note-label { font-size:9px;font-family:'DM Mono',monospace;font-weight:600;text-transform:uppercase;letter-spacing:.10em;color:rgba(255,255,255,.30);margin-bottom:5px; }
.db-arb-note-text  { font-size:12px;color:rgba(255,255,255,.55);line-height:1.65;font-style:italic;margin:0; }
.db-arb-meta   { display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
.db-arb-meta-item  { font-size:9px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.28); }
.db-arb-sep    { color:rgba(255,255,255,.15);font-size:10px; }
.db-arb-ai     { font-size:8px;font-family:'DM Mono',monospace;font-weight:700;text-transform:uppercase;letter-spacing:.08em;border:1px solid;border-radius:3px;padding:2px 6px; }

/* Info / complete / CTA */
.db-info-strip  { border:1px solid rgba(255,255,255,.07);padding:14px 16px; }
.db-info-text   { font-size:12px;color:rgba(255,255,255,.28);line-height:1.7;margin:0; }
.db-info-text strong { color:rgba(255,255,255,.55);font-weight:500; }
.db-complete-banner { text-align:center;border:1px solid rgba(74,222,128,.20);padding:48px 28px; }
.db-complete-icon   { width:52px;height:52px;border-radius:50%;background:#d4ff00;display:flex;align-items:center;justify-content:center;margin:0 auto 18px; }
.db-complete-title  { font-family:'Syne',sans-serif;font-size:22px;font-weight:800;letter-spacing:-.04em;color:#fff;margin-bottom:8px; }
.db-complete-body   { font-size:13px;color:rgba(255,255,255,.35);margin-bottom:28px; }
.db-complete-actions{ display:flex;gap:10px;justify-content:center;flex-wrap:wrap; }
.db-cta-primary  { display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 24px;border-radius:4px;cursor:pointer;border:none;background:#d4ff00;color:#0a0a0a;font-family:'Syne',sans-serif;font-size:13px;font-weight:700; }
.db-cta-primary:hover { background:#e0ff33; }
.db-cta-secondary{ display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 24px;border-radius:4px;cursor:pointer;background:transparent;color:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.12);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500; }
.db-cta-secondary:hover { border-color:rgba(255,255,255,.22);color:#fff; }
.db-cta-dispute  { display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 20px;border-radius:4px;cursor:pointer;background:#d4ff00;color:#0a0a0a;border:none;font-family:'Syne',sans-serif;font-size:13px;font-weight:700; }
.db-cta-dispute:hover { background:#e0ff33; }

/* Spinners */
.db-spinner-xs { display:inline-block;width:7px;height:7px;border-radius:50%;border:1.5px solid rgba(255,255,255,.15);border-top-color:rgba(255,255,255,.6);animation:dbSpin .65s linear infinite;flex-shrink:0; }
.db-spinner-sm { display:inline-block;flex-shrink:0;width:12px;height:12px;border-radius:50%;border:1.5px solid rgba(255,255,255,.12);border-top-color:rgba(255,255,255,.60);animation:dbSpin .65s linear infinite; }

/* ── Modal ──────────────────────────────────────────────────── */
.db-modal-bd  { position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.80);display:flex;align-items:center;justify-content:center;padding:16px; }
.db-modal     { width:100%;max-width:560px;background:#111;border:1px solid rgba(255,255,255,.10);overflow:hidden;display:flex;flex-direction:column;max-height:90vh; }
.db-modal--evidence { max-width:640px; }
.db-modal-head { display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0; }
.db-modal-head-left { display:flex;align-items:center;gap:12px;min-width:0; }
.db-modal-icon  { width:34px;height:34px;border-radius:4px;flex-shrink:0;background:rgba(212,255,0,.08);border:1px solid rgba(212,255,0,.20);display:flex;align-items:center;justify-content:center; }
.db-modal-eyebrow { font-size:9px;font-family:'DM Mono',monospace;font-weight:700;color:#d4ff00;text-transform:uppercase;letter-spacing:.10em;margin-bottom:3px; }
.db-modal-title   { font-family:'Syne',sans-serif;font-size:15px;font-weight:800;color:#fff;letter-spacing:-.03em; }
.db-modal-subtitle{ font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.28);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px; }
.db-modal-close   { width:28px;height:28px;border-radius:4px;flex-shrink:0;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.10);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.35);cursor:pointer; }
.db-modal-close:hover { background:rgba(255,255,255,.10);color:#fff; }
.db-modal-steps   { display:flex;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0; }
.db-modal-step    { display:flex;align-items:center;gap:8px;font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.25); }
.db-modal-step--active { color:rgba(255,255,255,.75); }
.db-modal-step--done   { color:#4ade80; }
.db-modal-step--idle   { color:rgba(255,255,255,.18); }
.db-modal-step-dot { width:20px;height:20px;border-radius:50%;flex-shrink:0;border:1px solid currentColor;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700; }
.db-modal-step--active .db-modal-step-dot { border-color:#d4ff00;color:#d4ff00; }
.db-modal-step--done   .db-modal-step-dot { border-color:#4ade80;color:#4ade80; }
.db-modal-step-line { flex:1;height:1px;margin:0 12px; }
.db-modal-body      { padding:20px;display:flex;flex-direction:column;gap:16px;flex-shrink:0; }
.db-modal-body--scroll { overflow-y:auto;flex:1;padding:0; }
.db-modal-warn  { display:flex;align-items:flex-start;gap:10px;border:1px solid rgba(212,255,0,.18);padding:13px 14px; }
.db-modal-warn svg { flex-shrink:0;margin-top:1px; }
.db-modal-warn p { font-size:12px;color:rgba(255,255,255,.45);line-height:1.65;margin:0; }
.db-modal-grid  { display:grid;grid-template-columns:1fr 1fr;border:1px solid rgba(255,255,255,.07); }
.db-modal-cell  { background:#161616;padding:13px 14px;display:flex;flex-direction:column;gap:5px;border-right:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06); }
.db-modal-cell:nth-child(even) { border-right:none; }
.db-modal-cell--full { grid-column:1/-1;border-right:none; }
.db-modal-cell-label { font-size:9px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.25);text-transform:uppercase;letter-spacing:.11em; }
.db-modal-cell-val   { font-size:13px;font-family:'DM Mono',monospace;color:rgba(255,255,255,.75);font-weight:600;letter-spacing:-.01em;word-break:break-all; }
.db-modal-footer { display:flex;align-items:center;justify-content:flex-end;gap:10px;padding-top:4px; }
.db-modal-tx-notice { display:flex;align-items:center;gap:10px;border:1px solid rgba(212,255,0,.14);padding:11px 14px;margin:16px 20px 0;font-size:12px;color:rgba(255,255,255,.40);font-family:'DM Mono',monospace;flex-shrink:0; }

/* ═══════════════════════════════════════════════════════════════
   RESPONSIVE BREAKPOINTS
   ═══════════════════════════════════════════════════════════════ */

/* ── 1024px ─────────────────────────────────────────────────── */
@media (max-width:1024px) {
  .db-topbar { padding:0 20px; }
  .db-main   { padding:32px 32px 64px;gap:22px; }
  .db-stats  { grid-template-columns:repeat(2,1fr); }
  .db-stat:nth-child(2) { border-right:none; }
  .db-stat:nth-child(3) { border-right:1px solid rgba(255,255,255,.07); }
  .db-stat:nth-child(4) { border-right:none; }
}

/* ── 900px — sidebar becomes a drawer ──────────────────────── */
@media (max-width:900px) {
  .db-ham { display:flex; }
  .db-overlay { display:block; }
  .db-sidebar { position:fixed;top:0;left:0;bottom:0;z-index:160;width:260px;height:100vh;top:0;transform:translateX(-100%);border-right:1px solid rgba(255,255,255,.10); }
  .db-sidebar--open { transform:translateX(0);animation:dbSlide .26s cubic-bezier(.16,1,.3,1); }
  .db-main { padding:24px 20px 56px; }
}

/* ── 768px ──────────────────────────────────────────────────── */
@media (max-width:768px) {
  .db-topbar { padding:0 16px;height:50px;gap:8px; }
  .db-nav-sep { margin:0 12px; }
  .db-bc-id,.db-bc-arr-last,.db-bc-cur { display:none; }
  .db-ts { display:none; }
  .db-main { padding:20px 16px 52px;gap:18px; }
  .db-page-title { font-size:22px; }
  .db-stats { grid-template-columns:repeat(2,1fr); }
  .db-stat { padding:16px 14px; }
  .db-stat-icon { font-size:15px;margin-bottom:14px; }
  .db-ms-right { padding:14px 16px; }
}

/* ── 580px ──────────────────────────────────────────────────── */
@media (max-width:580px) {
  .db-topbar { height:48px;padding:0 12px; }
  .db-brand-name { font-size:13px; }
  .db-live-label { display:none; }
  .db-live { padding:4px 8px; }
  .db-wallet-addr { font-size:9px; }
  .db-wallet { padding:4px 9px; }

  .db-main { padding:16px 12px 48px;gap:16px; }
  .db-page-title { font-size:20px; }
  .db-id-chip { padding:6px 10px; }
  .db-id-val  { font-size:11px; }

  .db-stats { grid-template-columns:1fr 1fr; }
  .db-stat  { padding:14px 12px; }
  .db-stat-value { font-size:13px; }
  .db-stat-sub { font-size:9px; }

  .db-prog-card { padding:14px; }
  .db-prog-pct  { font-size:16px; }

  /* Milestone rows: stack */
  .db-ms-row  { flex-direction:column; }
  .db-ms-bar  { width:100%;height:2px;min-height:0;align-self:auto; }
  .db-ms-num  { margin:12px 0 0 14px;align-self:flex-start; }
  .db-ms-info { padding:8px 14px; }
  .db-ms-title { font-size:13px; }
  .db-ms-cond  { font-size:11px;max-width:100%; }
  .db-ms-right { flex-direction:row;align-items:center;justify-content:space-between;padding:8px 14px 14px;gap:8px; }
  .db-ms-amt-block { text-align:left; }
  .db-ms-amt  { font-size:12px; }
  .db-ms-actions { justify-content:flex-start; }

  .db-disp-panel { padding:12px 14px; }

  .db-complete-banner { padding:28px 16px; }
  .db-complete-title  { font-size:18px; }
  .db-complete-actions { flex-direction:column;align-items:stretch; }
  .db-cta-primary,.db-cta-secondary { width:100%;justify-content:center; }

  .db-info-strip { padding:12px 14px; }
  .db-info-text  { font-size:11px; }

  /* Modal: bottom sheet */
  .db-modal-bd { align-items:flex-end;padding:0; }
  .db-modal,.db-modal--evidence { max-width:100%;border-radius:0;border-left:none;border-right:none;border-bottom:none;max-height:92vh; }
  .db-modal-head { padding:14px 16px; }
  .db-modal-body { padding:14px 16px;gap:12px; }
  .db-modal-footer { flex-direction:column-reverse;gap:8px; }
  .db-cta-secondary,.db-cta-dispute { width:100%;justify-content:center;padding:12px 16px; }
  .db-modal-grid { grid-template-columns:1fr; }
  .db-modal-cell { border-right:none !important; }
  .db-modal-steps { padding:10px 16px; }
  .db-modal-step  { font-size:10px; }
  .db-modal-step-line { margin:0 8px; }
}

/* ── 400px ──────────────────────────────────────────────────── */
@media (max-width:400px) {
  .db-topbar { padding:0 10px; }
  .db-brand-name { display:none; }
  .db-wallet { display:none; }
  .db-nav-sep,.db-breadcrumb { display:none; }
  .db-main { padding:14px 10px 48px; }
  .db-stats { grid-template-columns:1fr; }
  .db-stat  { border-right:none !important;border-bottom:1px solid rgba(255,255,255,.07); }
  .db-stat:last-child { border-bottom:none; }
  .db-btn { padding:5px 8px;font-size:10px; }
  .db-ms-amt { font-size:11px; }
}

/* ── Touch targets ──────────────────────────────────────────── */
@media (max-width:768px) {
  .db-btn { min-height:36px; }
  .db-cta-primary,.db-cta-secondary,.db-cta-dispute { min-height:44px; }
  .db-nav-item { min-height:44px; }
  .db-modal-close { width:36px;height:36px; }
}

/* ── Safe area (iOS notch) ──────────────────────────────────── */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .db-main { padding-bottom: max(56px, calc(env(safe-area-inset-bottom) + 24px)); }
  .db-topbar { padding-left: max(12px, env(safe-area-inset-left)); padding-right: max(12px, env(safe-area-inset-right)); }
  .db-sidebar { padding-bottom: max(24px, env(safe-area-inset-bottom)); }
}

/* ── Overflow guard ─────────────────────────────────────────── */
.db-main,.db-ms-block,.db-ms-info,.db-stat,.db-modal { min-width:0;max-width:100%; }
`;
