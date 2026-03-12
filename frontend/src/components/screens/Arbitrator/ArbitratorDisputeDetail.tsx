"use client";
import {
  getSocket,
  joinDisputeRoom,
  DisputeUpdatedPayload,
  leaveDisputeRoom,
} from "@/lib/socket";
import { updateActiveDispute } from "@/store/slices/arbitratorSlice";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/store";
import {
  resolveDisputeThunk,
  setScreen,
  AIVerdict,
} from "@/store/slices/arbitratorSlice";

// ── Helpers ───────────────────────────────────────────────────

function timeAgo(d: string): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url);
}

function isPdfUrl(url: string): boolean {
  return /\.pdf(\?.*)?$/i.test(url);
}

function fileName(url: string): string {
  return url.split("/").pop()?.split("?")[0] ?? url;
}

// ── Evidence Viewer ───────────────────────────────────────────

function EvidenceList({ urls, party }: { urls: string[]; party: "A" | "B" }) {
  if (!urls.length) {
    return (
      <div className="evidence-empty">
        No evidence submitted by Party {party}
      </div>
    );
  }
  return (
    <div className="evidence-grid">
      {urls.map((url, i) => (
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="evidence-item"
        >
          {isImageUrl(url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={`evidence-${i}`} className="evidence-thumb" />
          ) : isPdfUrl(url) ? (
            <div className="evidence-file evidence-file--pdf">
              <span className="file-icon">📄</span>
              <span className="file-name">{fileName(url)}</span>
            </div>
          ) : (
            <div className="evidence-file">
              <span className="file-icon">📎</span>
              <span className="file-name">{fileName(url)}</span>
            </div>
          )}
          <div className="evidence-overlay">
            <span>↗ Open</span>
          </div>
        </a>
      ))}
    </div>
  );
}

// ── AI Verdict Panel ──────────────────────────────────────────

function AIVerdictPanel({ verdict }: { verdict: AIVerdict }) {
  const isRelease = verdict.verdict === "release_to_receiver";
  const isRefund = verdict.verdict === "refund_to_payer";
  const isSplit = verdict.verdict === "split";

  const verdictColor = isRelease ? "#34d399" : isRefund ? "#f87171" : "#f59e0b";
  const verdictLabel = isRelease
    ? "Release to Receiver (Party B)"
    : isRefund
      ? "Refund to Payer (Party A)"
      : `Split — ${verdict.split_percentage ?? 50}% to Receiver`;

  return (
    <div className="ai-panel">
      <div className="ai-header">
        <div className="ai-badge">
          <span>🤖</span> AI Verdict
        </div>
        <div className="ai-meta">
          {verdict.model} · {verdict.latency_ms}ms
        </div>
      </div>

      {/* Verdict */}
      <div
        className="ai-verdict-block"
        style={{
          borderColor: verdictColor + "30",
          background: verdictColor + "08",
        }}
      >
        <div className="av-label" style={{ color: verdictColor }}>
          Recommendation
        </div>
        <div className="av-value" style={{ color: verdictColor }}>
          {verdictLabel}
        </div>

        {/* Confidence bar */}
        <div className="confidence-row">
          <span className="conf-label">Confidence</span>
          <div className="conf-bar">
            <div
              className="conf-fill"
              style={{
                width: `${verdict.confidence}%`,
                background: verdictColor,
              }}
            />
          </div>
          <span className="conf-pct" style={{ color: verdictColor }}>
            {verdict.confidence}%
          </span>
        </div>
      </div>

      {/* Reasoning */}
      <div className="ai-section">
        <div className="ai-section-label">Reasoning</div>
        <p className="ai-reasoning">{verdict.reasoning}</p>
      </div>

      {/* Key Factors */}
      {verdict.key_factors.length > 0 && (
        <div className="ai-section">
          <div className="ai-section-label">Key Factors</div>
          <div className="factor-list">
            {verdict.key_factors.map((f, i) => (
              <div key={i} className="factor-chip">
                <span className="factor-num">{i + 1}</span>
                {f}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {verdict.warnings.length > 0 && (
        <div className="ai-section">
          <div className="ai-section-label" style={{ color: "#f59e0b" }}>
            ⚠ Warnings
          </div>
          <div className="warning-list">
            {verdict.warnings.map((w, i) => (
              <div key={i} className="warning-item">
                {w}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Decision Panel ────────────────────────────────────────────

function DecisionPanel({
  agreementId,
  milestoneIndex,
  walletAddress,
  aiVerdict,
}: {
  agreementId: string;
  milestoneIndex: number;
  walletAddress: string;
  aiVerdict?: AIVerdict;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const { decidingVerdict, verdictError, activeDispute } = useSelector(
    (s: RootState) => s.arbitrator,
  );

  const [selected, setSelected] = useState<
    "confirm" | "override_release" | "override_refund" | null
  >(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  if (activeDispute?.status === "resolved") {
    const dec = activeDispute.arbitrator_decision!;
    const isRelease = dec.outcome === "release_to_receiver";
    return (
      <div className="decision-resolved">
        <div className="resolved-icon">✓</div>
        <div className="resolved-title">Dispute Resolved</div>
        <div
          className="resolved-outcome"
          style={{ color: isRelease ? "#34d399" : "#f87171" }}
        >
          {isRelease
            ? "Released to Receiver (Party B)"
            : "Refunded to Payer (Party A)"}
        </div>
        {!dec.followed_ai && dec.override_reason && (
          <div className="resolved-reason">
            <span className="override-tag">Override</span>
            {dec.override_reason}
          </div>
        )}
        {dec.followed_ai && (
          <div className="resolved-ai-badge">Followed AI recommendation</div>
        )}
        <div className="resolved-time">{timeAgo(dec.decided_at)}</div>
      </div>
    );
  }

  if (!aiVerdict) {
    return (
      <div className="decision-waiting">
        <div className="waiting-icon">⏳</div>
        <p>
          Waiting for both parties to submit statements before AI can analyze
          the case.
        </p>
      </div>
    );
  }

  const options = [
    {
      id: "confirm" as const,
      label: "Confirm AI Verdict",
      desc:
        aiVerdict.verdict === "release_to_receiver"
          ? "Release funds to Receiver (Party B)"
          : aiVerdict.verdict === "refund_to_payer"
            ? "Refund to Payer (Party A)"
            : `Split: ${aiVerdict.split_percentage ?? 50}% to Receiver`,
      color: "#34d399",
      icon: "✓",
    },
    {
      id: "override_release" as const,
      label: "Override → Release to Receiver",
      desc: "Funds go to Party B regardless of AI recommendation",
      color: "#60a5fa",
      icon: "→",
    },
    {
      id: "override_refund" as const,
      label: "Override → Refund to Payer",
      desc: "Funds returned to Party A regardless of AI recommendation",
      color: "#f87171",
      icon: "←",
    },
  ];

  const isOverride = selected !== null && selected !== "confirm";

  function handleSubmit() {
    if (!selected) return;
    if (isOverride && !overrideReason.trim()) return;
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    dispatch(
      resolveDisputeThunk({
        agreement_id: agreementId,
        milestone_index: milestoneIndex,
        arbitrator_address: walletAddress,
        action: selected,
        override_reason: overrideReason || undefined,
      }),
    );
  }

  return (
    <div className="decision-panel">
      <div className="dp-title">
        <span className="dp-icon">⚖</span>
        Your Decision
      </div>
      <p className="dp-desc">
        Review the AI verdict and evidence above, then select your ruling. This
        action is final and will trigger the on-chain resolution.
      </p>

      <div className="dp-options">
        {options.map((opt) => (
          <button
            key={opt.id}
            className={`dp-option ${selected === opt.id ? "dp-option--selected" : ""}`}
            style={
              selected === opt.id
                ? {
                    borderColor: opt.color + "60",
                    background: opt.color + "0a",
                  }
                : {}
            }
            onClick={() => {
              setSelected(opt.id);
              setConfirmed(false);
            }}
          >
            <div
              className="dp-option-icon"
              style={{
                color: opt.color,
                borderColor: opt.color + "30",
                background: opt.color + "10",
              }}
            >
              {opt.icon}
            </div>
            <div className="dp-option-text">
              <div
                className="dp-option-label"
                style={selected === opt.id ? { color: opt.color } : {}}
              >
                {opt.label}
              </div>
              <div className="dp-option-desc">{opt.desc}</div>
            </div>
            {selected === opt.id && (
              <div className="dp-check" style={{ color: opt.color }}>
                ✓
              </div>
            )}
          </button>
        ))}
      </div>

      {isOverride && (
        <div className="dp-reason-wrap fade-in">
          <label className="dp-reason-label">Override Reason (required)</label>
          <textarea
            className="dp-reason-input"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Explain why you are overriding the AI verdict…"
            rows={3}
          />
        </div>
      )}

      {verdictError && (
        <div className="error-box fade-in" style={{ marginBottom: 12 }}>
          ⚠ {verdictError}
        </div>
      )}

      {selected && (
        <button
          className={`dp-submit ${confirmed ? "dp-submit--confirm" : ""}`}
          onClick={handleSubmit}
          disabled={decidingVerdict || (isOverride && !overrideReason.trim())}
        >
          {decidingVerdict ? (
            <>
              <span className="spinner sm white" /> Processing…
            </>
          ) : confirmed ? (
            "⚠ Confirm Final Decision — This Cannot Be Undone"
          ) : (
            "Review Decision →"
          )}
        </button>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────

export default function ArbitratorDisputeDetail() {
  const dispatch = useDispatch<AppDispatch>();
  const {
    activeDispute,
    activeDisputeLoading,
    activeDisputeError,
    walletAddress,
  } = useSelector((s: RootState) => s.arbitrator);

  useEffect(() => {
    if (!activeDispute?.agreement_id) return;

    // Join the agreement room so this arbitrator receives dispute:updated events
    joinDisputeRoom(activeDispute.agreement_id, activeDispute.milestone_index);

    const socket = getSocket();

    function onDisputeUpdated(dispute: DisputeUpdatedPayload) {
      // Only apply if it's for the dispute we're currently viewing
      if (
        dispute.agreement_id === activeDispute?.agreement_id &&
        dispute.milestone_index === activeDispute?.milestone_index
      ) {
        dispatch(updateActiveDispute(dispute as any));
      }
    }

    socket.on("dispute:updated", onDisputeUpdated);
    return () => {
      socket.off("dispute:updated", onDisputeUpdated);
    };
  }, [activeDispute?.agreement_id, activeDispute?.milestone_index, dispatch]);

  useEffect(() => {
    if (!activeDispute?.agreement_id) return;

    joinDisputeRoom(activeDispute.agreement_id, activeDispute.milestone_index); // ← fixed

    const socket = getSocket();

    function onDisputeUpdated(dispute: DisputeUpdatedPayload) {
      if (
        dispute.agreement_id === activeDispute?.agreement_id &&
        dispute.milestone_index === activeDispute?.milestone_index
      ) {
        dispatch(updateActiveDispute(dispute as any));
      }
    }

    socket.on("dispute:updated", onDisputeUpdated);

    return () => {
      socket.off("dispute:updated", onDisputeUpdated);
      leaveDisputeRoom(
        activeDispute.agreement_id,
        activeDispute.milestone_index,
      ); // ← add this
    };
  }, [activeDispute?.agreement_id, activeDispute?.milestone_index, dispatch]);

  if (activeDisputeLoading) {
    return (
      <div className="detail-root">
        <style>{css}</style>
        <div className="loading-state">
          <span className="spinner lg" />
          <span>Loading dispute…</span>
        </div>
      </div>
    );
  }

  if (activeDisputeError || !activeDispute) {
    return (
      <div className="detail-root">
        <style>{css}</style>
        <div
          className="error-box"
          style={{ maxWidth: 500, margin: "80px auto" }}
        >
          ⚠ {activeDisputeError ?? "Dispute not found"}
        </div>
      </div>
    );
  }

  const d = activeDispute;
  const ct = d.contract_terms;

  return (
    <div className="detail-root">
      <style>{css}</style>

      {/* Topbar */}
      <nav className="detail-nav">
        <button
          className="back-btn"
          onClick={() => dispatch(setScreen("dashboard"))}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Cases
        </button>
        <div className="nav-brand">
          <span className="nav-logo">Clause</span>
          <span className="nav-logo-thin">Ai</span>
          <span className="nav-sep">·</span>
          <span className="nav-case">
            Case {d.agreement_id} · MS #{d.milestone_index}
          </span>
        </div>
        <div
          className="nav-status"
          style={{
            color:
              d.status === "resolved"
                ? "#34d399"
                : d.status === "ai_complete"
                  ? "#f59e0b"
                  : "#94a3b8",
          }}
        >
          {d.status === "resolved"
            ? "Resolved ✓"
            : d.status === "ai_complete"
              ? "⚠ Needs Decision"
              : d.status.replace(/_/g, " ")}
        </div>
      </nav>

      <div className="detail-body">
        {/* Contract Terms */}
        <div className="card fade-up" style={{ marginBottom: 20 }}>
          <div className="card-title">Contract Terms</div>
          <div className="terms-grid">
            <div className="term-item">
              <div className="term-label">Agreement</div>
              <div className="term-value">{d.agreement_id}</div>
            </div>
            <div className="term-item">
              <div className="term-label">Type</div>
              <div className="term-value">
                {ct.agreement_type ?? "freelance"}
              </div>
            </div>
            <div className="term-item">
              <div className="term-label">Total Value</div>
              <div className="term-value accent">{ct.total_amount} sBTC</div>
            </div>
            <div className="term-item">
              <div className="term-label">This Milestone</div>
              <div className="term-value accent">
                {((ct.total_amount * ct.milestone_percentage) / 100).toFixed(6)}{" "}
                sBTC ({ct.milestone_percentage}%)
              </div>
            </div>
            <div className="term-item">
              <div className="term-label">Payer (Party A)</div>
              <div className="term-value mono blue">{ct.payer}</div>
            </div>
            <div className="term-item">
              <div className="term-label">Receiver (Party B)</div>
              <div className="term-value mono pink">{ct.receiver}</div>
            </div>
            {ct.milestone_deadline && (
              <div className="term-item">
                <div className="term-label">Deadline</div>
                <div className="term-value">{ct.milestone_deadline}</div>
              </div>
            )}
            <div className="term-item" style={{ gridColumn: "1 / -1" }}>
              <div className="term-label">Milestone Description</div>
              <div className="term-value">{ct.milestone_description}</div>
            </div>
          </div>
        </div>

        {/* Two-column: statements */}
        <div className="two-col fade-up d1">
          {/* Party A */}
          <div className="card party-card party-card--a">
            <div className="party-header">
              <div className="party-badge party-badge--a">Party A · Payer</div>
              {d.party_a_submitted_at ? (
                <span className="submitted-tag">
                  Submitted {timeAgo(d.party_a_submitted_at)}
                </span>
              ) : (
                <span className="pending-tag">Not submitted</span>
              )}
            </div>
            <div className="wallet-line blue">
              {ct.payer.slice(0, 14)}…{ct.payer.slice(-8)}
            </div>

            {d.party_a_statement ? (
              <div className="statement-box">
                <div className="statement-label">Statement</div>
                <p className="statement-text">{d.party_a_statement}</p>
              </div>
            ) : (
              <div className="no-statement">No statement submitted yet</div>
            )}

            <div className="evidence-section">
              <div className="evidence-label">
                Evidence · {d.party_a_evidence.length} file
                {d.party_a_evidence.length !== 1 ? "s" : ""}
              </div>
              <EvidenceList urls={d.party_a_evidence} party="A" />
            </div>
          </div>

          {/* Party B */}
          <div className="card party-card party-card--b">
            <div className="party-header">
              <div className="party-badge party-badge--b">
                Party B · Receiver
              </div>
              {d.party_b_submitted_at ? (
                <span className="submitted-tag">
                  Submitted {timeAgo(d.party_b_submitted_at)}
                </span>
              ) : (
                <span className="pending-tag">Not submitted</span>
              )}
            </div>
            <div className="wallet-line pink">
              {ct.receiver.slice(0, 14)}…{ct.receiver.slice(-8)}
            </div>

            {d.party_b_statement ? (
              <div className="statement-box">
                <div className="statement-label">Statement</div>
                <p className="statement-text">{d.party_b_statement}</p>
              </div>
            ) : (
              <div className="no-statement">No statement submitted yet</div>
            )}

            <div className="evidence-section">
              <div className="evidence-label">
                Evidence · {d.party_b_evidence.length} file
                {d.party_b_evidence.length !== 1 ? "s" : ""}
              </div>
              <EvidenceList urls={d.party_b_evidence} party="B" />
            </div>
          </div>
        </div>

        {/* AI Verdict */}
        <div className="fade-up d2" style={{ marginTop: 20 }}>
          {d.ai_verdict ? (
            <AIVerdictPanel verdict={d.ai_verdict} />
          ) : (
            <div className="card ai-pending-card">
              <div className="ai-badge">🤖 AI Verdict</div>
              <div className="ai-pending-msg">
                {d.party_a_submitted_at && d.party_b_submitted_at
                  ? "AI is analyzing the case… refresh in a moment."
                  : "AI will analyze the case once both parties have submitted their statements."}
              </div>
            </div>
          )}
        </div>

        {/* Decision Panel */}
        <div className="fade-up d3" style={{ marginTop: 20 }}>
          <DecisionPanel
            agreementId={d.agreement_id}
            milestoneIndex={d.milestone_index}
            walletAddress={walletAddress!}
            aiVerdict={d.ai_verdict}
          />
        </div>
      </div>
    </div>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .detail-root {
    min-height: 100vh;
    background: #080c0a;
    font-family: 'DM Sans', sans-serif;
    color: #f0faf5;
  }

  /* Nav */
  .detail-nav {
    position: sticky; top: 0; z-index: 100;
    height: 54px;
    background: rgba(8,12,10,0.92); backdrop-filter: blur(20px);
    border-bottom: 1px solid rgba(52,211,153,0.1);
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 28px; gap: 16px;
  }
  .back-btn {
    display: flex; align-items: center; gap: 6px;
    background: none; border: none; cursor: pointer;
    font-family: 'DM Sans', sans-serif; font-size: 12px; color: rgba(240,250,245,0.5);
    transition: color 0.2s; padding: 0;
  }
  .back-btn:hover { color: #34d399; }
  .nav-brand { display: flex; align-items: center; gap: 5px; flex: 1; justify-content: center; }
  .nav-logo { font-size: 14px; font-weight: 700; color: #f0faf5; letter-spacing: -0.03em; }
  .nav-logo-thin { font-size: 14px; font-weight: 300; color: rgba(240,250,245,0.4); letter-spacing: -0.03em; }
  .nav-sep { color: rgba(52,211,153,0.3); }
  .nav-case { font-size: 11px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.4); }
  .nav-status { font-size: 11px; font-family: 'DM Mono', monospace; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }

  /* Body */
  .detail-body { max-width: 1000px; margin: 0 auto; padding: 36px 24px 80px; }

  /* Card */
  .card {
    background: rgba(12,18,14,0.8);
    border: 1px solid rgba(52,211,153,0.1);
    border-radius: 16px; padding: 24px;
  }
  .card-title {
    font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.35);
    text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 18px;
  }

  /* Terms grid */
  .terms-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 640px) { .terms-grid { grid-template-columns: 1fr; } }
  .term-item {}
  .term-label { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.3); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
  .term-value { font-size: 13px; color: #f0faf5; font-weight: 500; }
  .term-value.accent { color: #34d399; font-family: 'DM Mono', monospace; font-weight: 600; }
  .term-value.mono { font-family: 'DM Mono', monospace; font-size: 11px; }
  .term-value.blue { color: #60a5fa; }
  .term-value.pink { color: #f472b6; }

  /* Two col */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 760px) { .two-col { grid-template-columns: 1fr; } }

  /* Party cards */
  .party-card { display: flex; flex-direction: column; gap: 16px; }
  .party-card--a { border-color: rgba(96,165,250,0.2); }
  .party-card--b { border-color: rgba(244,114,182,0.2); }

  .party-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  .party-badge {
    font-size: 10px; font-family: 'DM Mono', monospace; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.08em;
    padding: 4px 10px; border-radius: 8px; border: 1px solid;
  }
  .party-badge--a { color: #60a5fa; border-color: rgba(96,165,250,0.3); background: rgba(96,165,250,0.08); }
  .party-badge--b { color: #f472b6; border-color: rgba(244,114,182,0.3); background: rgba(244,114,182,0.08); }
  .submitted-tag { font-size: 10px; font-family: 'DM Mono', monospace; color: #34d399; }
  .pending-tag { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.3); }
  .wallet-line { font-size: 11px; font-family: 'DM Mono', monospace; }
  .wallet-line.blue { color: rgba(96,165,250,0.6); }
  .wallet-line.pink { color: rgba(244,114,182,0.6); }

  .statement-box { background: rgba(240,250,245,0.03); border-radius: 10px; padding: 14px; }
  .statement-label { font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.3); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
  .statement-text { font-size: 13px; line-height: 1.75; color: rgba(240,250,245,0.75); }
  .no-statement { font-size: 12px; color: rgba(240,250,245,0.25); font-style: italic; padding: 8px 0; }

  /* Evidence */
  .evidence-section {}
  .evidence-label { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.3); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; }
  .evidence-empty { font-size: 12px; color: rgba(240,250,245,0.25); font-style: italic; }
  .evidence-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .evidence-item {
    position: relative; overflow: hidden;
    border: 1px solid rgba(240,250,245,0.1); border-radius: 10px;
    text-decoration: none; cursor: pointer; transition: border-color 0.2s;
  }
  .evidence-item:hover { border-color: rgba(240,250,245,0.3); }
  .evidence-item:hover .evidence-overlay { opacity: 1; }
  .evidence-thumb { width: 80px; height: 80px; object-fit: cover; display: block; }
  .evidence-file {
    width: 120px; height: 70px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 6px;
    background: rgba(240,250,245,0.04); padding: 8px;
  }
  .evidence-file--pdf .file-icon { font-size: 22px; }
  .file-icon { font-size: 18px; }
  .file-name { font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.4); text-align: center; word-break: break-all; max-width: 100px; }
  .evidence-overlay {
    position: absolute; inset: 0; background: rgba(8,12,10,0.7);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; color: #34d399; font-family: 'DM Mono', monospace;
    opacity: 0; transition: opacity 0.2s;
  }

  /* AI Panel */
  .ai-panel {
    background: rgba(12,18,14,0.8); border: 1px solid rgba(96,165,250,0.15);
    border-radius: 16px; padding: 24px;
    display: flex; flex-direction: column; gap: 18px;
  }
  .ai-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  .ai-badge {
    display: flex; align-items: center; gap: 7px;
    font-size: 11px; font-family: 'DM Mono', monospace; font-weight: 600;
    color: #60a5fa; background: rgba(96,165,250,0.08);
    border: 1px solid rgba(96,165,250,0.2); border-radius: 8px; padding: 5px 12px;
  }
  .ai-meta { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.25); }

  .ai-verdict-block { border: 1px solid; border-radius: 12px; padding: 18px; }
  .av-label { font-size: 9px; font-family: 'DM Mono', monospace; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px; }
  .av-value { font-family: 'DM Serif Display', serif; font-size: 20px; letter-spacing: -0.02em; margin-bottom: 14px; }

  .confidence-row { display: flex; align-items: center; gap: 10px; }
  .conf-label { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.4); flex-shrink: 0; }
  .conf-bar { flex: 1; height: 4px; background: rgba(240,250,245,0.08); border-radius: 2px; overflow: hidden; }
  .conf-fill { height: 100%; border-radius: 2px; transition: width 1s ease; }
  .conf-pct { font-size: 12px; font-family: 'DM Mono', monospace; font-weight: 600; flex-shrink: 0; }

  .ai-section {}
  .ai-section-label { font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.3); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px; }
  .ai-reasoning { font-size: 14px; line-height: 1.75; color: rgba(240,250,245,0.7); }

  .factor-list { display: flex; flex-direction: column; gap: 7px; }
  .factor-chip {
    display: flex; align-items: center; gap: 10px;
    background: rgba(240,250,245,0.03); border: 1px solid rgba(240,250,245,0.06);
    border-radius: 8px; padding: 9px 12px; font-size: 13px; color: rgba(240,250,245,0.65);
  }
  .factor-num {
    width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
    background: rgba(96,165,250,0.15); border: 1px solid rgba(96,165,250,0.25);
    color: #60a5fa; font-size: 10px; font-family: 'DM Mono', monospace; font-weight: 600;
    display: flex; align-items: center; justify-content: center;
  }

  .warning-list { display: flex; flex-direction: column; gap: 7px; }
  .warning-item {
    background: rgba(245,158,11,0.06); border: 1px solid rgba(245,158,11,0.15);
    border-radius: 8px; padding: 9px 12px;
    font-size: 12px; color: rgba(245,158,11,0.8);
    font-family: 'DM Mono', monospace;
  }

  .ai-pending-card { text-align: center; padding: 32px; }
  .ai-pending-msg { font-size: 13px; color: rgba(240,250,245,0.4); margin-top: 12px; line-height: 1.6; }

  /* Decision Panel */
  .decision-panel {
    background: rgba(12,18,14,0.8); border: 1px solid rgba(52,211,153,0.15);
    border-radius: 16px; padding: 28px;
  }
  .dp-title {
    display: flex; align-items: center; gap: 10px;
    font-family: 'DM Serif Display', serif; font-size: 22px; color: #f0faf5;
    margin-bottom: 10px;
  }
  .dp-icon { font-size: 20px; }
  .dp-desc { font-size: 13px; color: rgba(240,250,245,0.45); line-height: 1.7; margin-bottom: 22px; }

  .dp-options { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
  .dp-option {
    display: flex; align-items: center; gap: 14px;
    background: rgba(240,250,245,0.02); border: 1px solid rgba(240,250,245,0.08);
    border-radius: 12px; padding: 14px 18px;
    cursor: pointer; text-align: left; width: 100%;
    transition: all 0.2s; font-family: 'DM Sans', sans-serif;
  }
  .dp-option:hover { border-color: rgba(240,250,245,0.15); background: rgba(240,250,245,0.04); }
  .dp-option--selected {}
  .dp-option-icon {
    width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; border: 1px solid;
  }
  .dp-option-text { flex: 1; }
  .dp-option-label { font-size: 14px; font-weight: 600; color: rgba(240,250,245,0.8); margin-bottom: 3px; }
  .dp-option-desc { font-size: 11px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.35); }
  .dp-check { font-size: 16px; flex-shrink: 0; }

  .dp-reason-wrap { margin-bottom: 16px; }
  .dp-reason-label { display: block; font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.35); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
  .dp-reason-input {
    width: 100%; background: rgba(240,250,245,0.04); border: 1px solid rgba(240,250,245,0.12);
    border-radius: 10px; padding: 12px 14px; color: #f0faf5; resize: vertical;
    font-family: 'DM Sans', sans-serif; font-size: 13px; line-height: 1.6;
    outline: none; transition: border-color 0.2s;
  }
  .dp-reason-input:focus { border-color: rgba(52,211,153,0.3); }
  .dp-reason-input::placeholder { color: rgba(240,250,245,0.2); }

  .dp-submit {
    width: 100%; padding: 14px 24px;
    background: rgba(52,211,153,0.15); border: 1px solid rgba(52,211,153,0.3);
    border-radius: 12px; cursor: pointer;
    font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600;
    color: #34d399; display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: all 0.2s;
  }
  .dp-submit:hover:not(:disabled) { background: rgba(52,211,153,0.22); }
  .dp-submit--confirm {
    background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.35); color: #f87171;
  }
  .dp-submit--confirm:hover:not(:disabled) { background: rgba(239,68,68,0.2); }
  .dp-submit:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Resolved */
  .decision-resolved {
    background: rgba(12,18,14,0.8); border: 1px solid rgba(52,211,153,0.2);
    border-radius: 16px; padding: 32px; text-align: center;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
  }
  .resolved-icon { font-size: 36px; color: #34d399; }
  .resolved-title { font-family: 'DM Serif Display', serif; font-size: 24px; color: #f0faf5; }
  .resolved-outcome { font-size: 15px; font-weight: 600; }
  .resolved-reason {
    font-size: 12px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.5);
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center;
  }
  .override-tag {
    background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.2);
    color: #f59e0b; border-radius: 4px; padding: 1px 7px; font-size: 9px; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .resolved-ai-badge {
    font-size: 11px; font-family: 'DM Mono', monospace; color: rgba(52,211,153,0.6);
    background: rgba(52,211,153,0.06); border: 1px solid rgba(52,211,153,0.15);
    border-radius: 6px; padding: 4px 10px;
  }
  .resolved-time { font-size: 11px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.25); }

  /* Waiting */
  .decision-waiting {
    background: rgba(12,18,14,0.8); border: 1px dashed rgba(240,250,245,0.1);
    border-radius: 16px; padding: 32px; text-align: center;
    display: flex; flex-direction: column; align-items: center; gap: 12px;
  }
  .waiting-icon { font-size: 32px; }
  .decision-waiting p { font-size: 13px; color: rgba(240,250,245,0.35); line-height: 1.7; max-width: 360px; }

  /* Shared */
  .loading-state {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 60vh; gap: 16px;
    color: rgba(240,250,245,0.35); font-size: 13px; font-family: 'DM Mono', monospace;
  }
  .error-box {
    background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
    border-radius: 10px; padding: 14px 18px;
    font-size: 13px; color: #f87171; font-family: 'DM Mono', monospace;
  }

  .spinner { display: inline-block; border: 2px solid rgba(52,211,153,0.15); border-top-color: #34d399; border-radius: 50%; animation: spin 0.7s linear infinite; }
  .spinner.sm { width: 14px; height: 14px; }
  .spinner.lg { width: 28px; height: 28px; }
  .spinner.white { border-top-color: #f0faf5; border-color: rgba(240,250,245,0.2); }
  @keyframes spin { to { transform: rotate(360deg); } }

  .fade-up { animation: fadeUp 0.4s ease both; }
  .fade-in { animation: fadeIn 0.3s ease both; }
  .d1 { animation-delay: 0.08s; }
  .d2 { animation-delay: 0.14s; }
  .d3 { animation-delay: 0.20s; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
`;
