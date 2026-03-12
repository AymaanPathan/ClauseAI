"use client";
// ============================================================
// components/screens/Shared/DisputeStatusPanel.tsx
//
// Drop this below any disputed milestone card on BOTH the
// Party A dashboard and the Party B dashboard.
//
// It:
//  1. Fetches the current dispute state on mount via REST
//  2. Joins the dispute Socket.io room and listens for
//     "dispute:updated" so every update is instant
//  3. Shows both parties' statements and evidence links
//  4. Shows AI verdict when available
// ============================================================

import { useEffect, useState } from "react";
import { getSocket, joinDisputeRoom, leaveDisputeRoom } from "@/lib/socket";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────
interface AIVerdict {
  verdict: "release_to_receiver" | "refund_to_payer" | "split";
  confidence: number;
  reasoning: string;
  key_factors: string[];
  warnings: string[];
  split_percentage?: number;
  generated_at: string;
}

interface DisputeState {
  status: string;
  party_a_statement?: string;
  party_a_evidence?: string[];
  party_a_submitted_at?: string;
  party_b_statement?: string;
  party_b_evidence?: string[];
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
  // "A" = payer dashboard, "B" = receiver dashboard, "arbitrator" = arbitrator portal
  viewAs: "A" | "B" | "arbitrator";
}

// ── Helpers ───────────────────────────────────────────────────
function verdictColor(v: string) {
  if (v === "release_to_receiver") return "#34d399";
  if (v === "refund_to_payer") return "#f87171";
  return "#fbbf24";
}
function verdictLabel(v: string) {
  if (v === "release_to_receiver") return "Release to Receiver ✓";
  if (v === "refund_to_payer") return "Refund to Payer ↩";
  return "Split Payment ⚖";
}
function statusLabel(s: string) {
  const map: Record<string, string> = {
    awaiting_statements: "Awaiting both statements",
    party_a_submitted: "Party A submitted — awaiting Party B",
    party_b_submitted: "Party B submitted — awaiting Party A",
    ai_pending: "AI arbitration running…",
    ai_complete: "AI verdict ready — awaiting arbitrator",
    resolved: "Resolved",
    auto_refunded: "Auto-refunded",
  };
  return map[s] ?? s;
}
function isImage(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
}
function fileName(url: string) {
  return decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? url).slice(
    0,
    40,
  );
}

// ── Component ─────────────────────────────────────────────────
export default function DisputeStatusPanel({
  agreementId,
  milestoneIndex,
  viewAs,
}: Props) {
  const [dispute, setDispute] = useState<DisputeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [flash, setFlash] = useState(false);

  // ── Fetch on mount ─────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `${API_BASE}/api/arbitrate/${agreementId}/${milestoneIndex}`,
        );
        if (res.ok) {
          const data = await res.json();
          setDispute(data.dispute);
        }
      } catch {
        /* silent */
      }
      setLoading(false);
    }
    load();
  }, [agreementId, milestoneIndex]);

  // ── Socket.io live updates ─────────────────────────────────
  useEffect(() => {
    joinDisputeRoom(agreementId, milestoneIndex);
    const socket = getSocket();

    function onDisputeUpdated(
      payload: DisputeState & { agreement_id: string; milestone_index: number },
    ) {
      // Guard: only handle updates for this exact dispute
      if (
        payload.agreement_id !== agreementId ||
        payload.milestone_index !== milestoneIndex
      )
        return;

      setDispute(payload);
      setLastUpdated(new Date());
      setFlash(true);
      setTimeout(() => setFlash(false), 2000);
    }

    socket.on("dispute:updated", onDisputeUpdated);

    return () => {
      socket.off("dispute:updated", onDisputeUpdated);
      leaveDisputeRoom(agreementId, milestoneIndex);
    };
  }, [agreementId, milestoneIndex]);

  // ── Render ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={panelStyle}>
        <style>{css}</style>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "16px 20px",
          }}
        >
          <span className="dp-spinner" />
          <span
            style={{
              fontSize: 12,
              color: "rgba(240,250,245,0.4)",
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
      <div style={panelStyle}>
        <style>{css}</style>
        <div
          style={{
            padding: "16px 20px",
            fontSize: 12,
            color: "rgba(240,250,245,0.3)",
            fontFamily: "var(--mono)",
          }}
        >
          No dispute record found yet.
        </div>
      </div>
    );
  }

  const aSubmitted = !!dispute.party_a_submitted_at;
  const bSubmitted = !!dispute.party_b_submitted_at;
  const hasVerdict = !!dispute.ai_verdict;
  const isResolved = dispute.status === "resolved";

  return (
    <div style={{ ...panelStyle, ...(flash ? flashStyle : {}) }}>
      <style>{css}</style>

      {/* ── Header ── */}
      <div className="dp-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="dp-tag">⚖ Dispute Status</span>
          {flash && <span className="dp-live-badge">● just updated</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="dp-status-label">{statusLabel(dispute.status)}</span>
          {lastUpdated && (
            <span
              style={{
                fontSize: 9,
                fontFamily: "var(--mono)",
                color: "rgba(240,250,245,0.2)",
              }}
            >
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* ── Statements grid ── */}
      <div className="dp-grid">
        {/* Party A */}
        <StatementCard
          label="Party A · Payer"
          color="#60a5fa"
          submitted={aSubmitted}
          submittedAt={dispute.party_a_submitted_at}
          statement={dispute.party_a_statement}
          evidence={dispute.party_a_evidence}
          isOwn={viewAs === "A"}
          waitingLabel="Waiting for Payer to submit…"
        />

        {/* Party B */}
        <StatementCard
          label="Party B · Receiver"
          color="#f472b6"
          submitted={bSubmitted}
          submittedAt={dispute.party_b_submitted_at}
          statement={dispute.party_b_statement}
          evidence={dispute.party_b_evidence}
          isOwn={viewAs === "B"}
          waitingLabel="Waiting for Receiver to submit…"
        />
      </div>

      {/* ── AI Verdict ── */}
      {hasVerdict && dispute.ai_verdict && (
        <div
          className="dp-verdict-box"
          style={{
            borderColor: verdictColor(dispute.ai_verdict.verdict) + "40",
          }}
        >
          <div className="dp-verdict-header">
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                color: "rgba(240,250,245,0.35)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              AI Arbitration Verdict
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                className="dp-verdict-badge"
                style={{
                  background: verdictColor(dispute.ai_verdict.verdict) + "15",
                  color: verdictColor(dispute.ai_verdict.verdict),
                  borderColor: verdictColor(dispute.ai_verdict.verdict) + "40",
                }}
              >
                {verdictLabel(dispute.ai_verdict.verdict)}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: "rgba(240,250,245,0.3)",
                }}
              >
                {dispute.ai_verdict.confidence}% confidence
              </span>
            </div>
          </div>

          {dispute.ai_verdict.split_percentage !== undefined && (
            <div
              style={{
                fontSize: 12,
                color: "#fbbf24",
                fontFamily: "var(--mono)",
                marginBottom: 8,
              }}
            >
              Split: Receiver gets {dispute.ai_verdict.split_percentage}% ·
              Payer gets {100 - dispute.ai_verdict.split_percentage}%
            </div>
          )}

          <p
            style={{
              fontSize: 13,
              color: "rgba(240,250,245,0.65)",
              lineHeight: 1.65,
              margin: "8px 0",
            }}
          >
            {dispute.ai_verdict.reasoning}
          </p>

          {dispute.ai_verdict.key_factors.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  fontSize: 9,
                  fontFamily: "var(--mono)",
                  color: "rgba(240,250,245,0.3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                }}
              >
                Key Factors
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {dispute.ai_verdict.key_factors.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 8,
                      fontSize: 12,
                      color: "rgba(240,250,245,0.5)",
                    }}
                  >
                    <span
                      style={{
                        color: verdictColor(dispute.ai_verdict!.verdict),
                        flexShrink: 0,
                      }}
                    >
                      →
                    </span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dispute.ai_verdict.warnings.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {dispute.ai_verdict.warnings.map((w, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 11,
                    color: "#fbbf24",
                    fontFamily: "var(--mono)",
                    background: "rgba(251,191,36,0.06)",
                    border: "1px solid rgba(251,191,36,0.15)",
                    borderRadius: 6,
                    padding: "5px 10px",
                    marginTop: 4,
                  }}
                >
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}

          {viewAs !== "arbitrator" && (
            <div
              style={{
                marginTop: 12,
                fontSize: 11,
                color: "rgba(240,250,245,0.3)",
                fontFamily: "var(--mono)",
              }}
            >
              The designated arbitrator will review this verdict and issue the
              final decision.
            </div>
          )}
        </div>
      )}

      {/* ── Resolution banner ── */}
      {isResolved && dispute.arbitrator_decision && (
        <div className="dp-resolved-banner">
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: verdictColor(dispute.arbitrator_decision.outcome),
              marginBottom: 4,
            }}
          >
            ✓ Resolved: {verdictLabel(dispute.arbitrator_decision.outcome)}
          </div>
          {!dispute.arbitrator_decision.followed_ai &&
            dispute.arbitrator_decision.override_reason && (
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(240,250,245,0.45)",
                  fontFamily: "var(--mono)",
                }}
              >
                Arbitrator override: "
                {dispute.arbitrator_decision.override_reason}"
              </div>
            )}
          <div
            style={{
              fontSize: 10,
              color: "rgba(240,250,245,0.25)",
              fontFamily: "var(--mono)",
              marginTop: 4,
            }}
          >
            {new Date(dispute.arbitrator_decision.decided_at).toLocaleString()}
            {dispute.arbitrator_decision.followed_ai
              ? " · Confirmed AI recommendation"
              : " · Overrode AI recommendation"}
          </div>
        </div>
      )}
    </div>
  );
}

// ── StatementCard sub-component ───────────────────────────────
function StatementCard({
  label,
  color,
  submitted,
  submittedAt,
  statement,
  evidence,
  isOwn,
  waitingLabel,
}: {
  label: string;
  color: string;
  submitted: boolean;
  submittedAt?: string;
  statement?: string;
  evidence?: string[];
  isOwn: boolean;
  waitingLabel: string;
}) {
  if (!submitted) {
    return (
      <div
        className="dp-statement-card dp-statement-card--waiting"
        style={{ borderColor: color + "20" }}
      >
        <div className="dp-party-label" style={{ color }}>
          {label} {isOwn ? "(You)" : ""}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 8,
          }}
        >
          <span
            className="dp-spinner"
            style={{ borderTopColor: color, borderColor: color + "30" }}
          />
          <span
            style={{
              fontSize: 11,
              color: "rgba(240,250,245,0.3)",
              fontFamily: "var(--mono)",
            }}
          >
            {waitingLabel}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="dp-statement-card"
      style={{ borderColor: color + "30", background: color + "06" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div className="dp-party-label" style={{ color }}>
          {label} {isOwn ? "(You)" : ""}
        </div>
        <span
          style={{
            fontSize: 9,
            fontFamily: "var(--mono)",
            color: "rgba(240,250,245,0.25)",
          }}
        >
          {submittedAt ? new Date(submittedAt).toLocaleString() : ""}
        </span>
      </div>

      {statement && (
        <p
          style={{
            fontSize: 12,
            color: "rgba(240,250,245,0.7)",
            lineHeight: 1.65,
            margin: 0,
          }}
        >
          {statement}
        </p>
      )}

      {evidence && evidence.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              fontSize: 9,
              fontFamily: "var(--mono)",
              color: "rgba(240,250,245,0.3)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 6,
            }}
          >
            Evidence ({evidence.length} file{evidence.length !== 1 ? "s" : ""})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {evidence.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="dp-evidence-chip"
                style={{ borderColor: color + "30", color }}
              >
                <span>{isImage(url) ? "🖼" : "📄"}</span>
                <span className="dp-evidence-name">{fileName(url)}</span>
                <span style={{ opacity: 0.5 }}>↗</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {(!evidence || evidence.length === 0) && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "rgba(240,250,245,0.2)",
            fontFamily: "var(--mono)",
          }}
        >
          No evidence files attached
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: "rgba(12,18,14,0.9)",
  border: "1px solid rgba(245,158,11,0.2)",
  borderTop: "none",
  borderRadius: "0 0 12px 12px",
  overflow: "hidden",
  transition: "box-shadow 0.3s",
};

const flashStyle: React.CSSProperties = {
  boxShadow: "0 0 0 2px rgba(245,158,11,0.3)",
};

const css = `
.dp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid rgba(240,250,245,0.06);
  flex-wrap: wrap; gap: 8px;
}
.dp-tag {
  font-size: 10px; font-family: var(--mono, monospace);
  color: var(--amber, #f59e0b); background: rgba(245,158,11,0.08);
  border: 1px solid rgba(245,158,11,0.2); border-radius: 6px;
  padding: 3px 10px; font-weight: 600; letter-spacing: 0.04em;
}
.dp-live-badge {
  font-size: 9px; font-family: var(--mono, monospace);
  color: #34d399; background: rgba(52,211,153,0.08);
  border: 1px solid rgba(52,211,153,0.2); border-radius: 10px;
  padding: 2px 8px; animation: dp-pulse 1.5s ease infinite;
}
@keyframes dp-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
.dp-status-label {
  font-size: 10px; font-family: var(--mono, monospace);
  color: rgba(240,250,245,0.4);
}
.dp-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  padding: 14px 18px;
}
@media (max-width: 600px) { .dp-grid { grid-template-columns: 1fr; } }
.dp-statement-card {
  border: 1px solid rgba(240,250,245,0.08);
  border-radius: 10px; padding: 14px;
}
.dp-statement-card--waiting {
  background: rgba(240,250,245,0.02);
}
.dp-party-label {
  font-size: 10px; font-family: var(--mono, monospace);
  font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
}
.dp-evidence-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 10px; font-family: var(--mono, monospace);
  border: 1px solid; border-radius: 6px; padding: 4px 9px;
  text-decoration: none; background: rgba(240,250,245,0.02);
  transition: background 0.15s;
  max-width: 180px;
}
.dp-evidence-chip:hover { background: rgba(240,250,245,0.05); }
.dp-evidence-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 120px;
}
.dp-verdict-box {
  margin: 0 18px 14px;
  border: 1px solid rgba(52,211,153,0.2);
  border-radius: 12px; padding: 16px;
  background: rgba(12,18,14,0.6);
}
.dp-verdict-header {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 8px; margin-bottom: 10px;
}
.dp-verdict-badge {
  font-size: 11px; font-family: var(--mono, monospace); font-weight: 700;
  border: 1px solid; border-radius: 8px; padding: 4px 12px;
}
.dp-resolved-banner {
  margin: 0 18px 16px;
  border: 1px solid rgba(52,211,153,0.2); border-radius: 10px;
  padding: 14px 16px; background: rgba(52,211,153,0.05);
}
.dp-spinner {
  display: inline-block; width: 12px; height: 12px;
  border: 2px solid rgba(245,158,11,0.2); border-top-color: #f59e0b;
  border-radius: 50%; animation: spin 0.7s linear infinite; flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }
`;
