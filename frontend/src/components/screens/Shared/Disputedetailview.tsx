"use client";
// ============================================================
// components/screens/Shared/DisputeDetailView.tsx
//
// Shows full dispute details to BOTH parties (and arbitrator).
// Displays in real-time via Socket.io "dispute:updated" events.
//
// Features:
//  - Both party statements & evidence (redacted until both submitted)
//  - AI verdict with confidence bar & key factors
//  - Arbitrator decision with override reason
//  - Live status timeline
//  - Socket.io subscription to dispute room for instant updates
//
// Usage — Party A dashboard (disputed milestone):
//   <DisputeDetailView
//     agreementId={agreementId}
//     milestoneIndex={ms.index}
//     viewerRole="A"
//   />
//
// Usage — Party B dashboard (disputed milestone):
//   <DisputeDetailView
//     agreementId={agreementId}
//     milestoneIndex={ms.index}
//     viewerRole="B"
//   />
//
// Usage — Arbitrator portal:
//   <DisputeDetailView
//     agreementId={agreementId}
//     milestoneIndex={ms.index}
//     viewerRole="arbitrator"
//   />
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { getSocket, joinDisputeRoom, leaveDisputeRoom } from "@/lib/socket";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────

type DisputeStatus =
  | "awaiting_statements"
  | "party_a_submitted"
  | "party_b_submitted"
  | "ai_pending"
  | "ai_complete"
  | "resolved"
  | "auto_refunded";

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
  status: DisputeStatus;
  contract_terms: {
    payer: string;
    receiver: string;
    arbitrator: string;
    total_amount: number;
    milestone_description: string;
    milestone_percentage: number;
    milestone_deadline?: string;
    agreement_type?: string;
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

// ── Props ─────────────────────────────────────────────────────

export interface DisputeDetailViewProps {
  agreementId: string;
  milestoneIndex: number;
  /** Controls which party label shows "(You)" and redaction logic */
  viewerRole: "A" | "B" | "arbitrator";
  /** Optional pre-loaded dispute (will still subscribe to live updates) */
  initialData?: DisputeData;
}

// ── Helpers ───────────────────────────────────────────────────

function verdictColor(v?: string) {
  if (v === "release_to_receiver") return "var(--green)";
  if (v === "refund_to_payer") return "#ef4444";
  if (v === "split") return "var(--amber)";
  return "var(--text-3)";
}

function verdictLabel(v?: string) {
  if (v === "release_to_receiver") return "Release to Receiver ✓";
  if (v === "refund_to_payer") return "Refund to Payer ↩";
  if (v === "split") return "Split Payment ↔";
  return "—";
}

function statusStep(s: DisputeStatus): number {
  const steps: DisputeStatus[] = [
    "awaiting_statements",
    "party_a_submitted",
    "party_b_submitted",
    "ai_pending",
    "ai_complete",
    "resolved",
  ];
  const idx = steps.indexOf(s);
  return idx === -1 ? 5 : idx; // auto_refunded → resolved level
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateAddr(addr: string) {
  if (!addr || addr === "TBD") return addr;
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

// ── Timeline steps ────────────────────────────────────────────

const TIMELINE_STEPS = [
  { key: "awaiting_statements", label: "Opened" },
  { key: "party_a_submitted", label: "Payer Filed" },
  { key: "party_b_submitted", label: "Receiver Filed" },
  { key: "ai_pending", label: "AI Analyzing" },
  { key: "ai_complete", label: "AI Ready" },
  { key: "resolved", label: "Resolved" },
];

// ── Main Component ────────────────────────────────────────────

export default function DisputeDetailView({
  agreementId,
  milestoneIndex,
  viewerRole,
  initialData,
}: DisputeDetailViewProps) {
  const [dispute, setDispute] = useState<DisputeData | null>(
    initialData ?? null,
  );
  const [loading, setLoading] = useState(!initialData);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [flash, setFlash] = useState(false);

  // ── Fetch dispute ──────────────────────────────────────────
  const fetchDispute = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/api/arbitrate/${agreementId}/${milestoneIndex}`,
      );
      if (!res.ok) return;
      const json = await res.json();
      if (json.dispute) {
        setDispute(json.dispute);
        setLastUpdate(new Date());
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [agreementId, milestoneIndex]);

  useEffect(() => {
    fetchDispute();
  }, [fetchDispute]);

  // ── Socket.io — real-time updates ─────────────────────────
  // The arbitrate router emits "dispute:updated" to BOTH:
  //   • dispute:{agreementId}:{milestoneIndex}  (dispute-specific room)
  //   • agreement:{agreementId}                 (agreement room)
  // So both parties in the agreement room AND anyone watching
  // the dispute room receive instant updates.
  useEffect(() => {
    const socket = getSocket();
    joinDisputeRoom(agreementId, milestoneIndex);

    function onDisputeUpdated(payload: any) {
      if (
        payload.agreement_id !== agreementId ||
        payload.milestone_index !== milestoneIndex
      )
        return;

      setDispute(payload as DisputeData);
      setLastUpdate(new Date());
      setFlash(true);
      setTimeout(() => setFlash(false), 1500);
    }

    socket.on("dispute:updated", onDisputeUpdated);
    return () => {
      socket.off("dispute:updated", onDisputeUpdated);
      leaveDisputeRoom(agreementId, milestoneIndex);
    };
  }, [agreementId, milestoneIndex]);

  // ── Redaction logic ────────────────────────────────────────
  // Neither party can see the other's statement until BOTH have
  // submitted — prevents gaming the response.
  const bothSubmitted =
    !!dispute?.party_a_submitted_at && !!dispute?.party_b_submitted_at;

  const canSeePartyA =
    viewerRole === "A" || viewerRole === "arbitrator" || bothSubmitted;
  const canSeePartyB =
    viewerRole === "B" || viewerRole === "arbitrator" || bothSubmitted;

  // ── Early states ───────────────────────────────────────────
  if (loading) {
    return (
      <div style={styles.wrap}>
        <style>{css}</style>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: 24,
          }}
        >
          <span className="ddv-spinner" />
          <span
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              fontFamily: "var(--mono)",
            }}
          >
            Loading dispute…
          </span>
        </div>
      </div>
    );
  }

  if (!dispute) {
    return (
      <div style={styles.wrap}>
        <style>{css}</style>
        <div
          style={{
            padding: 24,
            textAlign: "center" as const,
            color: "var(--text-4)",
            fontSize: 12,
          }}
        >
          No dispute record found.
        </div>
      </div>
    );
  }

  const currentStep = statusStep(dispute.status);
  const isResolved =
    dispute.status === "resolved" || dispute.status === "auto_refunded";

  return (
    <div
      style={{
        ...styles.wrap,
        boxShadow: flash ? "0 0 0 2px rgba(245,158,11,0.45)" : "none",
        transition: "box-shadow 0.4s ease",
      }}
    >
      <style>{css}</style>

      {/* ── Header ── */}
      <div style={styles.header}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.label}>
            Dispute · Milestone {milestoneIndex + 1}
          </div>
          <div style={styles.title}>
            {dispute.contract_terms.milestone_description}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column" as const,
            alignItems: "flex-end",
            gap: 5,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontFamily: "var(--mono)",
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 12,
              border: "1px solid",
              color: isResolved ? "var(--green)" : "var(--amber)",
              background: isResolved
                ? "rgba(34,197,94,0.1)"
                : "rgba(245,158,11,0.1)",
              borderColor: isResolved
                ? "rgba(34,197,94,0.3)"
                : "rgba(245,158,11,0.3)",
            }}
          >
            {isResolved ? "✓ Resolved" : "⚑ Active Dispute"}
          </div>
          {lastUpdate && (
            <span
              style={{
                fontSize: 9,
                fontFamily: "var(--mono)",
                color: "var(--text-4)",
              }}
            >
              Live · {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* ── Timeline ── */}
      <div style={styles.timeline}>
        {TIMELINE_STEPS.map((step, i) => {
          const done = i <= currentStep;
          const active = i === currentStep;
          return (
            <div
              key={step.key}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column" as const,
                alignItems: "center",
                position: "relative" as const,
                minWidth: 48,
              }}
            >
              {/* Connector line (right half) */}
              {i < TIMELINE_STEPS.length - 1 && (
                <div
                  style={{
                    position: "absolute" as const,
                    top: 5,
                    left: "50%",
                    right: 0,
                    height: 2,
                    background:
                      i < currentStep ? "var(--green)" : "var(--border)",
                    transition: "background 0.4s",
                  }}
                />
              )}
              {/* Dot */}
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  border: `2px solid ${done ? (active ? "var(--amber)" : "var(--green)") : "var(--border)"}`,
                  background: done
                    ? active
                      ? "var(--amber)"
                      : "var(--green)"
                    : "var(--bg-3)",
                  zIndex: 1,
                  flexShrink: 0,
                  boxShadow: active
                    ? "0 0 0 3px rgba(245,158,11,0.25)"
                    : "none",
                  transition: "all 0.3s",
                }}
              />
              {/* Label */}
              <div
                style={{
                  fontSize: 9,
                  fontFamily: "var(--mono)",
                  color: done ? "var(--text-2)" : "var(--text-4)",
                  fontWeight: active ? 700 : 400,
                  textAlign: "center" as const,
                  marginTop: 5,
                  lineHeight: 1.3,
                }}
              >
                {step.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Contract info pills ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
        <InfoPill
          label="Payer"
          value={truncateAddr(dispute.contract_terms.payer)}
        />
        <InfoPill
          label="Receiver"
          value={truncateAddr(dispute.contract_terms.receiver)}
        />
        <InfoPill
          label="Arbitrator"
          value={truncateAddr(dispute.contract_terms.arbitrator)}
        />
        <InfoPill
          label="Milestone Value"
          value={`${dispute.contract_terms.milestone_percentage}% · ${((dispute.contract_terms.total_amount * dispute.contract_terms.milestone_percentage) / 100).toFixed(6)} sBTC`}
        />
        {dispute.contract_terms.milestone_deadline && (
          <InfoPill
            label="Deadline"
            value={dispute.contract_terms.milestone_deadline}
          />
        )}
        <InfoPill label="Opened" value={formatDate(dispute.opened_at)} />
      </div>

      {/* ── Statements (side-by-side) ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
        <StatementCard
          party="A"
          label={`Payer${viewerRole === "A" ? " (You)" : ""}`}
          statement={dispute.party_a_statement}
          evidence={dispute.party_a_evidence ?? []}
          submittedAt={dispute.party_a_submitted_at}
          submitted={!!dispute.party_a_submitted_at}
          visible={canSeePartyA}
        />
        <StatementCard
          party="B"
          label={`Receiver${viewerRole === "B" ? " (You)" : ""}`}
          statement={dispute.party_b_statement}
          evidence={dispute.party_b_evidence ?? []}
          submittedAt={dispute.party_b_submitted_at}
          submitted={!!dispute.party_b_submitted_at}
          visible={canSeePartyB}
        />
      </div>

      {/* Redaction notice for parties */}
      {!bothSubmitted && viewerRole !== "arbitrator" && (
        <div style={styles.notice}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--amber)"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span
            style={{ fontSize: 11, color: "var(--amber)", lineHeight: 1.6 }}
          >
            The other party's statement is hidden until both parties have
            submitted. This ensures neither side can strategically tailor their
            response.
          </span>
        </div>
      )}

      {/* ── AI + Arbitrator sections — arbitrator only ── */}
      {viewerRole === "arbitrator" && (
        <>
          {/* AI Pending indicator */}
          {dispute.status === "ai_pending" && (
            <div style={styles.aiPending}>
              <span className="ddv-spinner ddv-spinner--amber" />
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-2)",
                  fontWeight: 600,
                }}
              >
                AI is analyzing both statements…
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-4)",
                  marginLeft: "auto",
                }}
              >
                Usually takes 5–15 seconds
              </span>
            </div>
          )}

          {/* AI Verdict */}
          {dispute.ai_verdict && <AIVerdictCard verdict={dispute.ai_verdict} />}

          {/* Awaiting arbitrator */}
          {dispute.status === "ai_complete" && !dispute.arbitrator_decision && (
            <div style={styles.awaitingArbitrator}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--text-1)",
                  marginBottom: 4,
                }}
              >
                ⚖️ Awaiting Arbitrator Decision
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-3)",
                  lineHeight: 1.6,
                }}
              >
                The AI has issued its recommendation. The designated arbitrator
                ({truncateAddr(dispute.contract_terms.arbitrator)}) must now
                confirm or override the verdict to finalize this dispute.
              </div>
            </div>
          )}

          {/* Arbitrator Decision */}
          {dispute.arbitrator_decision && (
            <ArbitratorDecisionCard decision={dispute.arbitrator_decision} />
          )}
        </>
      )}

      {/* ── Parties: show pending notice while arbitrator reviews ── */}
      {viewerRole !== "arbitrator" && bothSubmitted && !isResolved && (
        <div style={styles.awaitingArbitrator}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-1)",
              marginBottom: 4,
            }}
          >
            ⚖️ Awaiting Arbitrator Review
          </div>
          <div
            style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.6 }}
          >
            Both statements have been received. The arbitrator (
            {truncateAddr(dispute.contract_terms.arbitrator)}) is now reviewing
            the case and will issue a final decision.
          </div>
        </div>
      )}

      {/* ── Parties: show outcome only once fully resolved ── */}
      {viewerRole !== "arbitrator" &&
        isResolved &&
        dispute.arbitrator_decision && (
          <div
            style={{
              padding: "13px 15px",
              background:
                verdictColor(dispute.arbitrator_decision.outcome) + "0d",
              border: `1px solid ${verdictColor(dispute.arbitrator_decision.outcome)}35`,
              borderRadius: 10,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text-1)",
                marginBottom: 4,
              }}
            >
              ⚖️ Dispute Resolved
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: verdictColor(dispute.arbitrator_decision.outcome),
                fontFamily: "var(--mono)",
                marginBottom: 6,
              }}
            >
              {verdictLabel(dispute.arbitrator_decision.outcome)}
            </div>
            <div
              style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.6 }}
            >
              The arbitrator has issued a final decision. The on-chain
              transaction will reflect this outcome.
            </div>
          </div>
        )}

      {/* ── Footer ── */}
      {dispute.resolved_at && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--mono)",
              color: "var(--green)",
            }}
          >
            Resolved: {formatDate(dispute.resolved_at)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "6px 11px",
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontFamily: "var(--mono)",
          color: "var(--text-4)",
          textTransform: "uppercase" as const,
          letterSpacing: "0.07em",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 11,
          fontFamily: "var(--mono)",
          color: "var(--text-2)",
          fontWeight: 600,
          wordBreak: "break-all" as const,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatementCard({
  party,
  label,
  statement,
  evidence,
  submittedAt,
  submitted,
  visible,
}: {
  party: "A" | "B";
  label: string;
  statement: string;
  evidence: string[];
  submittedAt?: string;
  submitted: boolean;
  visible: boolean;
}) {
  const color = party === "A" ? "#60a5fa" : "var(--amber)";
  const bg = party === "A" ? "rgba(96,165,250,0.07)" : "rgba(245,158,11,0.07)";
  const border =
    party === "A" ? "rgba(96,165,250,0.22)" : "rgba(245,158,11,0.22)";

  return (
    <div
      style={{
        flex: 1,
        minWidth: 240,
        background: "var(--bg-1)",
        border: `1px solid ${border}`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 13px",
          background: bg,
          borderBottom: `1px solid ${border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              fontFamily: "var(--mono)",
              fontWeight: 800,
              color,
              background: color + "20",
              border: `1px solid ${color}35`,
            }}
          >
            {party}
          </div>
          <span
            style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}
          >
            {label}
          </span>
        </div>
        {submitted ? (
          <span
            style={{
              fontSize: 9,
              fontFamily: "var(--mono)",
              color: "var(--green)",
              background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: 4,
              padding: "1px 6px",
            }}
          >
            ✓ Submitted
          </span>
        ) : (
          <span
            style={{
              fontSize: 9,
              fontFamily: "var(--mono)",
              color: "var(--text-4)",
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "1px 6px",
            }}
          >
            Pending
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "12px 13px" }}>
        {!submitted ? (
          <p
            style={{
              fontSize: 11,
              color: "var(--text-4)",
              fontStyle: "italic",
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            Waiting for {label.split(" ")[0].toLowerCase()} to submit their
            statement…
          </p>
        ) : !visible ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              color: "var(--text-4)",
            }}
          >
            <span>🔒</span>
            <span style={{ fontStyle: "italic", lineHeight: 1.6 }}>
              Revealed once you submit your own statement.
            </span>
          </div>
        ) : (
          <>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-2)",
                lineHeight: 1.75,
                whiteSpace: "pre-wrap" as const,
                margin: "0 0 10px 0",
              }}
            >
              {statement || (
                <span style={{ color: "var(--text-4)", fontStyle: "italic" }}>
                  No statement provided.
                </span>
              )}
            </p>

            {evidence.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 9,
                    fontFamily: "var(--mono)",
                    color: "var(--text-4)",
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.07em",
                    marginBottom: 6,
                  }}
                >
                  Evidence ({evidence.length})
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column" as const,
                    gap: 4,
                  }}
                >
                  {evidence.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--mono)",
                        color,
                        textDecoration: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "5px 8px",
                        background: bg,
                        border: `1px solid ${border}`,
                        borderRadius: 5,
                      }}
                    >
                      <span style={{ flexShrink: 0 }}>📎</span>
                      <span
                        style={{
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap" as const,
                        }}
                      >
                        [{party}-{i + 1}] {url.split("/").pop() ?? url}
                      </span>
                      <span style={{ flexShrink: 0 }}>↗</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {submittedAt && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 9,
                  fontFamily: "var(--mono)",
                  color: "var(--text-4)",
                }}
              >
                Submitted{" "}
                {new Date(submittedAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AIVerdictCard({ verdict }: { verdict: AIVerdict }) {
  const vc = verdictColor(verdict.verdict);

  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: `1px solid ${vc}40`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 15px",
          background: vc + "0d",
          borderBottom: `1px solid ${vc}28`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 14 }}>🤖</span>
          <span
            style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)" }}
          >
            AI Arbitration Verdict
          </span>
        </div>
        <span
          style={{
            fontSize: 10,
            fontFamily: "var(--mono)",
            color: "var(--text-4)",
          }}
        >
          {verdict.model ? `${verdict.model}` : "AI"}
          {verdict.latency_ms
            ? ` · ${(verdict.latency_ms / 1000).toFixed(1)}s`
            : ""}
        </span>
      </div>

      <div
        style={{
          padding: "14px 15px",
          display: "flex",
          flexDirection: "column" as const,
          gap: 12,
        }}
      >
        {/* Verdict + confidence */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap" as const,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: vc,
              fontFamily: "var(--mono)",
              padding: "5px 12px",
              background: vc + "14",
              border: `1px solid ${vc}35`,
              borderRadius: 7,
            }}
          >
            {verdictLabel(verdict.verdict)}
          </div>

          {verdict.split_percentage !== undefined && (
            <span
              style={{
                fontSize: 11,
                color: "var(--text-3)",
                fontFamily: "var(--mono)",
              }}
            >
              Receiver {verdict.split_percentage}% / Payer{" "}
              {100 - verdict.split_percentage}%
            </span>
          )}

          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                color: "var(--text-4)",
              }}
            >
              Confidence
            </span>
            <div
              style={{
                width: 80,
                height: 5,
                background: "var(--bg-3)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${verdict.confidence}%`,
                  background:
                    verdict.confidence >= 70
                      ? "var(--green)"
                      : verdict.confidence >= 40
                        ? "var(--amber)"
                        : "#ef4444",
                  borderRadius: 3,
                  transition: "width 0.6s",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--mono)",
                fontWeight: 700,
                color: "var(--text-2)",
              }}
            >
              {verdict.confidence}%
            </span>
          </div>
        </div>

        {/* Reasoning */}
        <div>
          <SectionLabel>Reasoning</SectionLabel>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-2)",
              lineHeight: 1.75,
              margin: 0,
            }}
          >
            {verdict.reasoning}
          </p>
        </div>

        {/* Key factors */}
        {verdict.key_factors.length > 0 && (
          <div>
            <SectionLabel>Key Factors</SectionLabel>
            <div
              style={{
                display: "flex",
                flexDirection: "column" as const,
                gap: 4,
              }}
            >
              {verdict.key_factors.map((f, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 11,
                    color: "var(--text-2)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "5px 10px",
                    background: "var(--bg-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 5,
                  }}
                >
                  <span style={{ color: vc, flexShrink: 0 }}>→</span>
                  {f}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warnings */}
        {verdict.warnings.length > 0 && (
          <div>
            <SectionLabel color="var(--amber)">⚠ Warnings</SectionLabel>
            <div
              style={{
                display: "flex",
                flexDirection: "column" as const,
                gap: 4,
              }}
            >
              {verdict.warnings.map((w, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 11,
                    color: "var(--amber)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 7,
                    padding: "5px 10px",
                    background: "rgba(245,158,11,0.06)",
                    border: "1px solid rgba(245,158,11,0.2)",
                    borderRadius: 5,
                  }}
                >
                  <span style={{ flexShrink: 0 }}>⚠</span>
                  {w}
                </div>
              ))}
            </div>
          </div>
        )}

        <span
          style={{
            fontSize: 9,
            fontFamily: "var(--mono)",
            color: "var(--text-4)",
          }}
        >
          Generated {formatDate(verdict.generated_at)}
        </span>
      </div>
    </div>
  );
}

function ArbitratorDecisionCard({
  decision,
}: {
  decision: ArbitratorDecision;
}) {
  const dc = verdictColor(decision.outcome);

  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: `2px solid ${dc}55`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 15px",
          background: dc + "0f",
          borderBottom: `1px solid ${dc}30`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 14 }}>⚖️</span>
          <span
            style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)" }}
          >
            Final Arbitrator Decision
          </span>
        </div>
        <span
          style={{
            fontSize: 9,
            fontFamily: "var(--mono)",
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 5,
            border: "1px solid",
            color: decision.followed_ai ? "var(--green)" : "var(--amber)",
            background: decision.followed_ai
              ? "rgba(34,197,94,0.1)"
              : "rgba(245,158,11,0.1)",
            borderColor: decision.followed_ai
              ? "rgba(34,197,94,0.25)"
              : "rgba(245,158,11,0.25)",
          }}
        >
          {decision.followed_ai ? "Confirmed AI" : "Overrode AI"}
        </span>
      </div>

      <div
        style={{
          padding: "14px 15px",
          display: "flex",
          flexDirection: "column" as const,
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: dc,
            fontFamily: "var(--mono)",
            padding: "5px 12px",
            background: dc + "12",
            border: `1px solid ${dc}35`,
            borderRadius: 7,
            display: "inline-block",
          }}
        >
          {verdictLabel(decision.outcome)}
        </div>

        {decision.override_reason && (
          <div>
            <SectionLabel color="var(--amber)">Override Reason</SectionLabel>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-2)",
                lineHeight: 1.7,
                padding: "8px 12px",
                background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.2)",
                borderRadius: 6,
              }}
            >
              {decision.override_reason}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" as const }}>
          <div>
            <SectionLabel>Arbitrator</SectionLabel>
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--mono)",
                color: "var(--text-2)",
              }}
            >
              {decision.arbitrator_address.length > 20
                ? `${decision.arbitrator_address.slice(0, 14)}…${decision.arbitrator_address.slice(-6)}`
                : decision.arbitrator_address}
            </span>
          </div>
          <div>
            <SectionLabel>Decided</SectionLabel>
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--mono)",
                color: "var(--text-2)",
              }}
            >
              {formatDate(decision.decided_at)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <div
      style={{
        fontSize: 9,
        fontFamily: "var(--mono)",
        color: color ?? "var(--text-4)",
        textTransform: "uppercase" as const,
        letterSpacing: "0.08em",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    background: "var(--bg-2)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  label: {
    fontSize: 10,
    fontFamily: "var(--mono)",
    color: "var(--text-4)",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-1)",
    lineHeight: 1.3,
  },
  timeline: {
    display: "flex",
    alignItems: "flex-start",
    overflowX: "auto",
    paddingBottom: 4,
  },
  notice: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "10px 13px",
    background: "rgba(245,158,11,0.05)",
    border: "1px solid rgba(245,158,11,0.2)",
    borderRadius: 8,
  },
  aiPending: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "13px 15px",
    background: "var(--bg-1)",
    border: "1px solid var(--border)",
    borderRadius: 10,
  },
  awaitingArbitrator: {
    padding: "13px 15px",
    background: "rgba(245,158,11,0.04)",
    border: "1px solid rgba(245,158,11,0.2)",
    borderRadius: 10,
  },
};

const css = `
.ddv-spinner {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid var(--bg-3);
  border-top-color: var(--green);
  border-radius: 50%;
  animation: ddv-spin 0.7s linear infinite;
  flex-shrink: 0;
}
.ddv-spinner--amber { border-top-color: var(--amber); }
@keyframes ddv-spin { to { transform: rotate(360deg); } }
`;
