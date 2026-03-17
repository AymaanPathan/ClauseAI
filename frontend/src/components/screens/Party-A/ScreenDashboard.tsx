"use client";
// ============================================================
// components/partyA/ScreenDashboard.tsx
// KEY CHANGE: uses useSyncedAgreement as source of truth for milestone
// status. Local Redux txMilestone is used ONLY for optimistic pending/
// confirming overlay. This makes Party A and Party B see identical state.
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type MilestoneUIStatus =
  | "locked"
  | "pending"
  | "complete"
  | "disputed"
  | "refunded"
  | "failed";

// ── Milestone definition (from Redux terms) ───────────────────
// We keep this only for terms-derived metadata (title, condition, deadline_dt)
// The actual STATUS comes from useSyncedAgreement (DB)
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
type ArbDecisionMap = Record<number, ArbitratorDecision | null>;

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

function truncateAddr(addr: string) {
  return addr ? `${addr.slice(0, 8)}…${addr.slice(-5)}` : "";
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
function fmtDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  try {
    return new Date(iso).getTime() < Date.now();
  } catch {
    return false;
  }
}

function DeadlineBadge({ iso }: { iso: string | null | undefined }) {
  if (!iso) return null;
  const label = fmtDeadline(iso);
  if (!label) return null;
  const overdue = isOverdue(iso);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 9,
        fontFamily: "'DM Mono',monospace",
        fontWeight: 600,
        color: overdue ? "#f87171" : "rgba(255,255,255,0.35)",
        background: overdue
          ? "rgba(248,113,113,0.07)"
          : "rgba(255,255,255,0.04)",
        border: `1px solid ${overdue ? "rgba(248,113,113,0.20)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 4,
        padding: "2px 8px",
        letterSpacing: "0.02em",
      }}
    >
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
  const outcomeColor = isRelease ? "#4ade80" : "#f87171";
  const outcomeLabel = isRelease
    ? "Funds Released to Receiver"
    : "Funds Refunded to Payer";
  const personalMsg = isRelease
    ? "The arbitrator ruled in favour of the Receiver. Funds were released to Party B."
    : "The arbitrator ruled in your favour. Funds were returned to your wallet.";

  return (
    <div
      style={{
        margin: "4px 0 8px",
        border: `1px solid ${outcomeColor}28`,
        borderRadius: 6,
        overflow: "hidden",
        background: `${outcomeColor}06`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 14px",
          background: `${outcomeColor}0a`,
          borderBottom: `1px solid ${outcomeColor}18`,
        }}
      >
        <span style={{ fontSize: 13 }}>⚖</span>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 9,
              fontFamily: "'DM Mono',monospace",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.10em",
              color: outcomeColor,
              marginBottom: 2,
            }}
          >
            Arbitrator Decision
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: outcomeColor,
              letterSpacing: "-0.02em",
            }}
          >
            {outcomeLabel}
          </div>
        </div>
      </div>
      <div
        style={{
          padding: "10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <p
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.45)",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {personalMsg}
        </p>
        {decision.override_reason && (
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 5,
              padding: "9px 11px",
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontFamily: "'DM Mono',monospace",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.10em",
                color: "rgba(255,255,255,0.30)",
                marginBottom: 5,
              }}
            >
              Arbitrator's Note
            </div>
            <p
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.55)",
                lineHeight: 1.65,
                fontStyle: "italic",
                margin: 0,
              }}
            >
              "{decision.override_reason}"
            </p>
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 9,
              fontFamily: "'DM Mono',monospace",
              color: "rgba(255,255,255,0.28)",
            }}
          >
            By {truncateAddr(decision.arbitrator_address)}
          </span>
          <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>
            ·
          </span>
          <span
            style={{
              fontSize: 9,
              fontFamily: "'DM Mono',monospace",
              color: "rgba(255,255,255,0.28)",
            }}
          >
            {fmtDate(decision.decided_at)}
          </span>
          <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>
            ·
          </span>
          <span
            style={{
              fontSize: 8,
              fontFamily: "'DM Mono',monospace",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: decision.followed_ai ? "#4ade80" : "#fbbf24",
              background: decision.followed_ai
                ? "rgba(74,222,128,0.07)"
                : "rgba(251,191,36,0.07)",
              border: `1px solid ${decision.followed_ai ? "rgba(74,222,128,0.20)" : "rgba(251,191,36,0.20)"}`,
              borderRadius: 3,
              padding: "2px 6px",
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

  // ── Terms-level milestone metadata (titles, conditions, deadlines) ──
  // Status does NOT come from here — it comes from useSyncedAgreement below
  const termsMillestones: any[] = t?.milestones ?? [];
  const milestonesMeta: MilestoneUI[] = v2?.milestones?.map((ms, i) => {
    const tmMatch = termsMillestones.find(
      (tm: any) => tm.title === ms.title || tm.index === i,
    );
    const deadline_dt: string | null =
      ms.deadline_dt ?? tmMatch?.deadline_dt ?? null;
    return {
      index: i,
      title: ms.title || `Milestone ${i + 1}`,
      percentage: ms.percentage,
      condition: ms.condition ?? "",
      deadline_dt,
      deadline: ms.deadline ?? tmMatch?.deadline ?? "",
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

  // ── Build local optimistic map for useSyncedAgreement ─────
  // txMilestone has pending/confirming states that should overlay DB status
  const localOptimistic: Record<
    number,
    { status: string; txId?: string | null; txUrl?: string | null }
  > = {};
  if (txMilestone) {
    Object.entries(txMilestone).forEach(([idx, tx]) => {
      if (
        tx.status === "pending" ||
        tx.status === "confirming" ||
        tx.status === "failed"
      ) {
        localOptimistic[parseInt(idx)] = {
          status: tx.status,
          txId: tx.txId,
          txUrl: tx.txUrl,
        };
      }
    });
  }

  // ── useSyncedAgreement: DB is source of truth ─────────────
  const {
    milestones: dbMilestones,
    fundState,
    fundsLocked,
    amountLocked,
    partyA: dbPartyA,
    arbDecisions: dbArbDecisions,
    totalAmountUsd: dbTotalUsd,
    totalAmountSats: dbTotalSats,
    arbitrator: dbArbitrator,
    terms: dbTerms,
    connected,
    loading,
    lastUpdate,
    flashIndex,
    refetch,
  } = useSyncedAgreement({ agreementId, walletAddress, localOptimistic });

  // ── getStatus: DB-first, optimistic overlay for pending/confirming ──
  // This is THE authoritative status function. Both Party A and B now
  // derive status from the same DB-backed source.
  const getStatus = useCallback(
    (index: number): MilestoneUIStatus => {
      // 1. Local optimistic: pending/confirming overrides DB
      const tx = txMilestone?.[index];
      if (tx?.status === "pending" || tx?.status === "confirming")
        return "pending";
      if (tx?.status === "failed") return "failed";

      // 2. DB status from useSyncedAgreement (via socket + REST)
      const dbMs = dbMilestones.find((m) => m.index === index);
      if (dbMs) return dbMs.status as MilestoneUIStatus;

      // 3. Last resort: on-chain read (only used before DB has synced)
      const onChain = milestoneOnChainStatuses?.[index];
      if (onChain !== undefined) {
        // MILESTONE_STATUS: 1=ACTIVE, 2=COMPLETE, 3=DISPUTED, 4=REFUNDED
        switch (onChain) {
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

  // ── arbDecisions: use DB arbDecisions ─────────────────────
  const arbDecisions = dbArbDecisions;

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

  function openDisputeModal(ms: MilestoneUI) {
    setDisputeModal({ open: true, ms, step: "confirm" });
  }
  function closeDisputeModal() {
    setDisputeModal({ open: false, ms: null, step: "confirm" });
  }

  // ── Save to DB on mount ───────────────────────────────────
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
  }, [agreementId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket: dispute:updated ───────────────────────────────
  // useSyncedAgreement already handles this. We only need to handle
  // arbDecisions that come from dispute:updated here.
  useEffect(() => {
    if (!agreementId) return;
    const socket = getSocket();
    joinAgreementRoom(agreementId);

    function onDisputeUpdated(payload: any) {
      if (payload.agreement_id && payload.agreement_id !== agreementId) return;
      setLastRefresh(Date.now());
      const idx = payload.milestone_index ?? payload.milestoneIndex;
      if (idx !== undefined) {
        joinDisputeRoom(agreementId!, idx);
      }
    }
    socket.on("dispute:updated", onDisputeUpdated);
    return () => {
      socket.off("dispute:updated", onDisputeUpdated);
    };
  }, [agreementId]);

  // ── Poll pending txs ──────────────────────────────────────
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
            onConfirmed: () => {
              setLastRefresh(Date.now());
              refetch();
            },
          }),
        );
      }
    });
  }, [txMilestone]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Refetch when lastRefresh changes ─────────────────────
  useEffect(() => {
    if (lastRefresh > 0) refetch();
  }, [lastRefresh]); // eslint-disable-line react-hooks/exhaustive-deps

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
            setDisputeModal((prev) => ({ ...prev, step: "submit" }));
          },
        }),
      );
      setDisputeModal((prev) => ({ ...prev, step: "submit" }));
    }
  }

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
          onConfirmed: () => {
            setLastRefresh(Date.now());
            refetch();
          },
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
          onConfirmed: () => {
            setLastRefresh(Date.now());
            refetch();
          },
        }),
      );
    }
  }

  // ── Derived stats (use DB milestones for consistency) ─────
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
  const displayArbitrator = dbArbitrator ?? arbitratorTerms;

  return (
    <div>
      <style>{css}</style>

      {/* ── Topbar ── */}
      <header className="v2-topbar">
        <div className="v2-topbar-left">
          <a
            className="v2-brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              localStorage.removeItem("pA_screen");
              localStorage.removeItem("pA_agreementId");
              window.location.href = "/";
            }}
          >
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
          {lastUpdate && (
            <span className="v2-timestamp">
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          {walletAddress && (
            <div className="v2-wallet-pill">
              <span className="v2-wallet-dot" />
              <span className="v2-wallet-addr">
                {walletAddress.slice(0, 10)}…{walletAddress.slice(-6)}
              </span>
            </div>
          )}
          <div
            className={`v2-live-badge${connected ? "" : " v2-live-badge--off"}`}
          >
            <span
              className={`v2-live-dot${connected ? "" : " v2-live-dot--off"}`}
            />
            {connected ? "sBTC Live" : "Reconnecting"}
          </div>
        </div>
      </header>

      {/* ── Shell ── */}
      <div className="v2-shell">
        {/* ── Sidebar ── */}
        <aside className="v2-sidebar">
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

          <div className="v2-ring-block">
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
            <div className="v2-ring-label">
              {completedCount}/{milestonesMeta.length} milestones
            </div>
          </div>

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

          {milestonesMeta.length > 1 && (
            <div className="v2-sidebar-block">
              <div className="v2-sidebar-label">Milestones</div>
              <div className="v2-ms-mini-list">
                {milestonesMeta.map((ms, i) => {
                  const st = getStatus(ms.index);
                  const col = MS_COLORS[i % MS_COLORS.length];
                  return (
                    <div key={i} className="v2-ms-mini">
                      <div
                        className="v2-ms-mini-dot"
                        style={{
                          background: col + "15",
                          border: `1px solid ${col}30`,
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

        {/* ── Main ── */}
        <main className="v2-main">
          <div className="v2-page-header">
            <div className="v2-page-header-left">
              <div className="v2-eyebrow">Payer Dashboard</div>
              <h1 className="v2-page-title">Manage Agreement</h1>
            </div>
            <div className="v2-agreement-id-chip">
              <span className="v2-agreement-id-label">ID</span>
              <span className="v2-agreement-id-val">#{agreementId}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="v2-stats-grid">
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
              <div key={label} className="v2-stat-card">
                <div className="v2-stat-icon" style={{ color: accent }}>
                  {icon}
                </div>
                <div className="v2-stat-label">{label}</div>
                <div className="v2-stat-value">{value}</div>
                <div className="v2-stat-sub">{sub}</div>
              </div>
            ))}
          </div>

          {/* Progress */}
          <div className="v2-progress-card">
            <div className="v2-progress-top">
              <span className="v2-progress-title">Contract Progress</span>
              <div className="v2-progress-stat">
                <span
                  className="v2-progress-pct"
                  style={{ color: progressPct === 100 ? "#4ade80" : "#d4ff00" }}
                >
                  {progressPct}%
                </span>
                <span className="v2-progress-frac">
                  {completedCount}/{milestonesMeta.length}
                </span>
              </div>
            </div>
            <div className="v2-progress-track">
              <div
                className="v2-progress-fill"
                style={{
                  width: `${progressPct > 0 ? progressPct : 0.5}%`,
                  background: progressPct === 100 ? "#4ade80" : "#d4ff00",
                }}
              />
            </div>
          </div>

          {/* Milestones */}
          <div>
            <div className="v2-section-head">
              <span className="v2-section-title">Milestones</span>
              <span className="v2-section-count">
                {milestonesMeta.length} total
              </span>
            </div>

            {loading && milestonesMeta.length === 0 && (
              <div
                style={{
                  padding: "24px 0",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "rgba(255,255,255,0.3)",
                  fontSize: 12,
                }}
              >
                <span className="v2-spinner-sm" /> Loading milestone data…
              </div>
            )}

            <div className="v2-ms-list">
              {milestonesMeta.map((ms) => {
                const status = getStatus(ms.index);
                const meta = statusMeta(status);
                const tx = txMilestone?.[ms.index];
                const isDone = status === "complete" || status === "refunded";
                const isPending = status === "pending";
                const isFailed = status === "failed";
                const isDisp = status === "disputed";
                const alreadySub = disputeSubmitted[ms.index];
                const accent = MS_COLORS[ms.index % MS_COLORS.length];
                const arbDecision = arbDecisions[ms.index] ?? null;
                const showArbBanner = isDone && arbDecision !== null;
                const overdue = isOverdue(ms.deadline_dt) && !isDone && !isDisp;
                const isFlashing = flashIndex === ms.index;

                // Prefer DB milestone for txId/txUrl since it's confirmed
                const dbMs = dbMilestones.find((m) => m.index === ms.index);
                const displayTxId = tx?.txId ?? dbMs?.txId;
                const displayTxUrl = tx?.txUrl ?? dbMs?.txUrl;

                return (
                  <div
                    key={ms.index}
                    className={[
                      "v2-ms-block",
                      isDone ? "v2-ms-block--done" : "",
                      isDisp ? "v2-ms-block--disputed" : "",
                      isPending ? "v2-ms-block--pending" : "",
                      isFlashing ? "v2-ms-block--flash" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div className="v2-ms-row">
                      <div
                        className="v2-ms-accent-bar"
                        style={{
                          background: isDone
                            ? "#4ade80"
                            : isDisp
                              ? "#d4ff00"
                              : accent,
                        }}
                      />
                      <div
                        className="v2-ms-num"
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

                      <div className="v2-ms-info">
                        <div className="v2-ms-title-row">
                          <span className="v2-ms-title">{ms.title}</span>
                          {isDisp && (
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
                          {isDone && arbDecision && (
                            <span
                              style={{
                                fontSize: 9,
                                fontFamily: "'DM Mono',monospace",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.07em",
                                color: "#fbbf24",
                                background: "rgba(251,191,36,0.10)",
                                border: "1px solid rgba(251,191,36,0.25)",
                                borderRadius: 3,
                                padding: "2px 7px",
                              }}
                            >
                              ⚖ Arbitrated
                            </span>
                          )}
                          {overdue && (
                            <span
                              style={{
                                fontSize: 9,
                                fontFamily: "'DM Mono',monospace",
                                fontWeight: 700,
                                color: "#f87171",
                                background: "rgba(248,113,113,0.08)",
                                border: "1px solid rgba(248,113,113,0.20)",
                                borderRadius: 3,
                                padding: "2px 7px",
                              }}
                            >
                              ⚠ Overdue
                            </span>
                          )}
                          {isFlashing && !isDone && !isPending && (
                            <span
                              style={{
                                fontSize: 9,
                                fontFamily: "'DM Mono',monospace",
                                fontWeight: 700,
                                color: "#d4ff00",
                                background: "rgba(212,255,0,0.08)",
                                border: "1px solid rgba(212,255,0,0.20)",
                                borderRadius: 3,
                                padding: "2px 7px",
                              }}
                            >
                              Updated
                            </span>
                          )}
                        </div>
                        {ms.condition && (
                          <p className="v2-ms-condition">{ms.condition}</p>
                        )}
                        <div className="v2-ms-meta-row">
                          <DeadlineBadge iso={ms.deadline_dt} />
                          {!ms.deadline_dt && ms.deadline && (
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
                          {displayTxId && (
                            <a
                              href={displayTxUrl ?? explorerTxUrl(displayTxId)}
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
                              {displayTxId.slice(0, 12)}… ↗
                            </a>
                          )}
                          {tx?.error && (
                            <span className="v2-tx-error">⚠ {tx.error}</span>
                          )}
                        </div>
                      </div>

                      <div className="v2-ms-right">
                        <div className="v2-ms-amount-block">
                          <div
                            className="v2-ms-amount"
                            style={{ color: isDone ? "#4ade80" : "#ffffff" }}
                          >
                            {formatSats(ms.amountSats)}
                          </div>
                          <div className="v2-ms-amount-sub">
                            {ms.percentage}% · ≈ ${ms.amountUsd}
                          </div>
                        </div>
                        <div className="v2-ms-actions">
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
                          {isDisp && !alreadySub && (
                            <button
                              className="v2-btn v2-btn--evidence"
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
                          {!isDone && !isPending && !isFailed && !isDisp && (
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
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {showArbBanner && arbDecision && (
                      <div className="v2-dispute-panel">
                        <ArbitratorDecisionBanner
                          decision={arbDecision}
                          viewerRole="A"
                        />
                      </div>
                    )}
                    {isDisp && !showArbBanner && (
                      <div className="v2-dispute-panel">
                        <div
                          style={{
                            fontSize: 11,
                            fontFamily: "'DM Mono',monospace",
                            color: "rgba(255,255,255,0.28)",
                            marginBottom: 8,
                          }}
                        >
                          ⚑ Dispute is open — awaiting arbitrator decision
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="v2-info-strip">
            <p className="v2-info-text">
              Click <strong>Release</strong> to send sBTC on-chain once work is
              approved. Use <strong>Dispute</strong> to open arbitration if
              deliverables are unsatisfactory. Status syncs in real-time across
              all parties.
            </p>
          </div>

          {allComplete && (
            <div className="v2-complete-banner">
              <div className="v2-complete-icon">
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

      {/* ── Dispute Confirmation Modal ── */}
      {disputeModal.open && disputeModal.ms && (
        <div
          className="v2-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDisputeModal();
          }}
        >
          <div className="v2-modal">
            <div className="v2-modal-header">
              <div className="v2-modal-header-left">
                <div className="v2-modal-icon">
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
                      ? "#d4ff00"
                      : "rgba(255,255,255,0.08)",
                }}
              />
              <div
                className={`v2-modal-step ${disputeModal.step === "submit" ? "v2-modal-step--active" : "v2-modal-step--idle"}`}
              >
                <div className="v2-modal-step-dot">2</div>
                <span>Submit Statement</span>
              </div>
            </div>

            {disputeModal.step === "confirm" && (
              <div className="v2-modal-body">
                <div className="v2-modal-warn-banner">
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
                      style={{ color: "#d4ff00" }}
                    >
                      {formatSats(disputeModal.ms.amountSats)}{" "}
                      <span style={{ opacity: 0.4, fontSize: 10 }}>
                        ≈ ${disputeModal.ms.amountUsd}
                      </span>
                    </span>
                  </div>
                  <div className="v2-modal-detail">
                    <span className="v2-modal-detail-label">Arbitrator</span>
                    <span className="v2-modal-detail-val">
                      {displayArbitrator.length > 18
                        ? `${displayArbitrator.slice(0, 16)}…`
                        : displayArbitrator}
                    </span>
                  </div>
                  {disputeModal.ms.deadline_dt && (
                    <div className="v2-modal-detail">
                      <span className="v2-modal-detail-label">Deadline</span>
                      <span
                        className="v2-modal-detail-val"
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
                    <div className="v2-modal-detail v2-modal-detail--full">
                      <span className="v2-modal-detail-label">Condition</span>
                      <span
                        className="v2-modal-detail-val"
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
          className="v2-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEvidenceModalMs(null);
          }}
        >
          <div className="v2-modal v2-modal--evidence">
            <div className="v2-modal-header">
              <div className="v2-modal-header-left">
                <div className="v2-modal-icon">
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
                  <div className="v2-modal-eyebrow">
                    File Evidence · Dispute
                  </div>
                  <div className="v2-modal-title">{evidenceModalMs.title}</div>
                </div>
              </div>
              <button
                className="v2-modal-close"
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
            <div className="v2-modal-body v2-modal-body--scroll">
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

/* ═══════════════════════════════════════════════════════════ */
const css = `
.v2-topbar { position:sticky;top:0;z-index:100;height:56px;background:#0a0a0a;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:space-between;padding:0 28px;gap:12px; }
.v2-topbar-left { display:flex;align-items:center; }
.v2-topbar-right { display:flex;align-items:center;gap:10px; }
.v2-topbar-sep { width:1px;height:16px;background:rgba(255,255,255,0.08);margin:0 20px; }
.v2-timestamp { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.20); }
.v2-brand { display:flex;align-items:center;gap:9px;text-decoration:none; }
.v2-brand-mark { width:28px;height:28px;border-radius:6px;background:#d4ff00;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:#0a0a0a;font-family:'Syne',sans-serif;flex-shrink:0; }
.v2-brand-name { font-family:'Syne',sans-serif;font-size:15px;font-weight:800;color:#ffffff;letter-spacing:-0.02em; }
.v2-breadcrumb { display:flex;align-items:center; }
.v2-bc-dim { font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.22); }
.v2-bc-arrow { font-size:11px;color:rgba(255,255,255,0.15);margin:0 6px; }
.v2-bc-cur { font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.55); }
.v2-wallet-pill { display:flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,0.10);border-radius:4px;padding:5px 12px; }
.v2-wallet-dot { width:5px;height:5px;border-radius:50%;background:#d4ff00;flex-shrink:0; }
.v2-wallet-addr { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.45); }
.v2-live-badge { display:flex;align-items:center;gap:6px;font-size:10px;font-family:'DM Mono',monospace;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#d4ff00;border:1px solid rgba(212,255,0,0.25);border-radius:4px;padding:4px 10px; }
.v2-live-badge--off { color:rgba(255,255,255,0.30);border-color:rgba(255,255,255,0.12); }
.v2-live-dot { width:5px;height:5px;border-radius:50%;background:#d4ff00;flex-shrink:0;animation:v2Pulse 2s ease infinite; }
.v2-live-dot--off { background:rgba(255,255,255,0.30);animation:none; }
.v2-shell { display:flex;min-height:calc(100vh - 56px);background:#0a0a0a; }
.v2-sidebar { width:220px;flex-shrink:0;background:#0d0d0d;border-right:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;position:sticky;top:56px;height:calc(100vh - 56px);overflow-y:auto;padding:20px 0 24px; }
.v2-sidebar-block { padding:0 14px 20px;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.05); }
.v2-sidebar-block:last-of-type { border-bottom:none; }
.v2-sidebar-label { font-size:9px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.22);text-transform:uppercase;letter-spacing:0.14em;margin-bottom:10px; }
.v2-nav { display:flex;flex-direction:column;gap:1px; }
.v2-nav-item { display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border-radius:4px;font-size:12px;font-weight:500;color:rgba(255,255,255,0.35);background:none;border:none;cursor:pointer;text-align:left;font-family:'DM Sans',sans-serif; }
.v2-nav-item:hover { color:#ffffff;background:rgba(255,255,255,0.05); }
.v2-nav-item--active { color:#ffffff;background:rgba(255,255,255,0.06); }
.v2-nav-icon { color:rgba(255,255,255,0.25);flex-shrink:0;width:16px;display:flex;align-items:center;justify-content:center; }
.v2-nav-item--active .v2-nav-icon,.v2-nav-item:hover .v2-nav-icon { color:#d4ff00; }
.v2-ring-block { display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 14px 20px;border-bottom:1px solid rgba(255,255,255,0.05); }
.v2-ring-label { font-size:9px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.25);text-align:center;letter-spacing:0.10em;text-transform:uppercase; }
.v2-meta-list { display:flex;flex-direction:column;gap:10px; }
.v2-meta-row { display:flex;align-items:center;justify-content:space-between;gap:8px; }
.v2-meta-key { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.25); }
.v2-meta-val { font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.70);font-weight:600; }
.v2-state-tag { font-size:9px;font-family:'DM Mono',monospace;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;border-radius:3px;padding:2px 7px;border:1px solid; }
.v2-state-tag--active { color:#d4ff00;border-color:rgba(212,255,0,0.30); }
.v2-state-tag--complete { color:#4ade80;border-color:rgba(74,222,128,0.30); }
.v2-ms-mini-list { display:flex;flex-direction:column;gap:8px; }
.v2-ms-mini { display:flex;align-items:center;gap:9px; }
.v2-ms-mini-dot { width:18px;height:18px;border-radius:3px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-family:'DM Mono',monospace;font-weight:700; }
.v2-ms-mini-body { flex:1;min-width:0; }
.v2-ms-mini-title { font-size:10px;color:rgba(255,255,255,0.50);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px; }
.v2-ms-mini-track { height:1px;background:rgba(255,255,255,0.06);overflow:hidden; }
.v2-ms-mini-fill { height:100%; }
.v2-ms-mini-pct { font-size:9px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.22);flex-shrink:0; }
.v2-sidebar-footer { padding:0 14px;margin-top:auto;padding-top:16px; }
.v2-btn-ghost-sm { display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:8px 12px;border-radius:4px;background:none;border:1px solid rgba(255,255,255,0.10);color:rgba(255,255,255,0.35);font-size:11px;font-family:'DM Sans',sans-serif;font-weight:500;cursor:pointer; }
.v2-btn-ghost-sm:hover { border-color:rgba(255,255,255,0.20);color:rgba(255,255,255,0.70); }
.v2-main { flex:1;min-width:0;padding:40px 48px 72px;display:flex;flex-direction:column;gap:28px; }
.v2-page-header { display:flex;align-items:flex-start;justify-content:space-between;gap:16px; }
.v2-eyebrow { font-size:10px;font-family:'DM Mono',monospace;color:#d4ff00;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px; }
.v2-page-title { font-family:'Syne',sans-serif;font-size:clamp(26px,3vw,36px);font-weight:800;color:#ffffff;letter-spacing:-0.04em;line-height:1;margin:0; }
.v2-agreement-id-chip { display:flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,0.10);border-radius:4px;padding:8px 14px;margin-top:4px; }
.v2-agreement-id-label { font-size:9px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.22);text-transform:uppercase;letter-spacing:0.12em; }
.v2-agreement-id-val { font-size:12px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.60);font-weight:600; }
.v2-stats-grid { display:grid;grid-template-columns:repeat(4,1fr);border:1px solid rgba(255,255,255,0.07); }
@media (max-width:780px) { .v2-stats-grid { grid-template-columns:1fr 1fr; } }
.v2-stat-card { padding:24px 20px 20px;display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,0.07); }
.v2-stat-card:last-child { border-right:none; }
.v2-stat-icon { font-size:18px;margin-bottom:20px;opacity:0.6; }
.v2-stat-label { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.30);text-transform:uppercase;letter-spacing:0.10em;margin-bottom:8px; }
.v2-stat-value { font-family:'Syne',sans-serif;font-size:16px;font-weight:700;color:#ffffff;letter-spacing:-0.03em;line-height:1.2;word-break:break-all;margin-bottom:5px; }
.v2-stat-sub { font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.25); }
.v2-progress-card { border:1px solid rgba(255,255,255,0.07);padding:20px;display:flex;flex-direction:column;gap:14px; }
.v2-progress-top { display:flex;align-items:center;justify-content:space-between; }
.v2-progress-title { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.30);text-transform:uppercase;letter-spacing:0.09em; }
.v2-progress-stat { display:flex;align-items:baseline;gap:8px; }
.v2-progress-pct { font-size:20px;font-family:'DM Mono',monospace;font-weight:800;letter-spacing:-0.03em; }
.v2-progress-frac { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.25); }
.v2-progress-track { height:3px;background:rgba(255,255,255,0.06);overflow:hidden; }
.v2-progress-fill { height:100%;transition:width 0.8s ease; }
.v2-section-head { display:flex;align-items:center;justify-content:space-between;margin-bottom:12px; }
.v2-section-title { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.30);text-transform:uppercase;letter-spacing:0.10em; }
.v2-section-count { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.20); }
.v2-ms-list { display:flex;flex-direction:column;border:1px solid rgba(255,255,255,0.07); }
.v2-ms-block { background:#0d0d0d;border-bottom:1px solid rgba(255,255,255,0.06); }
.v2-ms-block:last-child { border-bottom:none; }
.v2-ms-block--done { opacity:0.55; }
.v2-ms-block--disputed { background:rgba(212,255,0,0.02);border-left:2px solid rgba(212,255,0,0.35); }
.v2-ms-block--pending { background:rgba(255,255,255,0.01); }
.v2-ms-block--flash { animation:v2Flash 0.4s ease; }
@keyframes v2Flash { 0%{background:rgba(212,255,0,0.12)} 100%{background:transparent} }
.v2-ms-row { display:flex;align-items:flex-start; }
.v2-ms-accent-bar { width:2px;flex-shrink:0;align-self:stretch;min-height:60px; }
.v2-ms-num { width:28px;height:28px;border-radius:4px;flex-shrink:0;border:1px solid;margin:20px 16px 20px 18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-family:'DM Mono',monospace;font-weight:800; }
.v2-ms-info { flex:1;min-width:0;padding:20px 0 20px 2px; }
.v2-ms-title-row { display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap; }
.v2-ms-title { font-size:14px;font-weight:600;color:#ffffff;letter-spacing:-0.02em;font-family:'DM Sans',sans-serif; }
.v2-ms-condition { font-size:12px;color:rgba(255,255,255,0.38);line-height:1.65;max-width:440px;margin-bottom:8px; }
.v2-ms-meta-row { display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
.v2-ms-deadline { display:flex;align-items:center;gap:4px;font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.22); }
.v2-tx-link { display:flex;align-items:center;gap:4px;font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.28);text-decoration:none; }
.v2-tx-link:hover { color:#d4ff00; }
.v2-tx-error { font-size:10px;font-family:'DM Mono',monospace;color:#f87171; }
.v2-ms-right { display:flex;flex-direction:column;align-items:flex-end;gap:10px;flex-shrink:0;padding:20px 22px; }
.v2-ms-amount-block { text-align:right; }
.v2-ms-amount { font-family:'DM Mono',monospace;font-size:14px;font-weight:600;letter-spacing:-0.02em;line-height:1; }
.v2-ms-amount-sub { font-size:10px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.22);margin-top:4px; }
.v2-ms-actions { display:flex;align-items:center;gap:5px;flex-wrap:wrap;justify-content:flex-end; }
.v2-status-pill { display:inline-flex;align-items:center;gap:5px;font-size:9px;font-family:'DM Mono',monospace;font-weight:700;letter-spacing:0.05em;border:1px solid;border-radius:3px;padding:3px 8px;white-space:nowrap; }
.v2-spinner-dot { width:5px;height:5px;border-radius:50%;background:currentColor;animation:v2Pulse 1.4s ease infinite; }
.v2-chip { display:inline-flex;align-items:center;gap:5px;font-size:9px;font-family:'DM Mono',monospace;font-weight:700;letter-spacing:0.04em;border-radius:3px;padding:2px 7px;border:1px solid; }
.v2-chip--dispute { color:#d4ff00;border-color:rgba(212,255,0,0.30); }
.v2-chip--pending { color:rgba(255,255,255,0.55);border-color:rgba(255,255,255,0.12); }
.v2-chip--failed { color:#f87171;border-color:rgba(248,113,113,0.28); }
.v2-btn { display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:4px;font-size:11px;font-family:'DM Mono',monospace;font-weight:600;cursor:pointer;border:1px solid;white-space:nowrap;letter-spacing:0.02em; }
.v2-btn:disabled { opacity:0.35;cursor:not-allowed; }
.v2-btn--release { color:#0a0a0a;background:#d4ff00;border-color:#d4ff00; }
.v2-btn--release:hover:not(:disabled) { background:#e0ff33;border-color:#e0ff33; }
.v2-btn--dispute { color:rgba(255,255,255,0.70);background:transparent;border-color:rgba(255,255,255,0.15); }
.v2-btn--dispute:hover:not(:disabled) { border-color:rgba(255,255,255,0.30);color:#ffffff; }
.v2-btn--evidence { color:#d4ff00;background:transparent;border-color:rgba(212,255,0,0.25); }
.v2-btn--evidence:hover { border-color:rgba(212,255,0,0.50); }
.v2-btn--retry { color:#f87171;background:transparent;border-color:rgba(248,113,113,0.25); }
.v2-btn--retry:hover { border-color:rgba(248,113,113,0.45); }
.v2-filed-badge { display:inline-flex;align-items:center;gap:5px;font-size:10px;font-family:'DM Mono',monospace;font-weight:700;color:#4ade80;border:1px solid rgba(74,222,128,0.25);border-radius:3px;padding:3px 9px; }
.v2-dispute-panel { border-top:1px solid rgba(212,255,0,0.10);padding:16px 22px; }
.v2-spinner-xs { display:inline-block;width:7px;height:7px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.15);border-top-color:rgba(255,255,255,0.6);animation:v2Spin 0.65s linear infinite;flex-shrink:0; }
.v2-info-strip { border:1px solid rgba(255,255,255,0.07);padding:14px 16px; }
.v2-info-text { font-size:12px;color:rgba(255,255,255,0.28);line-height:1.7;margin:0; }
.v2-info-text strong { color:rgba(255,255,255,0.55);font-weight:500; }
.v2-complete-banner { text-align:center;border:1px solid rgba(74,222,128,0.20);padding:48px 28px; }
.v2-complete-icon { width:52px;height:52px;border-radius:50%;background:#d4ff00;display:flex;align-items:center;justify-content:center;margin:0 auto 18px; }
.v2-complete-title { font-family:'Syne',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#ffffff;margin-bottom:8px; }
.v2-complete-body { font-size:13px;color:rgba(255,255,255,0.35);margin-bottom:28px; }
.v2-complete-actions { display:flex;gap:10px;justify-content:center; }
.v2-btn-primary { display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 24px;border-radius:4px;cursor:pointer;border:none;background:#d4ff00;color:#0a0a0a;font-family:'Syne',sans-serif;font-size:13px;font-weight:700; }
.v2-btn-primary:hover { background:#e0ff33; }
.v2-btn-secondary { display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 24px;border-radius:4px;cursor:pointer;background:transparent;color:rgba(255,255,255,0.55);border:1px solid rgba(255,255,255,0.12);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500; }
.v2-btn-secondary:hover { border-color:rgba(255,255,255,0.22);color:#ffffff; }
@keyframes v2Spin { to { transform:rotate(360deg); } }
@keyframes v2Pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
@media (max-width:900px) { .v2-sidebar{display:none;} .v2-main{padding:24px 20px 56px;} }
@media (max-width:580px) { .v2-stats-grid{grid-template-columns:1fr 1fr;} .v2-ms-row{flex-direction:column;} .v2-ms-right{flex-direction:row;align-items:center;padding-top:0;} }
.v2-modal-backdrop { position:fixed;inset:0;z-index:999;background:rgba(0,0,0,0.80);display:flex;align-items:center;justify-content:center;padding:24px; }
.v2-modal { width:100%;max-width:560px;background:#111111;border:1px solid rgba(255,255,255,0.10);overflow:hidden;display:flex;flex-direction:column;max-height:90vh; }
.v2-modal--evidence { max-width:640px; }
.v2-modal-header { display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0; }
.v2-modal-header-left { display:flex;align-items:center;gap:12px; }
.v2-modal-icon { width:34px;height:34px;border-radius:4px;flex-shrink:0;background:rgba(212,255,0,0.08);border:1px solid rgba(212,255,0,0.20);display:flex;align-items:center;justify-content:center; }
.v2-modal-eyebrow { font-size:9px;font-family:'DM Mono',monospace;font-weight:700;color:#d4ff00;text-transform:uppercase;letter-spacing:0.10em;margin-bottom:3px; }
.v2-modal-title { font-family:'Syne',sans-serif;font-size:15px;font-weight:800;color:#ffffff;letter-spacing:-0.03em; }
.v2-modal-subtitle { font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.28);margin-top:2px; }
.v2-modal-close { width:28px;height:28px;border-radius:4px;flex-shrink:0;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.10);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.35);cursor:pointer; }
.v2-modal-close:hover { background:rgba(255,255,255,0.10);color:#ffffff; }
.v2-modal-steps { display:flex;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0; }
.v2-modal-step { display:flex;align-items:center;gap:8px;font-size:11px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.25); }
.v2-modal-step--active { color:rgba(255,255,255,0.75); }
.v2-modal-step--done { color:#4ade80; }
.v2-modal-step--idle { color:rgba(255,255,255,0.18); }
.v2-modal-step-dot { width:20px;height:20px;border-radius:50%;flex-shrink:0;border:1px solid currentColor;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700; }
.v2-modal-step--active .v2-modal-step-dot { border-color:#d4ff00;color:#d4ff00; }
.v2-modal-step--done .v2-modal-step-dot { border-color:#4ade80;color:#4ade80; }
.v2-modal-step-line { flex:1;height:1px;margin:0 12px; }
.v2-modal-body { padding:20px;display:flex;flex-direction:column;gap:16px;flex-shrink:0; }
.v2-modal-body--scroll { overflow-y:auto;flex:1;padding:0; }
.v2-modal-warn-banner { display:flex;align-items:flex-start;gap:10px;border:1px solid rgba(212,255,0,0.18);padding:13px 14px; }
.v2-modal-warn-banner svg { flex-shrink:0;margin-top:1px; }
.v2-modal-warn-banner p { font-size:12px;color:rgba(255,255,255,0.45);line-height:1.65;margin:0; }
.v2-modal-detail-grid { display:grid;grid-template-columns:1fr 1fr;border:1px solid rgba(255,255,255,0.07); }
.v2-modal-detail { background:#161616;padding:13px 14px;display:flex;flex-direction:column;gap:5px;border-right:1px solid rgba(255,255,255,0.06);border-bottom:1px solid rgba(255,255,255,0.06); }
.v2-modal-detail:nth-child(even) { border-right:none; }
.v2-modal-detail--full { grid-column:1/-1;border-right:none; }
.v2-modal-detail-label { font-size:9px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:0.11em; }
.v2-modal-detail-val { font-size:13px;font-family:'DM Mono',monospace;color:rgba(255,255,255,0.75);font-weight:600;letter-spacing:-0.01em; }
.v2-modal-footer { display:flex;align-items:center;justify-content:flex-end;gap:10px;padding-top:4px; }
.v2-btn-dispute-confirm { display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 20px;border-radius:4px;cursor:pointer;background:#d4ff00;color:#0a0a0a;border:none;font-family:'Syne',sans-serif;font-size:13px;font-weight:700; }
.v2-btn-dispute-confirm:hover { background:#e0ff33; }
.v2-modal-tx-notice { display:flex;align-items:center;gap:10px;border:1px solid rgba(212,255,0,0.14);padding:11px 14px;margin:16px 20px 0;font-size:12px;color:rgba(255,255,255,0.40);font-family:'DM Mono',monospace;flex-shrink:0; }
.v2-spinner-sm { display:inline-block;flex-shrink:0;width:12px;height:12px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.12);border-top-color:rgba(255,255,255,0.60);animation:v2Spin 0.65s linear infinite; }
`;
