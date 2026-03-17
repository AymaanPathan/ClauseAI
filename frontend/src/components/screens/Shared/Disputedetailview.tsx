"use client";
// ============================================================
// components/screens/Shared/Disputedetailview.tsx
//
// Used inside Party A and Party B dashboards, inline below
// each disputed milestone row.
//
// Key change: when status === "resolved", shows a prominent
// ArbitratorDecisionBanner so parties know the resolution
// was made by the arbitrator AND can read the reason.
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { getSocket, joinDisputeRoom, leaveDisputeRoom } from "@/lib/socket";
import ArbitratorDecisionBanner from "../Arbitrator/ArbitratorDecisionBanner";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL;

interface AIVerdict {
  verdict: "release_to_receiver" | "refund_to_payer" | "split";
  confidence: number;
  reasoning: string;
  key_factors: string[];
  warnings: string[];
  split_percentage?: number;
  generated_at: string;
  model?: string;
  latency_ms?: number;
}

interface ArbitratorDecision {
  outcome: "release_to_receiver" | "refund_to_payer" | "split";
  followed_ai: boolean;
  override_reason?: string;
  decided_at: string;
  arbitrator_address: string;
}

interface DisputeData {
  agreement_id: string;
  milestone_index: number;
  status: string;
  contract_terms: {
    payer: string;
    receiver: string;
    arbitrator: string;
    total_amount: number;
    milestone_description: string;
    milestone_percentage: number;
    milestone_deadline?: string;
  };
  party_a_statement: string;
  party_a_evidence: string[];
  party_a_submitted_at?: string;
  party_b_statement: string;
  party_b_evidence: string[];
  party_b_submitted_at?: string;
  ai_verdict?: AIVerdict;
  arbitrator_decision?: ArbitratorDecision;
  opened_at: string;
  resolved_at?: string;
  updated_at: string;
}

interface Props {
  agreementId: string;
  milestoneIndex: number;
  viewerRole: "A" | "B";
}

function statusLabel(s: string): string {
  switch (s) {
    case "awaiting_statements":
      return "Awaiting Statements";
    case "party_a_submitted":
      return "Payer Filed Statement";
    case "party_b_submitted":
      return "Receiver Filed Statement";
    case "ai_pending":
      return "AI Analyzing…";
    case "ai_complete":
      return "Awaiting Arbitrator";
    case "resolved":
      return "Resolved";
    case "auto_refunded":
      return "Auto-Refunded";
    default:
      return s;
  }
}

function statusColor(s: string): string {
  if (s === "resolved" || s === "auto_refunded") return "#4ade80";
  if (s === "ai_complete") return "#fbbf24";
  if (s === "ai_pending") return "#fbbf24";
  return "rgba(255,255,255,0.35)";
}

function timeAgo(d?: string): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DisputeDetailView({
  agreementId,
  milestoneIndex,
  viewerRole,
}: Props) {
  const [dispute, setDispute] = useState<DisputeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDispute = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/arbitrate/${agreementId}/${milestoneIndex}`,
      );
      if (!res.ok) {
        if (res.status === 404) {
          setLoading(false);
          return;
        }
        throw new Error(`Server error ${res.status}`);
      }
      const json = await res.json();
      setDispute(json.dispute ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dispute");
    } finally {
      setLoading(false);
    }
  }, [agreementId, milestoneIndex]);

  useEffect(() => {
    fetchDispute();
  }, [fetchDispute]);

  useEffect(() => {
    joinDisputeRoom(agreementId, milestoneIndex);
    const socket = getSocket();
    function onDisputeUpdated(payload: any) {
      if (
        payload.agreement_id === agreementId &&
        payload.milestone_index === milestoneIndex
      ) {
        setDispute((prev) => ({ ...(prev ?? {}), ...payload }) as DisputeData);
      }
    }
    socket.on("dispute:updated", onDisputeUpdated);
    return () => {
      socket.off("dispute:updated", onDisputeUpdated);
      leaveDisputeRoom(agreementId, milestoneIndex);
    };
  }, [agreementId, milestoneIndex]);

  if (loading) {
    return (
      <div style={styles.loading}>
        <span style={styles.spinner} />
        <span
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.28)",
            fontFamily: "DM Mono, monospace",
          }}
        >
          Loading dispute…
        </span>
      </div>
    );
  }

  if (error) {
    return <div style={styles.errorBox}>⚠ {error}</div>;
  }

  if (!dispute) {
    return <div style={styles.noDispute}>No dispute record found yet.</div>;
  }

  const isResolved =
    dispute.status === "resolved" || dispute.status === "auto_refunded";
  const aiV = dispute.ai_verdict;
  const sc = statusColor(dispute.status);

  return (
    <div style={styles.root}>
      {/* ── Status bar ── */}
      <div style={styles.statusBar}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {dispute.status === "ai_pending" && (
            <span style={styles.spinnerAmber} />
          )}
          <span
            style={{
              ...styles.statusBadge,
              color: sc,
              borderColor: sc + "30",
              background: sc + "0d",
            }}
          >
            {statusLabel(dispute.status)}
          </span>
        </div>
        <span style={styles.updatedAt}>
          Updated {timeAgo(dispute.updated_at)}
        </span>
      </div>

      {/* ── ARBITRATOR DECISION BANNER — shown prominently when resolved ── */}
      {isResolved && dispute.arbitrator_decision && (
        <ArbitratorDecisionBanner
          agreementId={agreementId}
          milestoneIndex={milestoneIndex}
          viewerRole={viewerRole}
        />
      )}

      {/* ── Statements summary ── */}
      <div style={styles.stmtsRow}>
        <StatementPill
          party="A"
          label={viewerRole === "A" ? "Your Statement" : "Payer Statement"}
          submitted={!!dispute.party_a_submitted_at}
          submittedAt={dispute.party_a_submitted_at}
          statement={dispute.party_a_statement}
          evidenceCount={dispute.party_a_evidence?.length ?? 0}
        />
        <StatementPill
          party="B"
          label={viewerRole === "B" ? "Your Statement" : "Receiver Statement"}
          submitted={!!dispute.party_b_submitted_at}
          submittedAt={dispute.party_b_submitted_at}
          statement={dispute.party_b_statement}
          evidenceCount={dispute.party_b_evidence?.length ?? 0}
        />
      </div>

      {/* ── AI Verdict (collapsed summary) ── */}
      {aiV && !isResolved && <AIVerdictSummary verdict={aiV} />}

      {/* ── Awaiting AI message ── */}
      {!aiV &&
        !isResolved &&
        dispute.party_a_submitted_at &&
        dispute.party_b_submitted_at && (
          <div style={styles.infoNotice}>
            <span style={styles.spinnerAmber} />
            <span>
              AI is analyzing both statements… this usually takes 5–15 seconds.
            </span>
          </div>
        )}

      {/* ── Awaiting statements message ── */}
      {!isResolved &&
        !(dispute.party_a_submitted_at && dispute.party_b_submitted_at) && (
          <div style={styles.infoNotice}>
            {!dispute.party_a_submitted_at && !dispute.party_b_submitted_at
              ? "Neither party has filed a statement yet. File yours to start the dispute process."
              : viewerRole === "A" && !dispute.party_a_submitted_at
                ? "You haven't filed your statement yet. Use the Evidence button above to submit."
                : viewerRole === "B" && !dispute.party_b_submitted_at
                  ? "You haven't filed your statement yet. Use the Evidence button above to submit."
                  : "Waiting for the other party to submit their statement."}
          </div>
        )}

      {/* ── AI ready, awaiting arbitrator ── */}
      {aiV && !isResolved && dispute.status === "ai_complete" && (
        <div
          style={{
            ...styles.infoNotice,
            borderColor: "rgba(251,191,36,0.20)",
            color: "rgba(251,191,36,0.70)",
          }}
        >
          ⚖ AI verdict is ready. Awaiting arbitrator's final decision.
        </div>
      )}
    </div>
  );
}

// ── Statement Pill ────────────────────────────────────────────

function StatementPill({
  party,
  label,
  submitted,
  submittedAt,
  statement,
  evidenceCount,
}: {
  party: "A" | "B";
  label: string;
  submitted: boolean;
  submittedAt?: string;
  statement: string;
  evidenceCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const accent = party === "A" ? "#60a5fa" : "#f472b6";

  return (
    <div
      style={{
        flex: 1,
        border: `1px solid ${submitted ? accent + "25" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <button
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 12px",
          background: submitted ? accent + "08" : "rgba(255,255,255,0.02)",
          border: "none",
          cursor: submitted ? "pointer" : "default",
          gap: 8,
          textAlign: "left",
        }}
        onClick={() => submitted && statement && setExpanded(!expanded)}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: accent + "15",
              border: `1px solid ${accent}30`,
              color: accent,
              fontSize: 9,
              fontFamily: "DM Mono, monospace",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {party}
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "rgba(255,255,255,0.65)",
              fontFamily: "DM Sans, sans-serif",
            }}
          >
            {label}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          {evidenceCount > 0 && (
            <span
              style={{
                fontSize: 9,
                fontFamily: "DM Mono, monospace",
                color: "rgba(255,255,255,0.28)",
              }}
            >
              {evidenceCount} file{evidenceCount !== 1 ? "s" : ""}
            </span>
          )}
          {submitted ? (
            <span
              style={{
                fontSize: 9,
                fontFamily: "DM Mono, monospace",
                color: "#4ade80",
                background: "rgba(74,222,128,0.08)",
                border: "1px solid rgba(74,222,128,0.20)",
                borderRadius: 3,
                padding: "2px 6px",
              }}
            >
              ✓ Filed
            </span>
          ) : (
            <span
              style={{
                fontSize: 9,
                fontFamily: "DM Mono, monospace",
                color: "rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 3,
                padding: "2px 6px",
              }}
            >
              Pending
            </span>
          )}
          {submitted && statement && (
            <span
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.25)",
                transform: expanded ? "rotate(180deg)" : "none",
                display: "inline-block",
                transition: "transform 0.2s",
              }}
            >
              ▾
            </span>
          )}
        </div>
      </button>

      {expanded && statement && (
        <div
          style={{
            padding: "10px 12px",
            borderTop: `1px solid ${accent}12`,
            background: "rgba(255,255,255,0.015)",
          }}
        >
          <p
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.52)",
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            {statement}
          </p>
          {submittedAt && (
            <div
              style={{
                fontSize: 9,
                fontFamily: "DM Mono, monospace",
                color: "rgba(255,255,255,0.22)",
                marginTop: 6,
              }}
            >
              Submitted {new Date(submittedAt).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── AI Verdict Summary ────────────────────────────────────────

function AIVerdictSummary({ verdict }: { verdict: AIVerdict }) {
  const isRelease = verdict.verdict === "release_to_receiver";
  const isRefund = verdict.verdict === "refund_to_payer";
  const vc = isRelease ? "#4ade80" : isRefund ? "#f87171" : "#fbbf24";
  const vl = isRelease
    ? "AI Recommends: Release to Receiver"
    : isRefund
      ? "AI Recommends: Refund to Payer"
      : `AI Recommends: Split (${verdict.split_percentage ?? 50}%)`;

  return (
    <div
      style={{
        border: `1px solid ${vc}22`,
        borderRadius: 8,
        padding: "10px 12px",
        background: vc + "06",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12 }}>🤖</span>
        <span
          style={{
            fontSize: 12,
            fontFamily: "DM Mono, monospace",
            color: vc,
            fontWeight: 600,
          }}
        >
          {vl}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            fontSize: 10,
            fontFamily: "DM Mono, monospace",
            color: "rgba(255,255,255,0.30)",
          }}
        >
          Confidence
        </span>
        <div
          style={{
            width: 48,
            height: 2,
            background: "rgba(255,255,255,0.07)",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${verdict.confidence}%`,
              height: "100%",
              background: vc,
              borderRadius: 1,
            }}
          />
        </div>
        <span
          style={{
            fontSize: 10,
            fontFamily: "DM Mono, monospace",
            color: vc,
            fontWeight: 700,
          }}
        >
          {verdict.confidence}%
        </span>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    fontFamily: "DM Sans, sans-serif",
  },
  statusBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  statusBadge: {
    fontSize: 9,
    fontFamily: "DM Mono, monospace",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.07em",
    border: "1px solid",
    borderRadius: 3,
    padding: "2px 8px",
  },
  updatedAt: {
    fontSize: 10,
    fontFamily: "DM Mono, monospace",
    color: "rgba(255,255,255,0.22)",
  },
  stmtsRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  infoNotice: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 12px",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 7,
    fontSize: 11,
    fontFamily: "DM Mono, monospace",
    color: "rgba(255,255,255,0.35)",
    lineHeight: 1.6,
  },
  loading: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 0",
  },
  spinner: {
    display: "inline-block",
    width: 12,
    height: 12,
    borderRadius: "50%",
    border: "1.5px solid rgba(255,255,255,0.10)",
    borderTopColor: "rgba(255,255,255,0.55)",
    animation: "spin 0.65s linear infinite",
    flexShrink: 0,
  },
  spinnerAmber: {
    display: "inline-block",
    width: 10,
    height: 10,
    borderRadius: "50%",
    border: "1.5px solid rgba(251,191,36,0.15)",
    borderTopColor: "#fbbf24",
    animation: "spin 0.65s linear infinite",
    flexShrink: 0,
  },
  errorBox: {
    padding: "10px 12px",
    background: "rgba(248,113,113,0.07)",
    border: "1px solid rgba(248,113,113,0.20)",
    borderRadius: 7,
    fontSize: 11,
    fontFamily: "DM Mono, monospace",
    color: "#f87171",
  },
  noDispute: {
    fontSize: 11,
    fontFamily: "DM Mono, monospace",
    color: "rgba(255,255,255,0.25)",
    fontStyle: "italic",
    padding: "8px 0",
  },
};
