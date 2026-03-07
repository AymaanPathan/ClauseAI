"use client";
// ============================================================
// ScreenAIVerdict.tsx
// Step 2 of Arbitration: AI Verdict Display + Arbitrator Override
//
// Shows:
//   - AI verdict card (verdict + confidence + reasoning + key factors)
//   - Evidence links (clickable for arbitrator review)
//   - Arbitrator: [✅ Confirm AI] [✗ Override → Release] [✗ Override → Refund]
//   - Wires confirm → resolve-to-receiver() or resolve-to-payer()
//   - Wires override → the opposite contract call
//
// Props:
//   agreementId       — e.g. "ABC123"
//   milestoneIndex    — which milestone
//   isArbitrator      — show override buttons only to arbitrator
//   arbitratorAddress — for the /resolve call
//   onResolved        — called after arbitrator makes final call
//                       receives { outcome, onChainAction }
// ============================================================

import { useState, useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Types mirroring the backend schema
interface AIVerdict {
  verdict: "release_to_receiver" | "refund_to_payer" | "split";
  confidence: number;
  reasoning: string;
  key_factors: string[];
  warnings: string[];
  split_percentage?: number;
  generated_at: string;
  model: string;
  latency_ms: number;
}

interface DisputeState {
  agreement_id: string;
  milestone_index: number;
  status: string;
  contract_terms: {
    payer: string;
    receiver: string;
    arbitrator: string;
    milestone_description: string;
    milestone_percentage: number;
    total_amount: number;
  };
  party_a_statement: string;
  party_a_evidence: string[];
  party_a_submitted_at?: string;
  party_b_statement: string;
  party_b_evidence: string[];
  party_b_submitted_at?: string;
  ai_verdict?: AIVerdict;
  arbitrator_decision?: {
    outcome: string;
    followed_ai: boolean;
    override_reason?: string;
    decided_at: string;
  };
}

interface Props {
  agreementId: string;
  milestoneIndex: number;
  isArbitrator: boolean;
  arbitratorAddress?: string;
  partyAName?: string;
  partyBName?: string;
  onResolved?: (result: { outcome: string; onChainAction: string }) => void;
}

export default function ScreenAIVerdict({
  agreementId,
  milestoneIndex,
  isArbitrator,
  arbitratorAddress,
  partyAName = "Payer",
  partyBName = "Receiver",
  onResolved,
}: Props) {
  const [dispute, setDispute] = useState<DisputeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverrideForm, setShowOverrideForm] = useState<
    "release" | "refund" | null
  >(null);
  const [resolved, setResolved] = useState(false);

  // ── Fetch dispute state ───────────────────────────────────
  useEffect(() => {
    fetchDispute();
  }, []);

  async function fetchDispute() {
    try {
      const res = await fetch(
        `${API_BASE}/api/arbitrate/${agreementId}/${milestoneIndex}`,
      );
      const data = await res.json();
      if (!data.success)
        throw new Error(data.error ?? "Failed to load dispute");
      setDispute(data.dispute);
      if (data.dispute?.arbitrator_decision) setResolved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dispute");
    } finally {
      setLoading(false);
    }
  }

  // ── Arbitrator resolution ─────────────────────────────────
  async function handleResolve(
    action: "confirm" | "override_release" | "override_refund",
  ) {
    if (!arbitratorAddress) {
      setError("Arbitrator wallet address required");
      return;
    }

    setResolving(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/arbitrate/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agreement_id: agreementId,
          milestone_index: milestoneIndex,
          arbitrator_address: arbitratorAddress,
          action,
          override_reason: overrideReason || undefined,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Resolution failed");

      setDispute(data.dispute);
      setResolved(true);
      setShowOverrideForm(null);

      onResolved?.({
        outcome: data.dispute.arbitrator_decision?.outcome,
        onChainAction: data.on_chain_action,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resolution failed");
    } finally {
      setResolving(false);
    }
  }

  // ── Render states ─────────────────────────────────────────

  if (loading) {
    return (
      <div style={styles.center}>
        <style>{css}</style>
        <Spinner size={32} />
        <p
          style={{
            color: "#64748b",
            marginTop: 16,
            fontFamily: "monospace",
            fontSize: 13,
          }}
        >
          Loading dispute...
        </p>
      </div>
    );
  }

  if (error && !dispute) {
    return (
      <div style={styles.center}>
        <style>{css}</style>
        <div style={{ fontSize: 32 }}>⚠️</div>
        <p style={{ color: "#fca5a5", marginTop: 12, fontSize: 14 }}>{error}</p>
        <button onClick={fetchDispute} style={styles.retryBtn}>
          Retry
        </button>
      </div>
    );
  }

  const verdict = dispute?.ai_verdict;
  const decision = dispute?.arbitrator_decision;

  if (!verdict) {
    return (
      <div style={styles.center}>
        <style>{css}</style>
        <Spinner size={32} color="#f5c400" />
        <p style={{ color: "#94a3b8", marginTop: 16, fontSize: 14 }}>
          AI is analyzing the dispute...
        </p>
        <p
          style={{
            color: "#475569",
            fontSize: 12,
            fontFamily: "monospace",
            marginTop: 8,
          }}
        >
          This usually takes 5–15 seconds
        </p>
      </div>
    );
  }

  const verdictColor =
    verdict.verdict === "release_to_receiver"
      ? "#22c55e"
      : verdict.verdict === "refund_to_payer"
        ? "#60a5fa"
        : "#f59e0b";
  const verdictIcon =
    verdict.verdict === "release_to_receiver"
      ? "→"
      : verdict.verdict === "refund_to_payer"
        ? "←"
        : "⇄";
  const verdictLabel =
    verdict.verdict === "release_to_receiver"
      ? `Release to ${partyBName}`
      : verdict.verdict === "refund_to_payer"
        ? `Refund to ${partyAName}`
        : `Split Payment`;
  const confidenceColor =
    verdict.confidence >= 80
      ? "#22c55e"
      : verdict.confidence >= 60
        ? "#f5c400"
        : "#f59e0b";

  const milestoneUSD = dispute?.contract_terms
    ? (
        (dispute.contract_terms.total_amount *
          dispute.contract_terms.milestone_percentage) /
        100
      ).toFixed(6)
    : "—";

  return (
    <div style={styles.root}>
      <style>{css}</style>

      {/* ── Section header ──────────────────────────────────── */}
      <div className="av-fade-in" style={styles.header}>
        <div
          style={{
            fontSize: 11,
            fontFamily: "monospace",
            color: "#f5c400",
            letterSpacing: "0.15em",
          }}
        >
          ⚖️ AI ARBITRATION VERDICT
        </div>
        <h2 style={styles.title}>
          {dispute?.contract_terms?.milestone_description ??
            `Milestone ${milestoneIndex + 1}`}
        </h2>
        <div
          style={{ fontSize: 13, color: "#64748b", fontFamily: "monospace" }}
        >
          Agreement #{agreementId} · {milestoneUSD} sBTC at stake
        </div>
      </div>

      {/* ── AI Verdict Card ──────────────────────────────────── */}
      <div
        className="av-fade-in"
        style={{
          ...styles.verdictCard,
          borderColor: `${verdictColor}40`,
          background: `linear-gradient(135deg, ${verdictColor}08 0%, #0f172a 100%)`,
        }}
      >
        {/* Top accent line */}
        <div
          style={{
            height: 3,
            background: verdictColor,
            margin: "-1px -1px 0",
            borderRadius: "12px 12px 0 0",
          }}
        />

        <div style={{ padding: "20px 24px" }}>
          {/* Verdict + Confidence */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: "#475569",
                  marginBottom: 8,
                }}
              >
                AI RECOMMENDATION
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    fontFamily: "monospace",
                    color: verdictColor,
                    letterSpacing: "-0.5px",
                  }}
                >
                  {verdictIcon}
                </span>
                <div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: verdictColor,
                    }}
                  >
                    {verdictLabel}
                  </div>
                  {verdict.verdict === "split" &&
                    verdict.split_percentage !== undefined && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#94a3b8",
                          fontFamily: "monospace",
                          marginTop: 2,
                        }}
                      >
                        {verdict.split_percentage}% to {partyBName},{" "}
                        {100 - verdict.split_percentage}% to {partyAName}
                      </div>
                    )}
                </div>
              </div>
            </div>

            {/* Confidence meter */}
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: "#475569",
                  marginBottom: 6,
                }}
              >
                CONFIDENCE
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  fontFamily: "monospace",
                  color: confidenceColor,
                }}
              >
                {verdict.confidence}%
              </div>
              <ConfidenceBar
                value={verdict.confidence}
                color={confidenceColor}
              />
            </div>
          </div>

          {/* Reasoning */}
          <div style={styles.reasoningBox}>
            <div
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                color: "#475569",
                marginBottom: 8,
              }}
            >
              AI REASONING
            </div>
            <p
              style={{
                fontSize: 14,
                color: "#e2e8f0",
                lineHeight: 1.75,
                margin: 0,
              }}
            >
              {verdict.reasoning}
            </p>
          </div>

          {/* Key factors */}
          {verdict.key_factors?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: "#475569",
                  marginBottom: 8,
                }}
              >
                KEY FACTORS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {verdict.key_factors.map((factor, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 8,
                      fontSize: 13,
                      color: "#94a3b8",
                      alignItems: "flex-start",
                    }}
                  >
                    <span
                      style={{
                        color: verdictColor,
                        flexShrink: 0,
                        fontWeight: 700,
                      }}
                    >
                      ·
                    </span>
                    <span>{factor}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {verdict.warnings?.filter((w) => w).length > 0 && (
            <div
              style={{
                marginTop: 14,
                background: "#f59e0b10",
                border: "1px solid #f59e0b30",
                borderRadius: 8,
                padding: "10px 14px",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: "#f59e0b",
                  marginBottom: 6,
                }}
              >
                ⚠️ AI WARNINGS
              </div>
              {verdict.warnings
                .filter((w) => w)
                .map((warning, i) => (
                  <div
                    key={i}
                    style={{ fontSize: 12, color: "#fcd34d", lineHeight: 1.5 }}
                  >
                    {warning}
                  </div>
                ))}
            </div>
          )}

          {/* Meta */}
          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 16,
              fontSize: 10,
              fontFamily: "monospace",
              color: "#334155",
            }}
          >
            <span>Model: {verdict.model}</span>
            <span>Latency: {verdict.latency_ms}ms</span>
            <span>
              Generated: {new Date(verdict.generated_at).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>

      {/* ── Evidence Submitted ───────────────────────────────── */}
      <div className="av-fade-in" style={styles.evidenceSection}>
        <div style={styles.sectionLabel}>SUBMITTED EVIDENCE</div>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <EvidencePanel
            label={`💸 ${partyAName} (Payer)`}
            color="#f5c400"
            statement={dispute?.party_a_statement}
            evidenceLinks={dispute?.party_a_evidence ?? []}
            submittedAt={dispute?.party_a_submitted_at}
          />
          <EvidencePanel
            label={`🎯 ${partyBName} (Receiver)`}
            color="#22c55e"
            statement={dispute?.party_b_statement}
            evidenceLinks={dispute?.party_b_evidence ?? []}
            submittedAt={dispute?.party_b_submitted_at}
          />
        </div>
      </div>

      {/* ── Arbitrator Actions ───────────────────────────────── */}
      {isArbitrator && !resolved && (
        <div className="av-fade-in" style={styles.arbitratorSection}>
          <div style={styles.sectionLabel}>⚖️ ARBITRATOR ACTION REQUIRED</div>
          <p
            style={{
              fontSize: 13,
              color: "#94a3b8",
              lineHeight: 1.7,
              marginBottom: 20,
            }}
          >
            Review the evidence above, then confirm the AI's recommendation or
            override it. Your decision triggers the on-chain fund release — this
            is final.
          </p>

          {error && <div style={styles.errorBox}>{error}</div>}

          {/* Override form */}
          {showOverrideForm && (
            <div style={styles.overrideForm}>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: "monospace",
                  color: "#f59e0b",
                  marginBottom: 10,
                }}
              >
                ⚠️ OVERRIDE REASON (optional but recommended)
              </div>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Explain why you are overriding the AI recommendation..."
                rows={3}
                style={styles.overrideTextarea}
              />
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Confirm AI */}
            {!showOverrideForm && (
              <button
                onClick={() => handleResolve("confirm")}
                disabled={resolving}
                style={{
                  ...styles.actionBtn,
                  background: "#22c55e20",
                  color: "#22c55e",
                  borderColor: "#22c55e40",
                }}
              >
                {resolving ? <Spinner size={14} color="#22c55e" /> : "✅"}
                <div>
                  <div style={{ fontWeight: 700 }}>
                    Confirm AI Recommendation
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>
                    Execute: {verdictLabel}
                  </div>
                </div>
              </button>
            )}

            {/* Override buttons */}
            {!showOverrideForm ? (
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setShowOverrideForm("release")}
                  style={{
                    ...styles.actionBtn,
                    flex: 1,
                    background: "#0f172a",
                    color: "#94a3b8",
                    borderColor: "#1f2937",
                  }}
                >
                  <span>✗</span>
                  <div>
                    <div style={{ fontWeight: 700 }}>Override → Release</div>
                    <div style={{ fontSize: 11, fontWeight: 400 }}>
                      Release to {partyBName}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setShowOverrideForm("refund")}
                  style={{
                    ...styles.actionBtn,
                    flex: 1,
                    background: "#0f172a",
                    color: "#94a3b8",
                    borderColor: "#1f2937",
                  }}
                >
                  <span>✗</span>
                  <div>
                    <div style={{ fontWeight: 700 }}>Override → Refund</div>
                    <div style={{ fontSize: 11, fontWeight: 400 }}>
                      Refund to {partyAName}
                    </div>
                  </div>
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => {
                    handleResolve(
                      showOverrideForm === "release"
                        ? "override_release"
                        : "override_refund",
                    );
                  }}
                  disabled={resolving}
                  style={{
                    ...styles.actionBtn,
                    flex: 1,
                    background: "#f59e0b20",
                    color: "#f59e0b",
                    borderColor: "#f59e0b40",
                  }}
                >
                  {resolving ? <Spinner size={14} color="#f59e0b" /> : "⚠️"}
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      Confirm Override →{" "}
                      {showOverrideForm === "release"
                        ? `Release to ${partyBName}`
                        : `Refund to ${partyAName}`}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 400 }}>
                      This will call the on-chain resolution function
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setShowOverrideForm(null);
                    setOverrideReason("");
                  }}
                  style={{ ...styles.cancelBtn }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Non-arbitrator view ──────────────────────────────── */}
      {!isArbitrator && !resolved && (
        <div className="av-fade-in" style={styles.waitingSection}>
          <PulseDot />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f5c400" }}>
              Awaiting arbitrator decision
            </div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
              The arbitrator is reviewing the AI verdict and evidence
            </div>
          </div>
        </div>
      )}

      {/* ── Resolved state ───────────────────────────────────── */}
      {resolved && decision && (
        <div
          className="av-fade-in"
          style={{
            ...styles.resolvedCard,
            borderColor:
              decision.outcome === "release_to_receiver"
                ? "#22c55e40"
                : "#60a5fa40",
            background:
              decision.outcome === "release_to_receiver"
                ? "#22c55e08"
                : "#60a5fa08",
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 10 }}>
            {decision.outcome === "release_to_receiver" ? "✅" : "↩️"}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
            {decision.outcome === "release_to_receiver"
              ? `Payment Released to ${partyBName}`
              : `Funds Refunded to ${partyAName}`}
          </div>
          <div
            style={{
              fontSize: 12,
              fontFamily: "monospace",
              color: "#64748b",
              marginTop: 4,
            }}
          >
            {decision.followed_ai
              ? "✅ Arbitrator confirmed AI recommendation"
              : `⚠️ Arbitrator overrode AI recommendation${decision.override_reason ? `: "${decision.override_reason}"` : ""}`}
          </div>
          <div
            style={{
              fontSize: 11,
              fontFamily: "monospace",
              color: "#334155",
              marginTop: 6,
            }}
          >
            Decided at {new Date(decision.decided_at).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function EvidencePanel({
  label,
  color,
  statement,
  evidenceLinks,
  submittedAt,
}: {
  label: string;
  color: string;
  statement?: string;
  evidenceLinks: string[];
  submittedAt?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const truncated = statement && statement.length > 120 && !expanded;

  return (
    <div
      style={{
        background: "#0f172a",
        border: `1px solid ${color}25`,
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontFamily: "monospace",
          color,
          marginBottom: 10,
          fontWeight: 700,
        }}
      >
        {label}
      </div>

      {statement ? (
        <div>
          <p
            style={{
              fontSize: 12,
              color: "#94a3b8",
              lineHeight: 1.6,
              margin: "0 0 8px",
            }}
          >
            {truncated ? statement.substring(0, 120) + "..." : statement}
          </p>
          {statement.length > 120 && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                fontSize: 11,
                color,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontFamily: "monospace",
              }}
            >
              {expanded ? "Show less ↑" : "Read more ↓"}
            </button>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: "#334155", fontStyle: "italic" }}>
          No statement submitted
        </p>
      )}

      {evidenceLinks.length > 0 && (
        <div
          style={{
            marginTop: 10,
            borderTop: "1px solid #1e293b",
            paddingTop: 10,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontFamily: "monospace",
              color: "#475569",
              marginBottom: 6,
            }}
          >
            EVIDENCE ({evidenceLinks.length} file
            {evidenceLinks.length > 1 ? "s" : ""})
          </div>
          {evidenceLinks.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                fontSize: 11,
                fontFamily: "monospace",
                color,
                marginBottom: 4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textDecoration: "none",
              }}
            >
              [{i + 1}] View File ↗
            </a>
          ))}
        </div>
      )}

      {submittedAt && (
        <div
          style={{
            marginTop: 8,
            fontSize: 10,
            fontFamily: "monospace",
            color: "#334155",
          }}
        >
          Submitted {new Date(submittedAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <div
      style={{
        width: 80,
        height: 4,
        background: "#1e293b",
        borderRadius: 2,
        marginTop: 6,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${value}%`,
          background: color,
          borderRadius: 2,
          transition: "width 0.8s ease",
        }}
      />
    </div>
  );
}

function Spinner({
  color = "#f5c400",
  size = 16,
}: {
  color?: string;
  size?: number;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        border: `2px solid ${color}40`,
        borderTopColor: color,
        borderRadius: "50%",
        display: "inline-block",
        animation: "av-spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

function PulseDot({ color = "#f5c400" }: { color?: string }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        animation: "av-pulse 1.4s ease-in-out infinite",
        flexShrink: 0,
      }}
    />
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    maxWidth: 720,
    width: "100%",
    margin: "0 auto",
    padding: "40px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
    color: "#f1f5f9",
    fontFamily: "system-ui, sans-serif",
  },
  center: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 300,
    gap: 8,
  },
  header: { display: "flex", flexDirection: "column", gap: 6 },
  title: { fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", margin: 0 },
  verdictCard: {
    border: "1px solid",
    borderRadius: 14,
    overflow: "hidden",
    position: "relative" as const,
  },
  reasoningBox: {
    background: "#0a0f1a",
    borderRadius: 8,
    padding: "14px 16px",
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: "monospace",
    color: "#475569",
    textTransform: "uppercase" as const,
    letterSpacing: "0.15em",
    marginBottom: 12,
  },
  evidenceSection: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: 12,
    padding: "18px 20px",
  },
  arbitratorSection: {
    background: "#111827",
    border: "1px solid #f5c40030",
    borderRadius: 12,
    padding: "20px 22px",
  },
  waitingSection: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "#0f172a",
    border: "1px solid #f5c40020",
    borderRadius: 10,
    padding: "14px 18px",
  },
  resolvedCard: {
    border: "1px solid",
    borderRadius: 12,
    padding: "24px",
    textAlign: "center" as const,
  },
  actionBtn: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 18px",
    border: "1px solid",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 14,
    transition: "all 0.2s",
    textAlign: "left" as const,
    width: "100%",
  },
  cancelBtn: {
    padding: "14px 18px",
    background: "transparent",
    color: "#64748b",
    border: "1px solid #1f2937",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap" as const,
  },
  overrideForm: {
    background: "#0f172a",
    border: "1px solid #f59e0b30",
    borderRadius: 8,
    padding: "14px 16px",
    marginBottom: 12,
  },
  overrideTextarea: {
    width: "100%",
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: 6,
    padding: "10px 12px",
    color: "#f1f5f9",
    fontSize: 13,
    lineHeight: 1.6,
    outline: "none",
    fontFamily: "system-ui, sans-serif",
    resize: "vertical" as const,
    boxSizing: "border-box" as const,
  },
  errorBox: {
    background: "#7f1d1d20",
    border: "1px solid #991b1b",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: "#fca5a5",
    marginBottom: 14,
  },
  retryBtn: {
    marginTop: 12,
    padding: "10px 24px",
    background: "#f5c400",
    color: "#0a0a0a",
    border: "none",
    borderRadius: 8,
    fontWeight: 700,
    cursor: "pointer",
  },
};

const css = `
@keyframes av-spin { to { transform: rotate(360deg); } }
@keyframes av-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
@keyframes av-fade-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.av-fade-in { animation: av-fade-in 0.35s ease both; }
.av-fade-in:nth-child(2) { animation-delay: 0.05s; }
.av-fade-in:nth-child(3) { animation-delay: 0.1s; }
.av-fade-in:nth-child(4) { animation-delay: 0.15s; }
`;
