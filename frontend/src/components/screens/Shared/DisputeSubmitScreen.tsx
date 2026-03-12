"use client";
// ============================================================
// components/screens/Shared/DisputeSubmitScreen.tsx
//
// Fixes applied:
//  1. Joins BOTH the agreement room AND the dispute-specific
//     room so events are received regardless of which room the
//     server emits to.
//  2. Filters incoming "dispute:updated" by agreement_id AND
//     milestone_index so cross-dispute bleed is prevented.
//  3. Peer statement + evidence are shown the instant the other
//     party submits — no page refresh needed.
//  4. AI verdict and arbitrator resolution also update live.
// ============================================================

import { useState, useRef, useEffect } from "react";
import {
  getSocket,
  joinAgreementRoom,
  joinDisputeRoom,
  leaveDisputeRoom,
} from "@/lib/socket";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────

interface ContractTerms {
  payer: string;
  receiver: string;
  arbitrator: string;
  total_amount?: number;
  milestone_description: string;
  milestone_percentage?: number;
  milestone_deadline?: string;
  agreement_type?: string;
}

interface AIVerdict {
  verdict: "release_to_receiver" | "refund_to_payer" | "split";
  confidence: number;
  reasoning: string;
  key_factors: string[];
  warnings: string[];
  split_percentage?: number;
}

interface LiveDispute {
  // Include these so we can filter incoming socket events
  agreement_id?: string;
  milestone_index?: number;

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
  party: "A" | "B";
  milestoneDescription: string;
  contractTerms: ContractTerms;
  onSubmitted?: () => void;
}

interface UploadedFile {
  url: string;
  name: string;
  isImage: boolean;
}

// ── Helpers ───────────────────────────────────────────────────

function isImageUrl(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
}

function fileName(url: string) {
  return decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? url).slice(
    0,
    40,
  );
}

// ── Component ─────────────────────────────────────────────────

export default function DisputeSubmitScreen({
  agreementId,
  milestoneIndex,
  party,
  milestoneDescription,
  contractTerms,
  onSubmitted,
}: Props) {
  const [statement, setStatement] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Full live dispute state — updated via Socket.io
  const [liveDispute, setLiveDispute] = useState<LiveDispute | null>(null);
  const [peerJustSubmitted, setPeerJustSubmitted] = useState(false);
  const [aiJustArrived, setAiJustArrived] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isA = party === "A";
  const partyColor = isA ? "#60a5fa" : "#f472b6";
  const peerColor = isA ? "#f472b6" : "#60a5fa";
  const partyLabel = isA ? "Party A (Payer)" : "Party B (Receiver)";
  const peerLabel = isA ? "Party B (Receiver)" : "Party A (Payer)";
  const claim = isA
    ? "You are claiming the milestone was NOT completed as agreed."
    : "You are claiming the milestone WAS completed as agreed.";

  // ── Load initial state + join both socket rooms ───────────
  useEffect(() => {
    // Join the agreement room (for dashboard-level events)
    joinAgreementRoom(agreementId);
    // Join the dispute-specific room (for statement/verdict events)
    joinDisputeRoom(agreementId, milestoneIndex);

    // Fetch current dispute state (handles page refresh)
    fetch(`${API_BASE}/api/arbitrate/${agreementId}/${milestoneIndex}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.dispute) {
          setLiveDispute(data.dispute);
          // If we already submitted before, mark as submitted
          const myTimestamp = isA
            ? data.dispute.party_a_submitted_at
            : data.dispute.party_b_submitted_at;
          if (myTimestamp) setSubmitted(true);
        }
      })
      .catch(() => {});

    const socket = getSocket();

    function onDisputeUpdated(dispute: LiveDispute) {
      // ── KEY FIX: filter by agreement_id + milestone_index ──
      if (
        dispute.agreement_id !== undefined &&
        (dispute.agreement_id !== agreementId ||
          dispute.milestone_index !== milestoneIndex)
      ) {
        return;
      }

      setLiveDispute((prev) => {
        const hadPeer = isA
          ? !!prev?.party_b_submitted_at
          : !!prev?.party_a_submitted_at;
        const hasPeer = isA
          ? !!dispute.party_b_submitted_at
          : !!dispute.party_a_submitted_at;

        // Flash notification when peer newly submits
        if (!hadPeer && hasPeer) {
          setPeerJustSubmitted(true);
          setTimeout(() => setPeerJustSubmitted(false), 4000);
        }

        // Flash when AI verdict arrives
        const hadVerdict = !!prev?.ai_verdict;
        const hasVerdict = !!dispute.ai_verdict;
        if (!hadVerdict && hasVerdict) {
          setAiJustArrived(true);
          setTimeout(() => setAiJustArrived(false), 5000);
        }

        return dispute;
      });
    }

    socket.on("dispute:updated", onDisputeUpdated);

    return () => {
      socket.off("dispute:updated", onDisputeUpdated);
      leaveDisputeRoom(agreementId, milestoneIndex);
    };
  }, [agreementId, milestoneIndex, isA]);

  // ── Derived state ─────────────────────────────────────────
  const myStatement = isA
    ? liveDispute?.party_a_statement
    : liveDispute?.party_b_statement;
  const myEvidence = isA
    ? liveDispute?.party_a_evidence
    : liveDispute?.party_b_evidence;
  const mySubmittedAt = isA
    ? liveDispute?.party_a_submitted_at
    : liveDispute?.party_b_submitted_at;
  const peerStatement = isA
    ? liveDispute?.party_b_statement
    : liveDispute?.party_a_statement;
  const peerEvidence = isA
    ? liveDispute?.party_b_evidence
    : liveDispute?.party_a_evidence;
  const peerSubmittedAt = isA
    ? liveDispute?.party_b_submitted_at
    : liveDispute?.party_a_submitted_at;
  const alreadySubmitted = submitted || !!mySubmittedAt;

  // ── File upload ───────────────────────────────────────────
  async function handleFileUpload(selected: File[]) {
    if (!selected.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      selected.forEach((f) => form.append("files", f));
      const res = await fetch(`${API_BASE}/api/arbitrate/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const data = await res.json();
      const newFiles: UploadedFile[] = (data.urls as string[]).map(
        (url, i) => ({
          url,
          name: selected[i]?.name ?? fileName(url),
          isImage: isImageUrl(url),
        }),
      );
      setUploadedFiles((prev) => [...prev, ...newFiles]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // ── Submit ────────────────────────────────────────────────
  async function handleSubmit() {
    if (statement.trim().length < 10) {
      setSubmitError("Statement must be at least 10 characters");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_BASE}/api/arbitrate/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agreement_id: agreementId,
          milestone_index: milestoneIndex,
          party,
          statement: statement.trim(),
          evidence_urls: uploadedFiles.map((f) => f.url),
          contract_terms: contractTerms,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `Submit failed: ${res.status}`);
      }
      const data = await res.json();
      if (data.dispute) setLiveDispute(data.dispute);
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Verdict helpers ───────────────────────────────────────
  function verdictColor(v: string) {
    if (v === "release_to_receiver") return "#34d399";
    if (v === "refund_to_payer") return "#f87171";
    return "#f59e0b";
  }
  function verdictLabel(v: string) {
    if (v === "release_to_receiver") return "✓ Release to Receiver";
    if (v === "refund_to_payer") return "↩ Refund to Payer";
    return "⚖ Split Payment";
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="submit-root">
      <style>{css}</style>
      <div className="submit-container fade-up">
        {/* ── Header ── */}
        <div className="submit-header">
          <div
            className="submit-badge"
            style={{
              borderColor: partyColor + "40",
              background: partyColor + "0a",
              color: partyColor,
            }}
          >
            {partyLabel}
          </div>
          <h2 className="submit-title">Dispute Statement</h2>
          <p className="submit-milestone">
            <span className="ms-label">Milestone:</span> {milestoneDescription}
          </p>
          <div
            className="claim-box"
            style={{
              borderColor: partyColor + "30",
              background: partyColor + "08",
            }}
          >
            <span style={{ color: partyColor }}>⚑</span>
            <span className="claim-text">{claim}</span>
          </div>
        </div>

        {/* ── Peer just-submitted flash ── */}
        {peerJustSubmitted && (
          <div
            className="peer-notify fade-in"
            style={{
              borderColor: peerColor + "50",
              background: peerColor + "0a",
            }}
          >
            <span style={{ fontSize: 18 }}>📨</span>
            <span style={{ color: peerColor, fontWeight: 600, fontSize: 13 }}>
              {peerLabel} just submitted their statement!
            </span>
          </div>
        )}

        {/* ── AI verdict just arrived flash ── */}
        {aiJustArrived && (
          <div
            className="peer-notify fade-in"
            style={{ borderColor: "#34d39950", background: "#34d39908" }}
          >
            <span style={{ fontSize: 18 }}>🤖</span>
            <span style={{ color: "#34d399", fontWeight: 600, fontSize: 13 }}>
              AI arbitration verdict is ready!
            </span>
          </div>
        )}

        {/* ── SUBMISSION FORM (pre-submit) ── */}
        {!alreadySubmitted && (
          <>
            <div className="section">
              <label className="section-label">Your Statement</label>
              <p className="section-hint">
                Describe{" "}
                {isA
                  ? "why the milestone was not completed as agreed"
                  : "how and when you completed the milestone"}
                . Be specific and factual.
              </p>
              <textarea
                className="statement-input"
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                placeholder={
                  isA
                    ? "e.g. The deliverable did not meet specifications because…"
                    : "e.g. I completed the work on [date] by delivering [items]…"
                }
                rows={6}
              />
              <div
                className="char-count"
                style={{
                  color:
                    statement.length < 10
                      ? "#f87171"
                      : "rgba(240,250,245,0.25)",
                }}
              >
                {statement.length} chars{" "}
                {statement.length < 10 ? "(min 10)" : "✓"}
              </div>
            </div>

            <div className="section">
              <label className="section-label">Evidence Files</label>
              <p className="section-hint">
                Upload screenshots, documents, emails, contracts. JPG · PNG ·
                PDF · MP4
              </p>
              <div
                className="dropzone"
                onDrop={(e) => {
                  e.preventDefault();
                  handleFileUpload(Array.from(e.dataTransfer.files));
                }}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
              >
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.pdf,.gif,.webp,.svg,.mp4"
                  style={{ display: "none" }}
                  onChange={(e) =>
                    handleFileUpload(Array.from(e.target.files ?? []))
                  }
                />
                {uploading ? (
                  <div className="dz-uploading">
                    <span className="spinner" />
                    <span>Uploading…</span>
                  </div>
                ) : (
                  <div className="dz-idle">
                    <div className="dz-icon">
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <div className="dz-text">
                      Drop files or <span className="dz-link">browse</span>
                    </div>
                    <div className="dz-sub">
                      JPG · PNG · PDF · GIF · WebP · MP4
                    </div>
                  </div>
                )}
              </div>

              {uploadError && (
                <div className="error-sm fade-in">⚠ {uploadError}</div>
              )}

              {uploadedFiles.length > 0 && (
                <div className="file-list">
                  {uploadedFiles.map((f, i) => (
                    <div key={i} className="file-chip">
                      <span className="file-chip-icon">
                        {f.isImage ? "🖼" : "📄"}
                      </span>
                      <span className="file-chip-name">{f.name}</span>
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="file-chip-link"
                      >
                        ↗
                      </a>
                      <button
                        className="file-chip-remove"
                        onClick={() =>
                          setUploadedFiles((p) => p.filter((_, j) => j !== i))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {submitError && (
              <div className="error-box fade-in">{submitError}</div>
            )}

            <button
              className="btn-submit"
              onClick={handleSubmit}
              disabled={submitting || statement.trim().length < 10}
              style={{
                background: `linear-gradient(135deg, ${partyColor}, ${partyColor}99)`,
              }}
            >
              {submitting ? (
                <>
                  <span className="spinner sm dark" /> Submitting…
                </>
              ) : (
                `Submit as ${partyLabel} →`
              )}
            </button>
            <p className="submit-note">
              ⚠ Statements cannot be edited after submission.
            </p>
          </>
        )}

        {/* ── YOUR SUBMITTED STATEMENT (read-only) ── */}
        {alreadySubmitted && myStatement && (
          <div
            className="section"
            style={{
              borderColor: partyColor + "30",
              background: partyColor + "05",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <label className="section-label" style={{ color: partyColor }}>
                Your Statement
              </label>
              <span
                className="tag"
                style={{
                  color: partyColor,
                  borderColor: partyColor + "40",
                  background: partyColor + "0a",
                }}
              >
                ✓ Submitted{" "}
                {mySubmittedAt
                  ? new Date(mySubmittedAt).toLocaleTimeString()
                  : ""}
              </span>
            </div>
            <p className="statement-readonly">{myStatement}</p>
            {myEvidence && myEvidence.length > 0 && (
              <>
                <label
                  className="section-label"
                  style={{ marginTop: 4, color: partyColor }}
                >
                  Your Evidence ({myEvidence.length} file
                  {myEvidence.length !== 1 ? "s" : ""})
                </label>
                <div className="file-list">
                  {myEvidence.map((url, i) => (
                    <div key={i} className="file-chip">
                      <span className="file-chip-icon">
                        {isImageUrl(url) ? "🖼" : "📄"}
                      </span>
                      <span className="file-chip-name">{fileName(url)}</span>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="file-chip-link"
                      >
                        ↗
                      </a>
                    </div>
                  ))}
                </div>
              </>
            )}
            {(!myEvidence || myEvidence.length === 0) && (
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(240,250,245,0.25)",
                  fontFamily: "monospace",
                }}
              >
                No evidence files attached
              </div>
            )}
          </div>
        )}

        {/* ── PEER STATEMENT — shown the instant they submit ── */}
        {peerStatement ? (
          <div
            className="section fade-in"
            style={{
              borderColor: peerColor + "30",
              background: peerColor + "04",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <label className="section-label" style={{ color: peerColor }}>
                {peerLabel}'s Statement
              </label>
              <span
                className="tag"
                style={{
                  color: peerColor,
                  borderColor: peerColor + "40",
                  background: peerColor + "0a",
                }}
              >
                ✓{" "}
                {peerSubmittedAt
                  ? new Date(peerSubmittedAt).toLocaleTimeString()
                  : "Submitted"}
              </span>
            </div>
            <p className="statement-readonly">{peerStatement}</p>

            {/* Peer evidence */}
            {peerEvidence && peerEvidence.length > 0 ? (
              <>
                <label
                  className="section-label"
                  style={{ marginTop: 4, color: peerColor }}
                >
                  Their Evidence ({peerEvidence.length} file
                  {peerEvidence.length !== 1 ? "s" : ""})
                </label>
                <div className="file-list">
                  {peerEvidence.map((url, i) => (
                    <div
                      key={i}
                      className="file-chip"
                      style={{ borderColor: peerColor + "30" }}
                    >
                      <span className="file-chip-icon">
                        {isImageUrl(url) ? "🖼" : "📄"}
                      </span>
                      <span className="file-chip-name">{fileName(url)}</span>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="file-chip-link"
                        style={{ color: peerColor }}
                      >
                        View ↗
                      </a>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(240,250,245,0.25)",
                  fontFamily: "monospace",
                }}
              >
                No evidence files attached
              </div>
            )}
          </div>
        ) : alreadySubmitted ? (
          <div className="waiting-peer fade-in">
            <span
              className="spinner sm"
              style={{ borderTopColor: peerColor }}
            />
            <span style={{ color: "rgba(240,250,245,0.4)", fontSize: 12 }}>
              Waiting for {peerLabel} to submit their statement…
            </span>
          </div>
        ) : null}

        {/* ── AI running spinner ── */}
        {liveDispute?.status === "ai_pending" && !liveDispute?.ai_verdict && (
          <div className="waiting-peer fade-in">
            <span className="spinner sm" />
            <span style={{ color: "rgba(240,250,245,0.5)", fontSize: 12 }}>
              AI arbitration in progress…
            </span>
          </div>
        )}

        {/* ── AI VERDICT ── */}
        {liveDispute?.ai_verdict && (
          <div
            className={`verdict-card fade-in${aiJustArrived ? " verdict-card--flash" : ""}`}
            style={{
              borderColor: verdictColor(liveDispute.ai_verdict.verdict) + "40",
            }}
          >
            <div className="verdict-header">
              <span className="mono-label">🤖 AI Recommendation</span>
              <span className="mono-label">
                {liveDispute.ai_verdict.confidence}% confidence
              </span>
            </div>
            <div
              className="verdict-outcome"
              style={{ color: verdictColor(liveDispute.ai_verdict.verdict) }}
            >
              {verdictLabel(liveDispute.ai_verdict.verdict)}
              {liveDispute.ai_verdict.verdict === "split" &&
                liveDispute.ai_verdict.split_percentage != null && (
                  <span style={{ fontSize: 13, opacity: 0.7 }}>
                    {" "}
                    ({liveDispute.ai_verdict.split_percentage}% to receiver)
                  </span>
                )}
            </div>
            <p className="verdict-reasoning">
              {liveDispute.ai_verdict.reasoning}
            </p>

            {liveDispute.ai_verdict.key_factors.length > 0 && (
              <div className="verdict-factors">
                {liveDispute.ai_verdict.key_factors.map((f, i) => (
                  <span key={i} className="factor-chip">
                    · {f}
                  </span>
                ))}
              </div>
            )}

            {liveDispute.ai_verdict.warnings.length > 0 && (
              <div className="verdict-warnings">
                {liveDispute.ai_verdict.warnings.map((w, i) => (
                  <div key={i} className="warning-line">
                    ⚠ {w}
                  </div>
                ))}
              </div>
            )}

            <div className="verdict-footer">
              Awaiting human arbitrator's final decision
            </div>
          </div>
        )}

        {/* ── FINAL RESOLUTION ── */}
        {liveDispute?.arbitrator_decision && (
          <div
            className="verdict-card fade-in"
            style={{
              borderColor:
                verdictColor(liveDispute.arbitrator_decision.outcome) + "60",
            }}
          >
            <div className="verdict-header">
              <span
                className="mono-label"
                style={{
                  color: verdictColor(liveDispute.arbitrator_decision.outcome),
                }}
              >
                ✓ Final Resolution
              </span>
              <span className="mono-label">
                {liveDispute.arbitrator_decision.followed_ai
                  ? "Confirmed AI"
                  : "Overrode AI"}
              </span>
            </div>
            <div
              className="verdict-outcome"
              style={{
                color: verdictColor(liveDispute.arbitrator_decision.outcome),
              }}
            >
              {verdictLabel(liveDispute.arbitrator_decision.outcome)}
            </div>
            {liveDispute.arbitrator_decision.override_reason && (
              <p className="verdict-reasoning">
                Override reason:{" "}
                {liveDispute.arbitrator_decision.override_reason}
              </p>
            )}
            <div className="verdict-footer">
              Decided{" "}
              {new Date(
                liveDispute.arbitrator_decision.decided_at,
              ).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CSS ───────────────────────────────────────────────────────

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .submit-root {
    font-family: 'DM Sans', sans-serif;
    color: #f0faf5;
    background: #080c0a;
    min-height: 100vh;
    padding: 36px 24px 80px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }

  .submit-container {
    width: 100%;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* Header */
  .submit-header { display: flex; flex-direction: column; gap: 12px; }
  .submit-badge {
    display: inline-flex; align-self: flex-start;
    font-size: 10px; font-family: 'DM Mono', monospace; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.08em;
    border: 1px solid; border-radius: 8px; padding: 4px 12px;
  }
  .submit-title { font-family: 'DM Serif Display', serif; font-size: 28px; letter-spacing: -0.02em; }
  .submit-milestone { font-size: 13px; color: rgba(240,250,245,0.5); }
  .ms-label { font-family: 'DM Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(240,250,245,0.3); margin-right: 6px; }
  .claim-box { display: flex; align-items: center; gap: 10px; border: 1px solid; border-radius: 10px; padding: 10px 14px; }
  .claim-text { font-size: 13px; color: rgba(240,250,245,0.6); }

  /* Flash notifications */
  .peer-notify { display: flex; align-items: center; gap: 10px; border: 1px solid; border-radius: 10px; padding: 12px 16px; }

  /* Sections */
  .section {
    background: rgba(12,18,14,0.8);
    border: 1px solid rgba(52,211,153,0.1);
    border-radius: 14px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .section-label { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.35); text-transform: uppercase; letter-spacing: 0.1em; }
  .section-hint { font-size: 12px; color: rgba(240,250,245,0.4); line-height: 1.65; }

  /* Statement inputs */
  .statement-input {
    width: 100%;
    background: rgba(240,250,245,0.04);
    border: 1px solid rgba(240,250,245,0.1);
    border-radius: 10px;
    padding: 14px 16px;
    color: #f0faf5;
    resize: vertical;
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    line-height: 1.7;
    outline: none;
    transition: border-color 0.2s;
  }
  .statement-input:focus { border-color: rgba(52,211,153,0.3); }
  .statement-input::placeholder { color: rgba(240,250,245,0.2); }
  .statement-readonly { font-size: 13px; color: rgba(240,250,245,0.75); line-height: 1.75; white-space: pre-wrap; }
  .char-count { font-size: 10px; font-family: 'DM Mono', monospace; text-align: right; }
  .tag { font-size: 10px; font-family: 'DM Mono', monospace; border: 1px solid; border-radius: 6px; padding: 2px 8px; }

  /* Waiting */
  .waiting-peer {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 18px;
    background: rgba(240,250,245,0.02);
    border: 1px solid rgba(240,250,245,0.06);
    border-radius: 12px;
  }

  /* Dropzone */
  .dropzone {
    border: 1px dashed rgba(240,250,245,0.15);
    border-radius: 12px;
    padding: 28px;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    background: rgba(240,250,245,0.02);
  }
  .dropzone:hover { border-color: rgba(52,211,153,0.3); background: rgba(52,211,153,0.03); }
  .dz-idle { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .dz-icon { color: rgba(240,250,245,0.25); }
  .dz-text { font-size: 13px; color: rgba(240,250,245,0.45); }
  .dz-link { color: #34d399; text-decoration: underline; text-underline-offset: 2px; }
  .dz-sub { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.2); }
  .dz-uploading { display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 13px; color: rgba(240,250,245,0.5); }

  /* File chips */
  .file-list { display: flex; flex-direction: column; gap: 7px; }
  .file-chip {
    display: flex; align-items: center; gap: 8px;
    background: rgba(52,211,153,0.05);
    border: 1px solid rgba(52,211,153,0.15);
    border-radius: 8px;
    padding: 8px 12px;
  }
  .file-chip-icon { font-size: 14px; flex-shrink: 0; }
  .file-chip-name { font-size: 12px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.6); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-chip-link { font-size: 11px; color: #34d399; text-decoration: none; flex-shrink: 0; }
  .file-chip-remove { background: none; border: none; cursor: pointer; color: rgba(240,250,245,0.3); font-size: 16px; line-height: 1; flex-shrink: 0; padding: 0; transition: color 0.2s; }
  .file-chip-remove:hover { color: #f87171; }

  /* Errors */
  .error-sm { font-size: 11px; font-family: 'DM Mono', monospace; color: #f87171; }
  .error-box { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); border-radius: 10px; padding: 12px 16px; font-size: 12px; color: #f87171; font-family: 'DM Mono', monospace; }

  /* Submit button */
  .btn-submit {
    width: 100%; padding: 15px 24px;
    border: none; border-radius: 12px; cursor: pointer;
    font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 600;
    color: #080c0a;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: opacity 0.2s, transform 0.15s;
  }
  .btn-submit:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
  .btn-submit:disabled { opacity: 0.4; cursor: not-allowed; }
  .submit-note { font-size: 11px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.25); text-align: center; }

  /* Verdict cards */
  .mono-label { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.3); text-transform: uppercase; letter-spacing: 0.1em; }
  .verdict-card {
    background: rgba(12,18,14,0.9);
    border: 1px solid;
    border-radius: 16px;
    padding: 22px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .verdict-card--flash { animation: verdictFlash 3s ease; }
  @keyframes verdictFlash {
    0% { box-shadow: 0 0 0 3px rgba(52,211,153,0.3); }
    100% { box-shadow: none; }
  }
  .verdict-header { display: flex; align-items: center; justify-content: space-between; }
  .verdict-outcome { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }
  .verdict-reasoning { font-size: 13px; color: rgba(240,250,245,0.6); line-height: 1.7; }
  .verdict-factors { display: flex; flex-wrap: wrap; gap: 6px; }
  .factor-chip { font-size: 11px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.45); background: rgba(240,250,245,0.04); border: 1px solid rgba(240,250,245,0.08); border-radius: 6px; padding: 3px 10px; }
  .verdict-warnings { display: flex; flex-direction: column; gap: 4px; }
  .warning-line { font-size: 11px; font-family: 'DM Mono', monospace; color: #f59e0b; }
  .verdict-footer { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.2); border-top: 1px solid rgba(240,250,245,0.06); padding-top: 10px; margin-top: 2px; }

  /* Spinners */
  .spinner { display: inline-block; border: 2px solid rgba(52,211,153,0.2); border-top-color: #34d399; border-radius: 50%; animation: spin 0.7s linear infinite; width: 18px; height: 18px; }
  .spinner.sm { width: 14px; height: 14px; }
  .spinner.dark { border-color: rgba(8,12,10,0.3); border-top-color: #080c0a; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Animations */
  .fade-up { animation: fadeUp 0.4s ease both; }
  .fade-in { animation: fadeIn 0.3s ease both; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
`;
