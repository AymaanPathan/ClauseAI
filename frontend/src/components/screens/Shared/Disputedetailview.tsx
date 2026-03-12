"use client";
// ============================================================
// components/screens/Shared/DisputeDetailView.tsx — compact redesign
// Collapsed by default → expand to see full details
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { getSocket, joinDisputeRoom, leaveDisputeRoom } from "@/lib/socket";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

export interface DisputeDetailViewProps {
  agreementId: string;
  milestoneIndex: number;
  viewerRole: "A" | "B" | "arbitrator";
  initialData?: DisputeData;
}

function verdictColor(v?: string) {
  if (v === "release_to_receiver") return "#4ade80";
  if (v === "refund_to_payer") return "#f87171";
  if (v === "split") return "#fbbf24";
  return "rgba(240,242,245,0.4)";
}
function verdictLabel(v?: string) {
  if (v === "release_to_receiver") return "Release to Receiver";
  if (v === "refund_to_payer") return "Refund to Payer";
  if (v === "split") return "Split Payment";
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
  return idx === -1 ? 5 : idx;
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
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

const TIMELINE_STEPS = [
  { key: "awaiting_statements", label: "Opened" },
  { key: "party_a_submitted", label: "Payer Filed" },
  { key: "party_b_submitted", label: "Receiver Filed" },
  { key: "ai_pending", label: "AI Analyzing" },
  { key: "ai_complete", label: "AI Ready" },
  { key: "resolved", label: "Resolved" },
];

function statusSummary(status: DisputeStatus, viewerRole: string): string {
  if (status === "awaiting_statements")
    return "Awaiting statements from both parties";
  if (status === "party_a_submitted")
    return viewerRole === "A"
      ? "Your statement filed · awaiting receiver"
      : "Payer filed · your statement pending";
  if (status === "party_b_submitted")
    return viewerRole === "B"
      ? "Your statement filed · awaiting review"
      : "Both statements filed · awaiting AI";
  if (status === "ai_pending") return "AI analyzing statements…";
  if (status === "ai_complete") return "AI verdict ready · awaiting arbitrator";
  if (status === "resolved" || status === "auto_refunded")
    return "Dispute resolved";
  return "In dispute";
}

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
  const [expanded, setExpanded] = useState(false);

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

  const bothSubmitted =
    !!dispute?.party_a_submitted_at && !!dispute?.party_b_submitted_at;
  const canSeePartyA =
    viewerRole === "A" || viewerRole === "arbitrator" || bothSubmitted;
  const canSeePartyB =
    viewerRole === "B" || viewerRole === "arbitrator" || bothSubmitted;
  const isResolved =
    dispute?.status === "resolved" || dispute?.status === "auto_refunded";
  const currentStep = dispute ? statusStep(dispute.status) : 0;

  if (loading)
    return (
      <div style={styles.loadingRow}>
        <span style={styles.spinnerSm} />
        <span style={styles.loadingText}>Loading dispute…</span>
      </div>
    );

  if (!dispute)
    return (
      <div style={styles.loadingRow}>
        <span style={styles.loadingText}>No dispute record found.</span>
      </div>
    );

  const vc = verdictColor(
    dispute.arbitrator_decision?.outcome ?? dispute.ai_verdict?.verdict,
  );

  return (
    <>
      <style>{css}</style>
      <div className={`ddv2-wrap${flash ? " ddv2-flash" : ""}`}>
        {/* ── Compact strip (always visible) ── */}
        <button className="ddv2-strip" onClick={() => setExpanded((e) => !e)}>
          <div className="ddv2-strip-left">
            {/* Status dot */}
            <div
              className={`ddv2-dot${isResolved ? " ddv2-dot--resolved" : " ddv2-dot--active"}`}
            />

            {/* Progress pips */}
            <div className="ddv2-pips">
              {TIMELINE_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`ddv2-pip${i <= currentStep ? " ddv2-pip--done" : ""}${i === currentStep ? " ddv2-pip--current" : ""}`}
                />
              ))}
            </div>

            {/* Step label */}
            <span className="ddv2-step-label">
              {TIMELINE_STEPS[currentStep]?.label}
            </span>

            <span className="ddv2-sep">·</span>

            {/* Summary text */}
            <span className="ddv2-summary">
              {statusSummary(dispute.status, viewerRole)}
            </span>
          </div>

          <div className="ddv2-strip-right">
            {/* Party submission indicators */}
            <div className="ddv2-parties">
              <span
                className={`ddv2-party-dot${dispute.party_a_submitted_at ? " ddv2-party-dot--filed" : ""}`}
                title="Payer"
              >
                A
              </span>
              <span
                className={`ddv2-party-dot${dispute.party_b_submitted_at ? " ddv2-party-dot--filed" : ""}`}
                title="Receiver"
              >
                B
              </span>
            </div>

            {lastUpdate && (
              <span className="ddv2-ts">
                {lastUpdate.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}

            {/* Chevron */}
            <svg
              className={`ddv2-chevron${expanded ? " ddv2-chevron--open" : ""}`}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </button>

        {/* ── Expanded panel ── */}
        {expanded && (
          <div className="ddv2-panel">
            {/* Timeline */}
            <div className="ddv2-timeline">
              {TIMELINE_STEPS.map((step, i) => {
                const done = i < currentStep;
                const active = i === currentStep;
                return (
                  <div key={step.key} className="ddv2-tl-step">
                    {i < TIMELINE_STEPS.length - 1 && (
                      <div
                        className="ddv2-tl-line"
                        style={{
                          background: done
                            ? "#4ade80"
                            : "rgba(240,242,245,0.08)",
                        }}
                      />
                    )}
                    <div
                      className={`ddv2-tl-dot${done ? " ddv2-tl-dot--done" : ""}${active ? " ddv2-tl-dot--active" : ""}`}
                    />
                    <div
                      className={`ddv2-tl-label${active ? " ddv2-tl-label--active" : ""}`}
                    >
                      {step.label}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Meta pills */}
            <div className="ddv2-meta-row">
              {[
                { k: "Payer", v: truncateAddr(dispute.contract_terms.payer) },
                {
                  k: "Receiver",
                  v: truncateAddr(dispute.contract_terms.receiver),
                },
                {
                  k: "Arbitrator",
                  v: truncateAddr(dispute.contract_terms.arbitrator),
                },
                {
                  k: "Milestone Value",
                  v: `${dispute.contract_terms.milestone_percentage}% · ${((dispute.contract_terms.total_amount * dispute.contract_terms.milestone_percentage) / 100).toFixed(6)} sBTC`,
                },
                { k: "Opened", v: formatDate(dispute.opened_at) },
              ].map(({ k, v }) => (
                <div key={k} className="ddv2-meta-pill">
                  <div className="ddv2-meta-pill-label">{k}</div>
                  <div className="ddv2-meta-pill-val">{v}</div>
                </div>
              ))}
            </div>

            {/* Statements */}
            <div className="ddv2-stmts">
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

            {/* Redaction notice */}
            {!bothSubmitted && viewerRole !== "arbitrator" && (
              <div className="ddv2-notice">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  <strong
                    style={{ color: "rgba(240,242,245,0.65)", fontWeight: 600 }}
                  >
                    Blind submission system
                  </strong>{" "}
                  — the other party's statement is hidden until both sides have
                  filed. This prevents either party from reading the other's
                  position and strategically adjusting their response.
                  {viewerRole === "B" && !dispute.party_b_submitted_at && (
                    <>
                      {" "}
                      Use the{" "}
                      <strong style={{ color: "#fbbf24" }}>
                        Evidence
                      </strong>{" "}
                      button above to file your statement and unlock theirs.
                    </>
                  )}
                  {viewerRole === "A" && !dispute.party_a_submitted_at && (
                    <>
                      {" "}
                      Use the{" "}
                      <strong style={{ color: "#fbbf24" }}>
                        Evidence
                      </strong>{" "}
                      button above to file your statement and unlock theirs.
                    </>
                  )}
                </span>
              </div>
            )}

            {/* Arbitrator-only */}
            {viewerRole === "arbitrator" && (
              <>
                {dispute.status === "ai_pending" && (
                  <div className="ddv2-ai-pending">
                    <span className="ddv2-spinner-amber" />
                    <span>AI is analyzing both statements…</span>
                    <span className="ddv2-muted">Usually 5–15 seconds</span>
                  </div>
                )}
                {dispute.ai_verdict && (
                  <AIVerdictCard verdict={dispute.ai_verdict} />
                )}
                {dispute.status === "ai_complete" &&
                  !dispute.arbitrator_decision && (
                    <div className="ddv2-awaiting">
                      <div className="ddv2-awaiting-title">
                        ⚖️ Awaiting Arbitrator Decision
                      </div>
                      <div className="ddv2-awaiting-body">
                        AI recommendation ready. The arbitrator (
                        {truncateAddr(dispute.contract_terms.arbitrator)}) must
                        now confirm or override.
                      </div>
                    </div>
                  )}
                {dispute.arbitrator_decision && (
                  <ArbitratorDecisionCard
                    decision={dispute.arbitrator_decision}
                  />
                )}
              </>
            )}

            {/* Party: awaiting */}
            {viewerRole !== "arbitrator" && bothSubmitted && !isResolved && (
              <div className="ddv2-awaiting">
                <div className="ddv2-awaiting-title">
                  ⚖️ Awaiting Arbitrator Review
                </div>
                <div className="ddv2-awaiting-body">
                  Both statements received. The arbitrator (
                  {truncateAddr(dispute.contract_terms.arbitrator)}) is
                  reviewing the case.
                </div>
              </div>
            )}

            {/* Party: resolved */}
            {viewerRole !== "arbitrator" &&
              isResolved &&
              dispute.arbitrator_decision && (
                <div
                  className="ddv2-resolved"
                  style={{ borderColor: vc + "35", background: vc + "06" }}
                >
                  <div className="ddv2-resolved-title">⚖️ Dispute Resolved</div>
                  <div className="ddv2-resolved-verdict" style={{ color: vc }}>
                    {verdictLabel(dispute.arbitrator_decision.outcome)}
                  </div>
                  <div className="ddv2-muted" style={{ fontSize: 11 }}>
                    The arbitrator has issued a final decision. The on-chain
                    transaction will reflect this outcome.
                  </div>
                </div>
              )}

            {dispute.resolved_at && (
              <div className="ddv2-footer">
                Resolved: {formatDate(dispute.resolved_at)}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────

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
  const isA = party === "A";
  const accentColor = isA ? "#60a5fa" : "#4ade80";
  return (
    <div className="ddv2-stmt" style={{ borderColor: accentColor + "25" }}>
      <div
        className="ddv2-stmt-head"
        style={{
          background: accentColor + "08",
          borderColor: accentColor + "18",
        }}
      >
        <div className="ddv2-stmt-party">
          <div
            className="ddv2-stmt-avatar"
            style={{
              background: accentColor + "18",
              borderColor: accentColor + "35",
              color: accentColor,
            }}
          >
            {party}
          </div>
          <span className="ddv2-stmt-name">{label}</span>
        </div>
        {submitted ? (
          <span className="ddv2-badge-submitted">✓ Submitted</span>
        ) : (
          <span className="ddv2-badge-pending">Pending</span>
        )}
      </div>
      <div className="ddv2-stmt-body">
        {!submitted ? (
          <p className="ddv2-muted ddv2-italic">
            Waiting for {label.split(" ")[0].toLowerCase()} to submit their
            statement…
          </p>
        ) : !visible ? (
          <div className="ddv2-locked">
            <div className="ddv2-locked-icon">🔒</div>
            <div>
              <div className="ddv2-locked-title">Blind Submission</div>
              <div className="ddv2-locked-body">
                You'll see this statement after you file yours. Neither party
                can read the other's position first — this prevents strategic
                tailoring.
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="ddv2-stmt-text">
              {statement || (
                <span className="ddv2-muted ddv2-italic">
                  No statement provided.
                </span>
              )}
            </p>
            {evidence.length > 0 && (
              <div className="ddv2-evidence">
                <div className="ddv2-evidence-label">
                  Evidence ({evidence.length})
                </div>
                {evidence.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ddv2-evidence-item"
                    style={{
                      borderColor: accentColor + "25",
                      color: accentColor,
                    }}
                  >
                    <span>📎</span>
                    <span className="ddv2-evidence-name">
                      [{party}-{i + 1}] {url.split("/").pop() ?? url}
                    </span>
                    <span style={{ opacity: 0.5 }}>↗</span>
                  </a>
                ))}
              </div>
            )}
            {submittedAt && (
              <div
                className="ddv2-muted"
                style={{ fontSize: 10, marginTop: 8 }}
              >
                Submitted {formatDate(submittedAt)}
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
    <div className="ddv2-verdict" style={{ borderColor: vc + "30" }}>
      <div
        className="ddv2-verdict-head"
        style={{ background: vc + "08", borderColor: vc + "20" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>🤖</span>
          <span className="ddv2-verdict-title">AI Arbitration Verdict</span>
        </div>
        <span className="ddv2-muted" style={{ fontSize: 10 }}>
          {verdict.model ?? "AI"}
          {verdict.latency_ms
            ? ` · ${(verdict.latency_ms / 1000).toFixed(1)}s`
            : ""}
        </span>
      </div>
      <div className="ddv2-verdict-body">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span
            className="ddv2-verdict-pill"
            style={{ color: vc, background: vc + "12", borderColor: vc + "35" }}
          >
            {verdictLabel(verdict.verdict)}
          </span>
          {verdict.split_percentage !== undefined && (
            <span className="ddv2-muted" style={{ fontSize: 11 }}>
              Receiver {verdict.split_percentage}% / Payer{" "}
              {100 - verdict.split_percentage}%
            </span>
          )}
          <div className="ddv2-conf-row">
            <span className="ddv2-muted" style={{ fontSize: 10 }}>
              Confidence
            </span>
            <div className="ddv2-conf-bar">
              <div
                className="ddv2-conf-fill"
                style={{
                  width: `${verdict.confidence}%`,
                  background:
                    verdict.confidence >= 70
                      ? "#4ade80"
                      : verdict.confidence >= 40
                        ? "#fbbf24"
                        : "#f87171",
                }}
              />
            </div>
            <span className="ddv2-muted" style={{ fontSize: 10 }}>
              {verdict.confidence}%
            </span>
          </div>
        </div>
        <div>
          <div className="ddv2-section-label">Reasoning</div>
          <p className="ddv2-reasoning">{verdict.reasoning}</p>
        </div>
        {verdict.key_factors.length > 0 && (
          <div>
            <div className="ddv2-section-label">Key Factors</div>
            {verdict.key_factors.map((f, i) => (
              <div
                key={i}
                className="ddv2-factor"
                style={{ color: "rgba(240,242,245,0.55)" }}
              >
                <span style={{ color: vc }}>→</span> {f}
              </div>
            ))}
          </div>
        )}
        {verdict.warnings.length > 0 && (
          <div>
            <div className="ddv2-section-label" style={{ color: "#fbbf24" }}>
              ⚠ Warnings
            </div>
            {verdict.warnings.map((w, i) => (
              <div key={i} className="ddv2-factor ddv2-warning">
                <span>⚠</span> {w}
              </div>
            ))}
          </div>
        )}
        <span className="ddv2-muted" style={{ fontSize: 9 }}>
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
    <div className="ddv2-decision" style={{ borderColor: dc + "40" }}>
      <div
        className="ddv2-verdict-head"
        style={{ background: dc + "08", borderColor: dc + "22" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>⚖️</span>
          <span className="ddv2-verdict-title">Final Arbitrator Decision</span>
        </div>
        <span
          className={
            decision.followed_ai ? "ddv2-badge-ai" : "ddv2-badge-override"
          }
        >
          {decision.followed_ai ? "Confirmed AI" : "Overrode AI"}
        </span>
      </div>
      <div className="ddv2-verdict-body">
        <span
          className="ddv2-verdict-pill"
          style={{ color: dc, background: dc + "10", borderColor: dc + "35" }}
        >
          {verdictLabel(decision.outcome)}
        </span>
        {decision.override_reason && (
          <div>
            <div className="ddv2-section-label" style={{ color: "#fbbf24" }}>
              Override Reason
            </div>
            <div className="ddv2-override">{decision.override_reason}</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div>
            <div className="ddv2-section-label">Arbitrator</div>
            <span className="ddv2-mono">
              {decision.arbitrator_address.length > 18
                ? `${decision.arbitrator_address.slice(0, 12)}…${decision.arbitrator_address.slice(-6)}`
                : decision.arbitrator_address}
            </span>
          </div>
          <div>
            <div className="ddv2-section-label">Decided</div>
            <span className="ddv2-mono">{formatDate(decision.decided_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = {
  loadingRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 16px",
  } as React.CSSProperties,
  spinnerSm: {
    display: "inline-block",
    width: 10,
    height: 10,
    borderRadius: "50%",
    border: "1.5px solid rgba(196,255,70,0.2)",
    borderTopColor: "#c4ff46",
    animation: "ddv2Spin 0.65s linear infinite",
  } as React.CSSProperties,
  loadingText: {
    fontSize: 11,
    fontFamily: "var(--mono, monospace)",
    color: "rgba(240,242,245,0.35)",
  } as React.CSSProperties,
};

const css = `
/* ── Wrap ── */
.ddv2-wrap {
  border-top: 1px solid rgba(251,191,36,0.12);
  transition: background 0.3s;
}
.ddv2-flash { background: rgba(251,191,36,0.04); }

/* ── Compact strip ── */
.ddv2-strip {
  width: 100%; display: flex; align-items: center; justify-content: space-between;
  padding: 10px 18px; gap: 12px; cursor: pointer;
  background: none; border: none; text-align: left;
  transition: background 0.14s;
}
.ddv2-strip:hover { background: rgba(240,242,245,0.03); }

.ddv2-strip-left  { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
.ddv2-strip-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

/* Status dot */
.ddv2-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
}
.ddv2-dot--active   { background: #fbbf24; box-shadow: 0 0 6px rgba(251,191,36,0.5); animation: ddv2Pulse 2s ease infinite; }
.ddv2-dot--resolved { background: #4ade80; }

/* Progress pips */
.ddv2-pips { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.ddv2-pip {
  width: 14px; height: 2px; border-radius: 1px;
  background: rgba(240,242,245,0.10); transition: background 0.3s;
}
.ddv2-pip--done    { background: #4ade8060; }
.ddv2-pip--current { background: #fbbf24; }

/* Step + summary labels */
.ddv2-step-label {
  font-size: 10px; font-family: 'DM Mono', monospace; font-weight: 700;
  color: #fbbf24; text-transform: uppercase; letter-spacing: 0.07em;
  flex-shrink: 0; white-space: nowrap;
}
.ddv2-sep { font-size: 10px; color: rgba(240,242,245,0.18); flex-shrink: 0; }
.ddv2-summary {
  font-size: 11px; color: rgba(240,242,245,0.45);
  font-family: 'DM Sans', sans-serif;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* Party dots */
.ddv2-parties { display: flex; align-items: center; gap: 4px; }
.ddv2-party-dot {
  width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 8px; font-family: 'DM Mono', monospace; font-weight: 700;
  background: rgba(240,242,245,0.05); border: 1px solid rgba(240,242,245,0.12);
  color: rgba(240,242,245,0.30); transition: all 0.2s;
}
.ddv2-party-dot--filed { background: rgba(74,222,128,0.12); border-color: rgba(74,222,128,0.30); color: #4ade80; }

.ddv2-ts { font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.25); flex-shrink: 0; }

/* Chevron */
.ddv2-chevron { color: rgba(240,242,245,0.28); flex-shrink: 0; transition: transform 0.22s cubic-bezier(0.16,1,0.3,1); }
.ddv2-chevron--open { transform: rotate(180deg); }

/* ── Expanded panel ── */
.ddv2-panel {
  padding: 16px 18px 18px;
  border-top: 1px solid rgba(240,242,245,0.06);
  display: flex; flex-direction: column; gap: 14px;
  animation: ddv2SlideDown 0.22s cubic-bezier(0.16,1,0.3,1) both;
}
@keyframes ddv2SlideDown {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Timeline ── */
.ddv2-timeline {
  display: flex; align-items: flex-start; gap: 0;
}
.ddv2-tl-step {
  display: flex; flex-direction: column; align-items: center; flex: 1; position: relative;
}
.ddv2-tl-line {
  position: absolute; top: 5px; left: 50%; right: -50%;
  height: 1px; transition: background 0.3s; z-index: 0;
}
.ddv2-tl-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; z-index: 1;
  border: 1.5px solid rgba(240,242,245,0.18); background: #111214;
  transition: all 0.25s;
}
.ddv2-tl-dot--done   { background: #4ade8060; border-color: #4ade80; }
.ddv2-tl-dot--active { background: #fbbf24; border-color: #fbbf24; box-shadow: 0 0 8px rgba(251,191,36,0.4); animation: ddv2Pulse 2s ease infinite; }
.ddv2-tl-label {
  font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.28);
  text-align: center; margin-top: 5px; line-height: 1.3;
}
.ddv2-tl-label--active { color: #fbbf24; font-weight: 700; }

/* ── Meta pills ── */
.ddv2-meta-row { display: flex; flex-wrap: wrap; gap: 6px; }
.ddv2-meta-pill {
  padding: 6px 10px; border-radius: 7px;
  background: rgba(240,242,245,0.04); border: 1px solid rgba(240,242,245,0.08);
}
.ddv2-meta-pill-label { font-size: 8px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.28); text-transform: uppercase; letter-spacing: 0.10em; margin-bottom: 3px; }
.ddv2-meta-pill-val   { font-size: 11px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.75); font-weight: 600; }

/* ── Statements ── */
.ddv2-stmts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
@media (max-width: 640px) { .ddv2-stmts { grid-template-columns: 1fr; } }

.ddv2-stmt {
  border-radius: 10px; border: 1px solid; overflow: hidden;
  background: rgba(240,242,245,0.02);
}
.ddv2-stmt-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-bottom: 1px solid;
}
.ddv2-stmt-party { display: flex; align-items: center; gap: 8px; }
.ddv2-stmt-avatar {
  width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; border: 1px solid;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-family: 'DM Mono', monospace; font-weight: 800;
}
.ddv2-stmt-name { font-size: 12px; font-weight: 600; color: rgba(240,242,245,0.80); font-family: 'DM Sans', sans-serif; }
.ddv2-stmt-body { padding: 12px; }
.ddv2-stmt-text { font-size: 12px; color: rgba(240,242,245,0.65); line-height: 1.6; margin: 0 0 8px; }

.ddv2-badge-submitted { font-size: 9px; font-family: 'DM Mono', monospace; font-weight: 700; color: #4ade80; background: rgba(74,222,128,0.10); border: 1px solid rgba(74,222,128,0.25); border-radius: 5px; padding: 2px 7px; }
.ddv2-badge-pending   { font-size: 9px; font-family: 'DM Mono', monospace; font-weight: 700; color: rgba(240,242,245,0.35); background: rgba(240,242,245,0.05); border: 1px solid rgba(240,242,245,0.10); border-radius: 5px; padding: 2px 7px; }
.ddv2-locked { display: flex; align-items: flex-start; gap: 10px; padding: 4px 0; }
.ddv2-locked-icon  { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
.ddv2-locked-title { font-size: 12px; font-weight: 600; color: rgba(240,242,245,0.55); margin-bottom: 3px; font-family: 'DM Sans', sans-serif; }
.ddv2-locked-body  { font-size: 11px; color: rgba(240,242,245,0.35); line-height: 1.6; }

/* ── Evidence ── */
.ddv2-evidence { margin-top: 8px; }
.ddv2-evidence-label { font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.30); text-transform: uppercase; letter-spacing: 0.10em; margin-bottom: 5px; }
.ddv2-evidence-item {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 9px; border-radius: 6px; border: 1px solid;
  background: rgba(240,242,245,0.03); text-decoration: none;
  margin-bottom: 3px; transition: background 0.14s;
}
.ddv2-evidence-item:hover { background: rgba(240,242,245,0.06); }
.ddv2-evidence-name { font-size: 10px; font-family: 'DM Mono', monospace; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Notice ── */
.ddv2-notice {
  display: flex; align-items: flex-start; gap: 8px;
  background: rgba(251,191,36,0.04); border: 1px solid rgba(251,191,36,0.14);
  border-radius: 8px; padding: 10px 12px;
  font-size: 11px; color: rgba(240,242,245,0.45); line-height: 1.6;
}
.ddv2-notice svg { flex-shrink: 0; margin-top: 1px; }

/* ── Awaiting / Resolved ── */
.ddv2-awaiting {
  background: rgba(240,242,245,0.03); border: 1px solid rgba(240,242,245,0.08);
  border-radius: 10px; padding: 14px 16px;
}
.ddv2-awaiting-title { font-size: 13px; font-weight: 600; color: rgba(240,242,245,0.75); margin-bottom: 6px; font-family: 'DM Sans', sans-serif; }
.ddv2-awaiting-body  { font-size: 11px; color: rgba(240,242,245,0.40); line-height: 1.65; }

.ddv2-resolved { border-radius: 10px; border: 1px solid; padding: 14px 16px; }
.ddv2-resolved-title   { font-size: 12px; font-weight: 700; color: rgba(240,242,245,0.60); margin-bottom: 6px; }
.ddv2-resolved-verdict { font-size: 15px; font-weight: 700; font-family: 'DM Mono', monospace; margin-bottom: 6px; }

/* ── AI Verdict / Decision cards ── */
.ddv2-verdict, .ddv2-decision {
  border-radius: 10px; border: 1px solid; overflow: hidden;
}
.ddv2-verdict-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid;
}
.ddv2-verdict-title { font-size: 12px; font-weight: 600; color: rgba(240,242,245,0.75); font-family: 'DM Sans', sans-serif; }
.ddv2-verdict-body { padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.ddv2-verdict-pill {
  display: inline-flex; align-items: center; font-size: 11px;
  font-family: 'DM Mono', monospace; font-weight: 700;
  border: 1px solid; border-radius: 6px; padding: 3px 10px;
}
.ddv2-conf-row   { display: flex; align-items: center; gap: 7px; }
.ddv2-conf-bar   { width: 60px; height: 3px; background: rgba(240,242,245,0.08); border-radius: 2px; overflow: hidden; }
.ddv2-conf-fill  { height: 100%; border-radius: 2px; transition: width 0.8s cubic-bezier(0.16,1,0.3,1); }
.ddv2-reasoning  { font-size: 12px; color: rgba(240,242,245,0.55); line-height: 1.65; margin: 4px 0 0; }
.ddv2-section-label { font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.30); text-transform: uppercase; letter-spacing: 0.10em; margin-bottom: 5px; }
.ddv2-factor { font-size: 11px; line-height: 1.6; display: flex; gap: 6px; margin-bottom: 3px; }
.ddv2-warning { color: rgba(251,191,36,0.65); }
.ddv2-override { font-size: 12px; color: rgba(240,242,245,0.55); background: rgba(251,191,36,0.06); border: 1px solid rgba(251,191,36,0.16); border-radius: 7px; padding: 10px 12px; line-height: 1.6; }

.ddv2-ai-pending { display: flex; align-items: center; gap: 10px; font-size: 12px; color: rgba(240,242,245,0.50); padding: 12px 14px; background: rgba(251,191,36,0.04); border: 1px solid rgba(251,191,36,0.12); border-radius: 8px; }
.ddv2-badge-ai       { font-size: 9px; font-family: 'DM Mono', monospace; color: #4ade80; background: rgba(74,222,128,0.10); border: 1px solid rgba(74,222,128,0.25); border-radius: 5px; padding: 2px 7px; }
.ddv2-badge-override { font-size: 9px; font-family: 'DM Mono', monospace; color: #fbbf24; background: rgba(251,191,36,0.10); border: 1px solid rgba(251,191,36,0.25); border-radius: 5px; padding: 2px 7px; }

.ddv2-footer { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.25); text-align: right; padding-top: 4px; }

/* ── Utilities ── */
.ddv2-muted   { color: rgba(240,242,245,0.35); font-family: 'DM Mono', monospace; }
.ddv2-italic  { font-style: italic; }
.ddv2-mono    { font-size: 11px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.65); }
.ddv2-spinner-amber {
  display: inline-block; width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0;
  border: 1.5px solid rgba(251,191,36,0.2); border-top-color: #fbbf24;
  animation: ddv2Spin 0.65s linear infinite;
}

@keyframes ddv2Spin  { to { transform: rotate(360deg); } }
@keyframes ddv2Pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.85); } }
`;
