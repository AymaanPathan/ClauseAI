"use client";
import { disputeMilestoneAsPartyBThunk } from "@/store/slices/partyBSlice";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/store";

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

interface ArbitratorDecision {
  outcome: "release_to_receiver" | "refund_to_payer" | "split";
  followed_ai: boolean;
  override_reason?: string;
  decided_at: string;
  arbitrator_address: string;
}

// Per-milestone arbitrator decision cache
type ArbDecisionMap = Record<number, ArbitratorDecision | null>;

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

const OPEN_DISPUTE_STATUSES = new Set([
  "awaiting_statements",
  "party_a_submitted",
  "party_b_submitted",
  "ai_pending",
  "ai_complete",
]);

// ── Arbitrator Decision Banner ────────────────────────────────
// Shown inline under a milestone when it was resolved by arbitration

function ArbitratorDecisionBanner({
  decision,
  viewerRole,
}: {
  decision: ArbitratorDecision;
  viewerRole: "A" | "B";
}) {
  const isRelease = decision.outcome === "release_to_receiver";
  const outcomeColor = isRelease ? "var(--green)" : "var(--red)";
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
      style={{
        margin: "8px 0 4px",
        border: `1px solid ${outcomeColor}28`,
        borderRadius: 8,
        overflow: "hidden",
        background: `color-mix(in srgb, ${outcomeColor} 5%, transparent)`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 12px",
          background: `color-mix(in srgb, ${outcomeColor} 8%, transparent)`,
          borderBottom: `1px solid ${outcomeColor}18`,
        }}
      >
        <span style={{ fontSize: 14 }}>⚖</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 9,
              fontFamily: "var(--mono)",
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
        {/* "You" badge for the beneficiary */}
        {((viewerRole === "B" && isRelease) ||
          (viewerRole === "A" && !isRelease)) && (
          <span
            style={{
              fontSize: 9,
              fontFamily: "var(--mono)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: outcomeColor,
              background: `color-mix(in srgb, ${outcomeColor} 15%, transparent)`,
              border: `1px solid ${outcomeColor}30`,
              borderRadius: 3,
              padding: "2px 7px",
            }}
          >
            You
          </span>
        )}
      </div>

      {/* Body */}
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* Personal message */}
        <p
          style={{
            fontSize: 12,
            color: "var(--text-3)",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {personalMsg}
        </p>

        {/* Arbitrator's note — always shown */}
        {decision.override_reason && (
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              padding: "9px 11px",
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontFamily: "var(--mono)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.10em",
                color: "var(--text-4)",
                marginBottom: 5,
              }}
            >
              Arbitrator&apos;s Note
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-3)",
                lineHeight: 1.65,
                fontStyle: "italic",
                margin: 0,
              }}
            >
              &ldquo;{decision.override_reason}&rdquo;
            </p>
          </div>
        )}

        {/* Meta row */}
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
              fontFamily: "var(--mono)",
              color: "var(--text-4)",
            }}
          >
            By {truncateAddr(decision.arbitrator_address)}
          </span>
          <span style={{ color: "var(--text-4)", fontSize: 10 }}>·</span>
          <span
            style={{
              fontSize: 9,
              fontFamily: "var(--mono)",
              color: "var(--text-4)",
            }}
          >
            {fmtDate(decision.decided_at)}
          </span>
          <span style={{ color: "var(--text-4)", fontSize: 10 }}>·</span>
          <span
            style={{
              fontSize: 8,
              fontFamily: "var(--mono)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: decision.followed_ai ? "var(--green)" : "var(--amber)",
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
        .pbd-overlay { position:fixed;inset:0;z-index:1000;background:rgba(5,5,7,0.82);backdrop-filter:blur(20px) saturate(1.4);display:flex;align-items:center;justify-content:center;padding:24px;animation:pbdFadeIn 0.18s ease both; }
        @keyframes pbdFadeIn { from{opacity:0} to{opacity:1} }
        .pbd-sheet { width:100%;max-width:640px;max-height:90vh;background:var(--bg-1);border:1px solid var(--border-hi);border-radius:20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 48px 96px rgba(0,0,0,0.72),inset 0 0 0 1px rgba(255,255,255,0.04);animation:pbdSlideUp 0.28s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes pbdSlideUp { from{opacity:0;transform:translateY(28px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        .pbd-header { display:flex;align-items:center;justify-content:space-between;padding:20px 24px;flex-shrink:0;background:var(--bg-2);border-bottom:1px solid var(--border); }
        .pbd-close-btn { width:32px;height:32px;border-radius:8px;flex-shrink:0;background:var(--bg-3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-4);font-family:var(--font); }
        .pbd-body { flex:1;overflow-y:auto;padding:24px; }
      `}</style>
      <div
        ref={overlayRef}
        className="pbd-overlay"
        onClick={(e) => {
          if (e.target === overlayRef.current) onClose();
        }}
      >
        <div className="pbd-sheet" role="dialog" aria-modal="true">
          <div className="pbd-header">
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 11,
                  background: "rgba(212,162,58,0.10)",
                  border: "1px solid rgba(212,162,58,0.26)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
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
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--mono)",
                    fontWeight: 600,
                    color: "var(--amber)",
                    textTransform: "uppercase",
                    letterSpacing: "0.10em",
                    marginBottom: 3,
                  }}
                >
                  File Evidence · Dispute
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 16,
                    fontWeight: 700,
                    color: "var(--text-1)",
                    letterSpacing: "-0.03em",
                  }}
                >
                  {ms.title}
                </div>
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

  const completedMs = data.milestones.filter((m) => isSettled(m.status)).length;
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
  const dispatch = useDispatch<AppDispatch>();

  const [disputeConfirmMs, setDisputeConfirmMs] = useState<DbMilestone | null>(
    null,
  );
  const [disputingIndex, setDisputingIndex] = useState<number | null>(null);
  const [data, setData] = useState<AgreementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [historyIds, setHistoryIds] = useState<string[]>([]);
  const [disputeModalMs, setDisputeModalMs] = useState<DbMilestone | null>(
    null,
  );
  const [disputeSubmitted, setDisputeSubmitted] = useState<
    Record<number, boolean>
  >({});
  const joinedDisputeRooms = useState<Set<number>>(() => new Set())[0];
  // ── NEW: per-milestone arbitrator decision cache ──
  const [arbDecisions, setArbDecisions] = useState<ArbDecisionMap>({});

  useEffect(() => {
    setHistoryIds(getPartyBAgreementIds());
  }, []);

  // ── Fetch arbitrator decision for a specific milestone ──
  const fetchArbDecision = useCallback(
    async (milestoneIndex: number) => {
      if (!agreementId) return;
      try {
        const res = await fetch(
          `${API_BASE}/api/arbitrate/${agreementId}/${milestoneIndex}`,
        );
        if (!res.ok) return;
        const json = await res.json();
        if (
          json.dispute?.status === "resolved" &&
          json.dispute?.arbitrator_decision
        ) {
          setArbDecisions((prev) => ({
            ...prev,
            [milestoneIndex]: json.dispute.arbitrator_decision,
          }));
        }
      } catch {
        /* ignore */
      }
    },
    [agreementId],
  );

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

  // ── NEW: update milestone status when arbitrator resolves ──
  const applyArbitratorResolution = useCallback(
    (milestoneIndex: number, outcome: string, decision: ArbitratorDecision) => {
      const newStatus: MsStatus =
        outcome === "release_to_receiver" ? "complete" : "refunded";
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          milestones: prev.milestones.map((ms) =>
            ms.index === milestoneIndex
              ? { ...ms, status: newStatus, completedAt: decision.decided_at }
              : ms,
          ),
        };
      });
      setArbDecisions((prev) => ({ ...prev, [milestoneIndex]: decision }));
    },
    [],
  );

  async function handlePartyBDispute(ms: DbMilestone) {
    if (!agreementId || !walletAddress) return;
    setDisputingIndex(ms.index);
    try {
      const result = await dispatch(
        disputeMilestoneAsPartyBThunk({
          agreementId,
          milestoneIndex: ms.index,
          callerAddress: walletAddress,
        }),
      );
      if (disputeMilestoneAsPartyBThunk.fulfilled.match(result)) {
        const txId = result.payload.txId;
        fetch(`${API_BASE}/api/agreement/${agreementId}/milestone`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            milestoneIndex: ms.index,
            action: "dispute",
            txId,
            txUrl: result.payload.txUrl,
            callerAddress: walletAddress,
          }),
        }).catch(console.warn);
        setDisputeConfirmMs(null);
        setDisputeModalMs(ms);
      }
    } catch (err) {
      console.error("Dispute failed", err);
    } finally {
      setDisputingIndex(null);
    }
  }

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
            if (!json.dispute) return;
            if (OPEN_DISPUTE_STATUSES.has(json.dispute.status)) {
              markMilestoneDisputed(ms.index);
            }
            // ── NEW: if already resolved by arbitrator, apply it immediately ──
            if (
              json.dispute.status === "resolved" &&
              json.dispute.arbitrator_decision
            ) {
              applyArbitratorResolution(
                ms.index,
                json.dispute.arbitrator_decision.outcome,
                json.dispute.arbitrator_decision,
              );
            }
          } catch {
            /* ignore */
          }
        }),
      );
    },
    [agreementId, markMilestoneDisputed, applyArbitratorResolution],
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
          // Check arbitrator decisions for ALL milestones (not just disputed ones)
          checkArbitrateDisputes(json.milestones);
          json.milestones.forEach((ms: DbMilestone) => {
            if (
              ms.status === "disputed" &&
              agreementId &&
              !joinedDisputeRooms.has(ms.index)
            ) {
              joinDisputeRoom(agreementId, ms.index);
              joinedDisputeRooms.add(ms.index);
            }
          });
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

      // ── KEY FIX: if dispute is resolved, update milestone status + store decision ──
      if (payload.status === "resolved" && payload.arbitrator_decision) {
        applyArbitratorResolution(
          idx,
          payload.arbitrator_decision.outcome,
          payload.arbitrator_decision,
        );
      } else if (OPEN_DISPUTE_STATUSES.has(payload.status)) {
        markMilestoneDisputed(idx);
      }

      setLastUpdate(new Date());
      setFlashIndex(idx);
      setTimeout(() => setFlashIndex(null), 2500);

      if (!joinedDisputeRooms.has(idx)) {
        joinDisputeRoom(agreementId!, idx);
        joinedDisputeRooms.add(idx);
      }

      // Also fetch fresh arbitrator decision
      fetchArbDecision(idx);
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
  }, [
    agreementId,
    fetchData,
    markMilestoneDisputed,
    applyArbitratorResolution,
    fetchArbDecision,
    joinedDisputeRooms,
  ]);

  const milestones = data?.milestones ?? [];
  const completedCount = milestones.filter((m) => isSettled(m.status)).length;
  const progressPct =
    milestones.length > 0
      ? Math.round((completedCount / milestones.length) * 100)
      : 0;
  const totalSats = data?.totalAmountSats ?? 0;
  const earnedSats = milestones
    .filter((m) => m.status === "complete")
    .reduce((s, m) => s + m.amountSats, 0);
  const earnedCount = milestones.filter((m) => m.status === "complete").length;
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
      sub: `${earnedCount} milestone${earnedCount !== 1 ? "s" : ""} released`,
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
                stroke={progressPct === 100 ? "var(--green)" : "var(--accent)"}
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
          {/* History Tab */}
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

          {/* Current Tab */}
          {activeTab === "current" && (
            <>
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
                        progressPct === 100 ? "var(--green)" : "var(--accent)",
                    }}
                  />
                </div>
              </div>

              {loading && (
                <div className="db-loading fade-in">
                  <span className="spinner" style={{ width: 16, height: 16 }} />
                  <span className="db-loading-text">
                    Fetching milestone data…
                  </span>
                </div>
              )}

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
                      const isDone = isSettled(ms.status);
                      const isPending = ms.status === "pending";
                      const isDisputed = ms.status === "disputed";
                      const isFlashing = flashIndex === ms.index;
                      const alreadySub = disputeSubmitted[ms.index];
                      const arbDecision = arbDecisions[ms.index] ?? null;
                      // Show arb banner when: milestone is complete/refunded AND we have an arb decision
                      const showArbBanner = isDone && arbDecision !== null;

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
                                  <span className="db-dispute-chip">
                                    ⚑ Dispute
                                  </span>
                                )}
                                {/* ── NEW: show "Arbitrated" chip when resolved by arbitrator ── */}
                                {isDone && arbDecision && (
                                  <span
                                    style={{
                                      fontSize: 9,
                                      fontFamily: "var(--mono)",
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
                                {isFlashing && !isDisputed && !isDone && (
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
                                  {ms.status === "complete"
                                    ? "Released"
                                    : "Settled"}{" "}
                                  {new Date(ms.completedAt).toLocaleString()}
                                </div>
                              )}
                            </div>

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
                                {!isDone && !isPending && !isDisputed && (
                                  <button
                                    className="db-btn db-btn--dispute"
                                    onClick={() => setDisputeConfirmMs(ms)}
                                    disabled={disputingIndex === ms.index}
                                  >
                                    {disputingIndex === ms.index ? (
                                      <span
                                        className="spinner"
                                        style={{ width: 8, height: 8 }}
                                      />
                                    ) : (
                                      "⚑"
                                    )}{" "}
                                    Dispute
                                  </button>
                                )}
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

                          {/* ── NEW: Arbitrator Decision Banner — replaces dispute panel when resolved ── */}
                          {showArbBanner && arbDecision && (
                            <div style={{ padding: "0 16px 16px" }}>
                              <ArbitratorDecisionBanner
                                decision={arbDecision}
                                viewerRole="B"
                              />
                            </div>
                          )}

                          {/* Dispute panel — only show while still in dispute (not resolved) */}
                          {isDisputed && agreementId && (
                            <div className="db-dispute-panel">
                              <div
                                style={{
                                  fontSize: 11,
                                  fontFamily: "var(--mono)",
                                  color: "var(--text-4)",
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
              )}

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
                    All milestones settled
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

      {/* Dispute Modal */}
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

      {/* Dispute Confirm */}
      {disputeConfirmMs && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={() => setDisputeConfirmMs(null)}
        >
          <div
            style={{
              background: "var(--bg-1)",
              border: "1px solid var(--border-hi)",
              borderRadius: 14,
              padding: 28,
              width: "100%",
              maxWidth: 420,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "var(--amber-dim)",
                  border: "1px solid rgba(212,162,58,0.28)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="13"
                  height="13"
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
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--text-1)",
                }}
              >
                Open Dispute
              </div>
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-3)",
                lineHeight: 1.6,
                marginBottom: 6,
              }}
            >
              Milestone:{" "}
              <strong style={{ color: "var(--text-2)" }}>
                {disputeConfirmMs.title}
              </strong>
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-3)",
                lineHeight: 1.6,
                marginBottom: 20,
              }}
            >
              This will flag the milestone on-chain and lock funds until the
              arbitrator resolves it. You will then file your evidence
              statement.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={disputingIndex === disputeConfirmMs.index}
                onClick={() => handlePartyBDispute(disputeConfirmMs)}
              >
                {disputingIndex === disputeConfirmMs.index
                  ? "Submitting…"
                  : "Confirm Dispute On-chain →"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setDisputeConfirmMs(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
