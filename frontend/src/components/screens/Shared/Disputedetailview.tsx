"use client";
// ============================================================
// components/screens/Shared/DisputeDetailView.tsx — 2026 redesign
// Uses ONLY class names from globals.css + dashboard-additions.css
// Zero inline style overrides except dynamic color values.
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

export interface DisputeDetailViewProps {
  agreementId: string;
  milestoneIndex: number;
  viewerRole: "A" | "B" | "arbitrator";
  initialData?: DisputeData;
}

// ── Helpers ───────────────────────────────────────────────────

function verdictColor(v?: string) {
  if (v === "release_to_receiver") return "var(--green)";
  if (v === "refund_to_payer") return "var(--red)";
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
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

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

  if (loading)
    return (
      <div className="ddv-wrap">
        <div className="db-loading">
          <span className="ddv-spinner" />
          <span className="db-loading-text">Loading dispute…</span>
        </div>
      </div>
    );

  if (!dispute)
    return (
      <div className="ddv-wrap">
        <div className="db-loading">
          <span className="db-loading-text">No dispute record found.</span>
        </div>
      </div>
    );

  const currentStep = statusStep(dispute.status);
  const isResolved =
    dispute.status === "resolved" || dispute.status === "auto_refunded";
  const vc = verdictColor(dispute.arbitrator_decision?.outcome);

  return (
    <div className={`ddv-wrap${flash ? " ddv-wrap--flash" : ""}`}>
      {/* ── Header ── */}
      <div className="ddv-header">
        <div className="ddv-header-left">
          <div className="ddv-eyebrow">
            Dispute · Milestone {milestoneIndex + 1}
          </div>
          <div className="ddv-title">
            {dispute.contract_terms.milestone_description}
          </div>
        </div>
        <div className="ddv-header-right">
          <span
            className={`ddv-status-badge${isResolved ? " ddv-status-badge--resolved" : " ddv-status-badge--active"}`}
          >
            {isResolved ? "✓ Resolved" : "⚑ Active Dispute"}
          </span>
          {lastUpdate && (
            <span className="ddv-live-ts">
              Live · {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className="ddv-timeline">
        {TIMELINE_STEPS.map((step, i) => {
          const done = i <= currentStep;
          const active = i === currentStep;
          return (
            <div key={step.key} className="ddv-timeline-step">
              {i < TIMELINE_STEPS.length - 1 && (
                <div
                  className="ddv-timeline-line"
                  style={{
                    background:
                      i < currentStep ? "var(--green)" : "var(--border)",
                  }}
                />
              )}
              <div
                className={[
                  "ddv-timeline-dot",
                  done && !active ? "ddv-timeline-dot--done" : "",
                  active ? "ddv-timeline-dot--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
              <div
                className={`ddv-timeline-step-label${active ? " ddv-timeline-step-label--active" : ""}`}
              >
                {step.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Contract info pills ── */}
      <div className="ddv-pills">
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

      {/* ── Statements ── */}
      <div className="ddv-statements">
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
        <div className="ddv-notice">
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
          <span className="ddv-notice-text">
            The other party's statement is hidden until both parties have
            submitted. This ensures neither side can strategically tailor their
            response.
          </span>
        </div>
      )}

      {/* ── Arbitrator-only: AI + decision ── */}
      {viewerRole === "arbitrator" && (
        <>
          {dispute.status === "ai_pending" && (
            <div className="ddv-ai-pending">
              <span className="ddv-spinner ddv-spinner--amber" />
              <span className="ddv-ai-pending-text">
                AI is analyzing both statements…
              </span>
              <span className="ddv-ai-pending-sub">
                Usually takes 5–15 seconds
              </span>
            </div>
          )}
          {dispute.ai_verdict && <AIVerdictCard verdict={dispute.ai_verdict} />}
          {dispute.status === "ai_complete" && !dispute.arbitrator_decision && (
            <div className="ddv-awaiting">
              <div className="ddv-awaiting-title">
                ⚖️ Awaiting Arbitrator Decision
              </div>
              <div className="ddv-awaiting-body">
                The AI has issued its recommendation. The designated arbitrator
                ({truncateAddr(dispute.contract_terms.arbitrator)}) must now
                confirm or override the verdict to finalize this dispute.
              </div>
            </div>
          )}
          {dispute.arbitrator_decision && (
            <ArbitratorDecisionCard decision={dispute.arbitrator_decision} />
          )}
        </>
      )}

      {/* ── Party view: awaiting arbitrator ── */}
      {viewerRole !== "arbitrator" && bothSubmitted && !isResolved && (
        <div className="ddv-awaiting">
          <div className="ddv-awaiting-title">
            ⚖️ Awaiting Arbitrator Review
          </div>
          <div className="ddv-awaiting-body">
            Both statements have been received. The arbitrator (
            {truncateAddr(dispute.contract_terms.arbitrator)}) is now reviewing
            the case and will issue a final decision.
          </div>
        </div>
      )}

      {/* ── Party view: resolved outcome ── */}
      {viewerRole !== "arbitrator" &&
        isResolved &&
        dispute.arbitrator_decision && (
          <div
            className="ddv-resolved-card"
            style={{ background: vc + "08", borderColor: vc + "30" }}
          >
            <div className="ddv-resolved-title">⚖️ Dispute Resolved</div>
            <div className="ddv-resolved-verdict" style={{ color: vc }}>
              {verdictLabel(dispute.arbitrator_decision.outcome)}
            </div>
            <div className="ddv-resolved-body">
              The arbitrator has issued a final decision. The on-chain
              transaction will reflect this outcome.
            </div>
          </div>
        )}

      {/* ── Footer ── */}
      {dispute.resolved_at && (
        <div className="ddv-footer">
          <span className="ddv-footer-ts">
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
    <div className="ddv-pill">
      <div className="ddv-pill-label">{label}</div>
      <div className="ddv-pill-value">{value}</div>
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
  const p = party.toLowerCase() as "a" | "b";
  return (
    <div className={`ddv-stmt-card ddv-stmt-card--${p}`}>
      <div className={`ddv-stmt-head ddv-stmt-head--${p}`}>
        <div className="ddv-stmt-party">
          <div className={`ddv-stmt-avatar ddv-stmt-avatar--${p}`}>{party}</div>
          <span className="ddv-stmt-name">{label}</span>
        </div>
        {submitted ? (
          <span className="ddv-stmt-badge--submitted">✓ Submitted</span>
        ) : (
          <span className="ddv-stmt-badge--pending">Pending</span>
        )}
      </div>
      <div className="ddv-stmt-body">
        {!submitted ? (
          <p className="ddv-stmt-waiting">
            Waiting for {label.split(" ")[0].toLowerCase()} to submit their
            statement…
          </p>
        ) : !visible ? (
          <div className="ddv-stmt-locked">
            <span>🔒</span>
            <span>Revealed once you submit your own statement.</span>
          </div>
        ) : (
          <>
            <p className="ddv-stmt-text">
              {statement || (
                <span style={{ fontStyle: "italic", color: "var(--text-4)" }}>
                  No statement provided.
                </span>
              )}
            </p>
            {evidence.length > 0 && (
              <div>
                <div className="ddv-evidence-label">
                  Evidence ({evidence.length})
                </div>
                <div className="ddv-evidence-list">
                  {evidence.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`ddv-evidence-item ddv-evidence-item--${p}`}
                    >
                      <span>📎</span>
                      <span className="ddv-evidence-filename">
                        [{party}-{i + 1}] {url.split("/").pop() ?? url}
                      </span>
                      <span>↗</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {submittedAt && (
              <div className="ddv-stmt-ts">
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
    <div className="ddv-verdict-card" style={{ border: `1px solid ${vc}35` }}>
      <div
        className="ddv-verdict-head"
        style={{ background: vc + "0c", borderColor: vc + "25" }}
      >
        <div className="ddv-verdict-head-left">
          <span style={{ fontSize: 14 }}>🤖</span>
          <span className="ddv-verdict-title">AI Arbitration Verdict</span>
        </div>
        <span className="ddv-verdict-model">
          {verdict.model ?? "AI"}
          {verdict.latency_ms
            ? ` · ${(verdict.latency_ms / 1000).toFixed(1)}s`
            : ""}
        </span>
      </div>
      <div className="ddv-verdict-body">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span
            className="ddv-verdict-pill"
            style={{ color: vc, background: vc + "12", borderColor: vc + "35" }}
          >
            {verdictLabel(verdict.verdict)}
          </span>
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
          <div className="ddv-confidence-row">
            <span className="ddv-confidence-label">Confidence</span>
            <div className="ddv-confidence-bar">
              <div
                className="ddv-confidence-fill"
                style={{
                  width: `${verdict.confidence}%`,
                  background:
                    verdict.confidence >= 70
                      ? "var(--green)"
                      : verdict.confidence >= 40
                        ? "var(--amber)"
                        : "var(--red)",
                }}
              />
            </div>
            <span className="ddv-confidence-pct">{verdict.confidence}%</span>
          </div>
        </div>
        <div>
          <div className="ddv-section-label">Reasoning</div>
          <p className="ddv-reasoning">{verdict.reasoning}</p>
        </div>
        {verdict.key_factors.length > 0 && (
          <div>
            <div className="ddv-section-label">Key Factors</div>
            <div className="ddv-factors">
              {verdict.key_factors.map((f, i) => (
                <div key={i} className="ddv-factor-row">
                  <span style={{ color: vc, flexShrink: 0 }}>→</span>
                  {f}
                </div>
              ))}
            </div>
          </div>
        )}
        {verdict.warnings.length > 0 && (
          <div>
            <div
              className="ddv-section-label"
              style={{ color: "var(--amber)" }}
            >
              ⚠ Warnings
            </div>
            <div className="ddv-factors">
              {verdict.warnings.map((w, i) => (
                <div key={i} className="ddv-warning-row">
                  <span>⚠</span>
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
    <div className="ddv-decision-card" style={{ border: `2px solid ${dc}45` }}>
      <div
        className="ddv-decision-head"
        style={{ background: dc + "0c", borderColor: dc + "28" }}
      >
        <div className="ddv-decision-head-left">
          <span style={{ fontSize: 14 }}>⚖️</span>
          <span className="ddv-decision-title">Final Arbitrator Decision</span>
        </div>
        <span
          className={
            decision.followed_ai
              ? "ddv-decision-badge--ai"
              : "ddv-decision-badge--ov"
          }
        >
          {decision.followed_ai ? "Confirmed AI" : "Overrode AI"}
        </span>
      </div>
      <div className="ddv-decision-body">
        <span
          className="ddv-decision-pill"
          style={{ color: dc, background: dc + "10", borderColor: dc + "35" }}
        >
          {verdictLabel(decision.outcome)}
        </span>
        {decision.override_reason && (
          <div>
            <div
              className="ddv-section-label"
              style={{ color: "var(--amber)" }}
            >
              Override Reason
            </div>
            <div className="ddv-override-box">{decision.override_reason}</div>
          </div>
        )}
        <div className="ddv-decision-meta">
          <div className="ddv-decision-meta-item">
            <div className="ddv-section-label">Arbitrator</div>
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
          <div className="ddv-decision-meta-item">
            <div className="ddv-section-label">Decided</div>
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
