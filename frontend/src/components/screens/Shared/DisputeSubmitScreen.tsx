"use client";
// ============================================================
// components/screens/Shared/DisputeSubmitScreen.tsx — v2 2026
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

function verdictColor(v: string) {
  if (v === "release_to_receiver") return "#4ade80";
  if (v === "refund_to_payer") return "#f87171";
  return "#fbbf24";
}
function verdictLabel(v: string) {
  if (v === "release_to_receiver") return "Release to Receiver";
  if (v === "refund_to_payer") return "Refund to Payer";
  return "Split Payment";
}
function VerdictIcon({ v }: { v: string }) {
  if (v === "release_to_receiver")
    return (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  if (v === "refund_to_payer")
    return (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <polyline points="9 14 4 9 9 4" />
        <path d="M20 20v-7a4 4 0 00-4-4H4" />
      </svg>
    );
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
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
  const [liveDispute, setLiveDispute] = useState<LiveDispute | null>(null);
  const [peerJustSubmitted, setPeerJustSubmitted] = useState(false);
  const [aiJustArrived, setAiJustArrived] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isA = party === "A";
  const partyColor = isA ? "#60a5fa" : "#f472b6";
  const peerColor = isA ? "#f472b6" : "#60a5fa";
  const partyLabel = isA ? "Party A · Payer" : "Party B · Receiver";
  const peerLabel = isA ? "Party B · Receiver" : "Party A · Payer";
  const claim = isA
    ? "Claiming the milestone was NOT completed as agreed."
    : "Claiming the milestone WAS completed as agreed.";

  useEffect(() => {
    joinAgreementRoom(agreementId);
    joinDisputeRoom(agreementId, milestoneIndex);

    fetch(`${API_BASE}/api/arbitrate/${agreementId}/${milestoneIndex}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.dispute) {
          setLiveDispute(data.dispute);
          const mine = isA
            ? data.dispute.party_a_submitted_at
            : data.dispute.party_b_submitted_at;
          if (mine) setSubmitted(true);
        }
      })
      .catch(() => {});

    const socket = getSocket();
    function onDisputeUpdated(dispute: LiveDispute) {
      if (
        dispute.agreement_id !== undefined &&
        (dispute.agreement_id !== agreementId ||
          dispute.milestone_index !== milestoneIndex)
      )
        return;
      setLiveDispute((prev) => {
        const hadPeer = isA
          ? !!prev?.party_b_submitted_at
          : !!prev?.party_a_submitted_at;
        const hasPeer = isA
          ? !!dispute.party_b_submitted_at
          : !!dispute.party_a_submitted_at;
        if (!hadPeer && hasPeer) {
          setPeerJustSubmitted(true);
          setTimeout(() => setPeerJustSubmitted(false), 5000);
        }
        const hadVerdict = !!prev?.ai_verdict;
        const hasVerdict = !!dispute.ai_verdict;
        if (!hadVerdict && hasVerdict) {
          setAiJustArrived(true);
          setTimeout(() => setAiJustArrived(false), 6000);
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

  async function handleSubmit() {
    if (statement.trim().length < 10) {
      setSubmitError("Statement must be at least 10 characters.");
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

  const charOk = statement.trim().length >= 10;

  return (
    <div className="ds2-root">
      <style>{css}</style>

      {/* Party + claim header */}
      <div className="ds2-header ds2-fade-up">
        <div
          className="ds2-party-badge"
          style={{
            color: partyColor,
            background: partyColor + "10",
            borderColor: partyColor + "30",
          }}
        >
          <span className="ds2-party-dot" style={{ background: partyColor }} />
          {partyLabel}
        </div>
        <div
          className="ds2-claim"
          style={{
            borderColor: partyColor + "22",
            background: partyColor + "05",
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke={partyColor}
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="ds2-claim-text">{claim}</span>
        </div>
      </div>

      {/* Live flash notifications */}
      {peerJustSubmitted && (
        <div
          className="ds2-flash ds2-fade-in"
          style={{
            borderColor: peerColor + "35",
            background: peerColor + "08",
          }}
        >
          <span>📨</span>
          <span style={{ color: peerColor, fontWeight: 600, fontSize: 12 }}>
            {peerLabel} just submitted their statement.
          </span>
        </div>
      )}
      {aiJustArrived && (
        <div
          className="ds2-flash ds2-fade-in"
          style={{ borderColor: "#4ade8035", background: "#4ade8007" }}
        >
          <span>🤖</span>
          <span style={{ color: "#4ade80", fontWeight: 600, fontSize: 12 }}>
            AI arbitration verdict is ready — scroll down to view.
          </span>
        </div>
      )}

      {/* ── Submission form ── */}
      {!alreadySubmitted && (
        <div className="ds2-form ds2-fade-up ds2-d1">
          {/* Statement */}
          <div className="ds2-field">
            <div className="ds2-field-top">
              <label className="ds2-label">Your Statement</label>
              <span
                className="ds2-char"
                style={{ color: charOk ? "#4ade80" : "rgba(240,242,245,0.25)" }}
              >
                {statement.length} chars{" "}
                {charOk && (
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    style={{ display: "inline", marginLeft: 3 }}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
            </div>
            <p className="ds2-hint">
              {isA
                ? "Describe specifically why the milestone was not completed as agreed."
                : "Describe how and when you completed the milestone deliverables."}
            </p>
            <div
              className={`ds2-textarea-wrap${charOk ? " ds2-textarea-wrap--ok" : ""}`}
              style={{ "--party-color": partyColor } as React.CSSProperties}
            >
              <textarea
                className="ds2-textarea"
                value={statement}
                onChange={(e) => {
                  setStatement(e.target.value);
                  setSubmitError(null);
                }}
                placeholder={
                  isA
                    ? "e.g. The deliverable did not meet the agreed specifications because…"
                    : "e.g. I completed the work on [date] and delivered [specific items]…"
                }
                rows={5}
              />
            </div>
          </div>

          {/* Upload */}
          <div className="ds2-field">
            <label className="ds2-label">Evidence Files</label>
            <p className="ds2-hint">
              Screenshots, contracts, emails, deliverables · JPG · PNG · PDF ·
              MP4
            </p>

            <div
              className={`ds2-dropzone${dragOver ? " ds2-dropzone--over" : ""}`}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFileUpload(Array.from(e.dataTransfer.files));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
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
                <div className="ds2-dz-inner">
                  <span className="ds2-spinner" />
                  <span className="ds2-dz-text">Uploading…</span>
                </div>
              ) : (
                <div className="ds2-dz-inner">
                  <div className="ds2-dz-icon">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <div>
                    <div className="ds2-dz-text">
                      Drop files or <span className="ds2-dz-link">browse</span>
                    </div>
                    <div className="ds2-dz-sub">
                      Max 10 files · JPG, PNG, PDF, MP4
                    </div>
                  </div>
                </div>
              )}
            </div>

            {uploadError && (
              <p className="ds2-err-sm ds2-fade-in">⚠ {uploadError}</p>
            )}

            {uploadedFiles.length > 0 && (
              <div className="ds2-file-list">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="ds2-file-row">
                    <span className="ds2-file-icon">
                      {f.isImage ? "🖼" : "📄"}
                    </span>
                    <span className="ds2-file-name">{f.name}</span>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ds2-file-view"
                    >
                      View ↗
                    </a>
                    <button
                      className="ds2-file-rm"
                      onClick={() =>
                        setUploadedFiles((p) => p.filter((_, j) => j !== i))
                      }
                      aria-label="Remove"
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
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {submitError && (
            <div className="ds2-err-box ds2-fade-in">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {submitError}
            </div>
          )}

          {/* Submit */}
          <div className="ds2-cta">
            <button
              className={`ds2-submit${charOk ? " ds2-submit--active" : ""}`}
              onClick={handleSubmit}
              disabled={submitting || !charOk}
              style={
                charOk
                  ? {
                      background: `linear-gradient(135deg, ${partyColor}, ${partyColor}bb)`,
                    }
                  : {}
              }
            >
              {submitting ? (
                <>
                  <span className="ds2-spinner ds2-spinner--dark" />
                  Submitting…
                </>
              ) : (
                <>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  Submit as {isA ? "Payer" : "Receiver"}
                </>
              )}
            </button>
            <p className="ds2-submit-note">
              Statements are locked after submission
            </p>
          </div>
        </div>
      )}

      {/* ── My submitted statement ── */}
      {alreadySubmitted && myStatement && (
        <div
          className="ds2-stmt-card ds2-fade-in"
          style={{ borderColor: partyColor + "22" }}
        >
          <div
            className="ds2-stmt-head"
            style={{
              borderBottomColor: partyColor + "15",
              background: partyColor + "05",
            }}
          >
            <div className="ds2-stmt-party">
              <div
                className="ds2-avatar"
                style={{
                  color: partyColor,
                  background: partyColor + "18",
                  borderColor: partyColor + "30",
                }}
              >
                {isA ? "A" : "B"}
              </div>
              <div>
                <div className="ds2-stmt-name">{partyLabel}</div>
                {mySubmittedAt && (
                  <div className="ds2-stmt-time">
                    Submitted{" "}
                    {new Date(mySubmittedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                )}
              </div>
            </div>
            <span className="ds2-badge ds2-badge--ok">✓ Filed</span>
          </div>
          <div className="ds2-stmt-body">
            <p className="ds2-stmt-text">{myStatement}</p>
            {myEvidence && myEvidence.length > 0 ? (
              <div className="ds2-evidence">
                <div className="ds2-evidence-label">
                  Evidence · {myEvidence.length} file
                  {myEvidence.length !== 1 ? "s" : ""}
                </div>
                {myEvidence.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ds2-ev-item"
                    style={{
                      color: partyColor,
                      background: partyColor + "08",
                      borderColor: partyColor + "20",
                    }}
                  >
                    <span>{isImageUrl(url) ? "🖼" : "📄"}</span>
                    <span className="ds2-ev-name">{fileName(url)}</span>
                    <span>↗</span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="ds2-no-ev">No evidence files attached</div>
            )}
          </div>
        </div>
      )}

      {/* ── Peer statement ── */}
      {peerStatement ? (
        <div
          className="ds2-stmt-card ds2-fade-in"
          style={{ borderColor: peerColor + "22" }}
        >
          <div
            className="ds2-stmt-head"
            style={{
              borderBottomColor: peerColor + "15",
              background: peerColor + "04",
            }}
          >
            <div className="ds2-stmt-party">
              <div
                className="ds2-avatar"
                style={{
                  color: peerColor,
                  background: peerColor + "18",
                  borderColor: peerColor + "30",
                }}
              >
                {isA ? "B" : "A"}
              </div>
              <div>
                <div className="ds2-stmt-name">{peerLabel}</div>
                {peerSubmittedAt && (
                  <div className="ds2-stmt-time">
                    Submitted{" "}
                    {new Date(peerSubmittedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                )}
              </div>
            </div>
            <span
              className="ds2-badge"
              style={{
                color: peerColor,
                background: peerColor + "10",
                borderColor: peerColor + "28",
              }}
            >
              ✓ Filed
            </span>
          </div>
          <div className="ds2-stmt-body">
            <p className="ds2-stmt-text">{peerStatement}</p>
            {peerEvidence && peerEvidence.length > 0 ? (
              <div className="ds2-evidence">
                <div className="ds2-evidence-label">
                  Evidence · {peerEvidence.length} file
                  {peerEvidence.length !== 1 ? "s" : ""}
                </div>
                {peerEvidence.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ds2-ev-item"
                    style={{
                      color: peerColor,
                      background: peerColor + "08",
                      borderColor: peerColor + "20",
                    }}
                  >
                    <span>{isImageUrl(url) ? "🖼" : "📄"}</span>
                    <span className="ds2-ev-name">{fileName(url)}</span>
                    <span>↗</span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="ds2-no-ev">No evidence files attached</div>
            )}
          </div>
        </div>
      ) : (
        alreadySubmitted && (
          <div className="ds2-waiting ds2-fade-in">
            <span
              className="ds2-spinner"
              style={{ borderTopColor: peerColor }}
            />
            <span className="ds2-waiting-text">
              Waiting for {peerLabel} to submit…
            </span>
          </div>
        )
      )}

      {/* AI pending */}
      {liveDispute?.status === "ai_pending" && !liveDispute?.ai_verdict && (
        <div className="ds2-waiting ds2-fade-in">
          <span className="ds2-spinner" />
          <span className="ds2-waiting-text">
            AI arbitration in progress — analysing both statements…
          </span>
        </div>
      )}

      {/* ── AI Verdict ── */}
      {liveDispute?.ai_verdict &&
        (() => {
          const v = liveDispute.ai_verdict!;
          const vc = verdictColor(v.verdict);
          return (
            <div
              className={`ds2-verdict ds2-fade-in${aiJustArrived ? " ds2-verdict--flash" : ""}`}
              style={{ borderColor: vc + "30" }}
            >
              <div
                className="ds2-verdict-head"
                style={{ borderBottomColor: vc + "18" }}
              >
                <div className="ds2-verdict-head-left">
                  <div
                    className="ds2-verdict-icon"
                    style={{
                      color: vc,
                      background: vc + "12",
                      borderColor: vc + "25",
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    >
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <div>
                    <div className="ds2-verdict-title">AI Recommendation</div>
                    <div className="ds2-verdict-model">
                      claude-sonnet · arbitration engine
                    </div>
                  </div>
                </div>
                <div className="ds2-confidence">
                  <span className="ds2-confidence-label">Confidence</span>
                  <div className="ds2-confidence-bar">
                    <div
                      className="ds2-confidence-fill"
                      style={{ width: `${v.confidence}%`, background: vc }}
                    />
                  </div>
                  <span className="ds2-confidence-pct" style={{ color: vc }}>
                    {v.confidence}%
                  </span>
                </div>
              </div>

              <div className="ds2-verdict-body">
                <div
                  className="ds2-verdict-pill"
                  style={{
                    color: vc,
                    background: vc + "10",
                    borderColor: vc + "28",
                  }}
                >
                  <VerdictIcon v={v.verdict} />
                  {verdictLabel(v.verdict)}
                  {v.verdict === "split" && v.split_percentage != null && (
                    <span className="ds2-verdict-split">
                      {v.split_percentage}% to receiver
                    </span>
                  )}
                </div>

                <div className="ds2-vsection">
                  <div className="ds2-vsection-label">Reasoning</div>
                  <p className="ds2-reasoning">{v.reasoning}</p>
                </div>

                {v.key_factors.length > 0 && (
                  <div className="ds2-vsection">
                    <div className="ds2-vsection-label">Key Factors</div>
                    <div className="ds2-factors">
                      {v.key_factors.map((f, i) => (
                        <div key={i} className="ds2-factor">
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="rgba(240,242,245,0.30)"
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {v.warnings.length > 0 && (
                  <div className="ds2-warnings">
                    {v.warnings.map((w, i) => (
                      <div key={i} className="ds2-warning">
                        <svg
                          width="9"
                          height="9"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#fbbf24"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        >
                          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        {w}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="ds2-verdict-footer">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Awaiting human arbitrator's final on-chain decision
              </div>
            </div>
          );
        })()}

      {/* ── Final resolution ── */}
      {liveDispute?.arbitrator_decision &&
        (() => {
          const d = liveDispute.arbitrator_decision!;
          const dc = verdictColor(d.outcome);
          return (
            <div
              className="ds2-verdict ds2-fade-in"
              style={{ borderColor: dc + "40" }}
            >
              <div
                className="ds2-verdict-head"
                style={{ borderBottomColor: dc + "20", background: dc + "05" }}
              >
                <div className="ds2-verdict-head-left">
                  <div
                    className="ds2-verdict-icon"
                    style={{
                      color: dc,
                      background: dc + "12",
                      borderColor: dc + "25",
                    }}
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
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div>
                    <div className="ds2-verdict-title">Final Resolution</div>
                    <div className="ds2-verdict-model">
                      {d.followed_ai
                        ? "Confirmed AI recommendation"
                        : "Overrode AI recommendation"}
                    </div>
                  </div>
                </div>
                <span
                  className="ds2-badge ds2-badge--ok"
                  style={{
                    color: dc,
                    background: dc + "10",
                    borderColor: dc + "28",
                  }}
                >
                  On-chain
                </span>
              </div>
              <div className="ds2-verdict-body">
                <div
                  className="ds2-verdict-pill"
                  style={{
                    color: dc,
                    background: dc + "10",
                    borderColor: dc + "28",
                  }}
                >
                  <VerdictIcon v={d.outcome} />
                  {verdictLabel(d.outcome)}
                </div>
                {d.override_reason && (
                  <div className="ds2-vsection">
                    <div className="ds2-vsection-label">Override Reason</div>
                    <p className="ds2-reasoning">{d.override_reason}</p>
                  </div>
                )}
              </div>
              <div className="ds2-verdict-footer">
                Decided {new Date(d.decided_at).toLocaleString()}
              </div>
            </div>
          );
        })()}
    </div>
  );
}

// ── CSS ───────────────────────────────────────────────────────
const css = `
.ds2-root {
  display: flex; flex-direction: column; gap: 16px; padding: 20px 22px;
  font-family: 'DM Sans', sans-serif;
}

/* Header */
.ds2-header { display: flex; flex-direction: column; gap: 10px; }
.ds2-party-badge {
  display: inline-flex; align-items: center; gap: 7px; align-self: flex-start;
  font-size: 10px; font-family: 'DM Mono', monospace; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.08em;
  border: 1px solid; border-radius: 20px; padding: 4px 12px;
}
.ds2-party-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; animation: ds2Pulse 2s ease infinite; }
.ds2-claim {
  display: flex; align-items: flex-start; gap: 9px;
  border: 1px solid; border-radius: 10px; padding: 10px 14px;
}
.ds2-claim-text { font-size: 12px; color: rgba(240,242,245,0.50); line-height: 1.65; }

/* Flash */
.ds2-flash {
  display: flex; align-items: center; gap: 10px;
  border: 1px solid; border-radius: 10px; padding: 10px 14px;
}

/* Form */
.ds2-form { display: flex; flex-direction: column; gap: 16px; }
.ds2-field { display: flex; flex-direction: column; gap: 7px; }
.ds2-field-top { display: flex; align-items: center; justify-content: space-between; }
.ds2-label { font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.30); text-transform: uppercase; letter-spacing: 0.12em; }
.ds2-char  { font-size: 10px; font-family: 'DM Mono', monospace; transition: color 0.2s; display: flex; align-items: center; }
.ds2-hint  { font-size: 11px; color: rgba(240,242,245,0.28); line-height: 1.6; }

/* Textarea */
.ds2-textarea-wrap {
  border: 1px solid rgba(240,242,245,0.10); border-radius: 10px;
  background: rgba(240,242,245,0.03); overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.ds2-textarea-wrap:focus-within { border-color: rgba(196,255,70,0.35); box-shadow: 0 0 0 3px rgba(196,255,70,0.06); }
.ds2-textarea-wrap--ok { border-color: rgba(74,222,128,0.28); box-shadow: 0 0 0 3px rgba(74,222,128,0.05); }
.ds2-textarea {
  width: 100%; background: transparent; border: none; outline: none;
  padding: 13px 15px; color: #f0f2f5;
  font-family: 'DM Sans', sans-serif; font-size: 13px; line-height: 1.75;
  resize: vertical; min-height: 110px;
}
.ds2-textarea::placeholder { color: rgba(240,242,245,0.20); }

/* Dropzone */
.ds2-dropzone {
  border: 1px dashed rgba(240,242,245,0.10); border-radius: 10px;
  padding: 20px 18px; cursor: pointer;
  background: rgba(240,242,245,0.02);
  transition: border-color 0.2s, background 0.2s;
}
.ds2-dropzone:hover, .ds2-dropzone--over {
  border-color: rgba(196,255,70,0.30); background: rgba(196,255,70,0.02);
}
.ds2-dz-inner { display: flex; align-items: center; gap: 14px; }
.ds2-dz-icon {
  width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(240,242,245,0.05); border: 1px solid rgba(240,242,245,0.08);
  color: rgba(240,242,245,0.28);
}
.ds2-dz-text { font-size: 12px; color: rgba(240,242,245,0.45); margin-bottom: 2px; }
.ds2-dz-link { color: #c4ff46; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.ds2-dz-sub  { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.22); }

/* File list */
.ds2-file-list { display: flex; flex-direction: column; gap: 5px; margin-top: 4px; }
.ds2-file-row {
  display: flex; align-items: center; gap: 9px;
  background: rgba(74,222,128,0.05); border: 1px solid rgba(74,222,128,0.12);
  border-radius: 8px; padding: 7px 12px;
}
.ds2-file-icon { font-size: 12px; flex-shrink: 0; }
.ds2-file-name { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.50); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds2-file-view { font-size: 10px; font-family: 'DM Mono', monospace; color: #4ade80; text-decoration: none; flex-shrink: 0; }
.ds2-file-rm {
  width: 20px; height: 20px; border-radius: 5px; flex-shrink: 0;
  background: rgba(240,242,245,0.05); border: 1px solid rgba(240,242,245,0.08);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: rgba(240,242,245,0.28); transition: all 0.15s;
}
.ds2-file-rm:hover { background: rgba(248,113,113,0.10); border-color: rgba(248,113,113,0.25); color: #f87171; }

/* Errors */
.ds2-err-sm  { font-size: 10px; font-family: 'DM Mono', monospace; color: #f87171; }
.ds2-err-box {
  display: flex; align-items: flex-start; gap: 8px;
  background: rgba(248,113,113,0.07); border: 1px solid rgba(248,113,113,0.20);
  border-radius: 9px; padding: 10px 13px;
  font-size: 12px; color: #f87171; font-family: 'DM Mono', monospace;
}

/* Submit CTA */
.ds2-cta { display: flex; flex-direction: column; gap: 8px; }
.ds2-submit {
  width: 100%; height: 46px; border-radius: 11px; cursor: not-allowed;
  background: rgba(240,242,245,0.05); border: 1px solid rgba(240,242,245,0.10);
  display: flex; align-items: center; justify-content: center; gap: 8px;
  font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 700;
  color: rgba(240,242,245,0.25); letter-spacing: -0.02em;
  transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
}
.ds2-submit--active {
  cursor: pointer; color: #0b0c0d; border-color: transparent;
  box-shadow: 0 4px 20px rgba(100,150,255,0.22);
}
.ds2-submit--active:hover { opacity: 0.88; transform: translateY(-1px); box-shadow: 0 8px 32px rgba(100,150,255,0.30); }
.ds2-submit--active:active { transform: translateY(0); }
.ds2-submit:disabled { opacity: 0.42; cursor: not-allowed; transform: none !important; }
.ds2-submit-note { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.20); text-align: center; }

/* Statement cards */
.ds2-stmt-card { background: rgba(240,242,245,0.02); border: 1px solid; border-radius: 12px; overflow: hidden; }
.ds2-stmt-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 11px 15px; border-bottom: 1px solid;
}
.ds2-stmt-party { display: flex; align-items: center; gap: 10px; }
.ds2-avatar {
  width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-family: 'DM Mono', monospace; font-weight: 800; border: 1px solid;
}
.ds2-stmt-name { font-size: 12px; font-weight: 600; color: #f0f2f5; letter-spacing: -0.01em; }
.ds2-stmt-time { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.28); margin-top: 1px; }
.ds2-badge {
  font-size: 9px; font-family: 'DM Mono', monospace; font-weight: 700;
  letter-spacing: 0.04em; border: 1px solid; border-radius: 5px; padding: 2px 8px; white-space: nowrap;
}
.ds2-badge--ok { color: #4ade80; background: rgba(74,222,128,0.10); border-color: rgba(74,222,128,0.25); }
.ds2-stmt-body { padding: 14px 15px; display: flex; flex-direction: column; gap: 12px; }
.ds2-stmt-text { font-size: 12px; color: rgba(240,242,245,0.70); line-height: 1.78; white-space: pre-wrap; margin: 0; }
.ds2-no-ev     { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.25); }

/* Evidence */
.ds2-evidence       { display: flex; flex-direction: column; gap: 5px; }
.ds2-evidence-label { font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.25); text-transform: uppercase; letter-spacing: 0.09em; margin-bottom: 4px; }
.ds2-ev-item {
  display: flex; align-items: center; gap: 8px; padding: 5px 10px;
  border-radius: 6px; border: 1px solid; text-decoration: none;
  font-size: 10px; font-family: 'DM Mono', monospace;
  transition: opacity 0.15s;
}
.ds2-ev-item:hover { opacity: 0.70; }
.ds2-ev-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Waiting */
.ds2-waiting {
  display: flex; align-items: center; gap: 10px; padding: 12px 15px;
  background: rgba(240,242,245,0.02); border: 1px solid rgba(240,242,245,0.07);
  border-radius: 10px;
}
.ds2-waiting-text { font-size: 11px; color: rgba(240,242,245,0.35); font-family: 'DM Mono', monospace; }

/* Spinners */
.ds2-spinner {
  display: inline-block; flex-shrink: 0; width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid rgba(196,255,70,0.15); border-top-color: #c4ff46;
  animation: ds2Spin 0.65s linear infinite;
}
.ds2-spinner--dark { border-color: rgba(0,0,0,0.15); border-top-color: #0b0c0d; }

/* Verdict card */
.ds2-verdict {
  background: rgba(240,242,245,0.02); border: 1px solid; border-radius: 13px; overflow: hidden;
}
.ds2-verdict--flash { animation: ds2VerdictFlash 4s ease; }
@keyframes ds2VerdictFlash { 0% { box-shadow: 0 0 0 3px rgba(74,222,128,0.22); } 100% { box-shadow: none; } }

.ds2-verdict-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 16px; border-bottom: 1px solid; background: rgba(240,242,245,0.01);
}
.ds2-verdict-head-left { display: flex; align-items: center; gap: 11px; }
.ds2-verdict-icon {
  width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; border: 1px solid;
}
.ds2-verdict-title { font-size: 12px; font-weight: 700; color: #f0f2f5; margin-bottom: 2px; }
.ds2-verdict-model { font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.28); }

.ds2-confidence       { display: flex; align-items: center; gap: 8px; }
.ds2-confidence-label { font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.28); }
.ds2-confidence-bar   { width: 70px; height: 3px; background: rgba(240,242,245,0.06); border-radius: 2px; overflow: hidden; }
.ds2-confidence-fill  { height: 100%; border-radius: 2px; transition: width 0.8s cubic-bezier(0.16,1,0.3,1); }
.ds2-confidence-pct   { font-size: 11px; font-family: 'DM Mono', monospace; font-weight: 700; }

.ds2-verdict-body { padding: 15px 16px; display: flex; flex-direction: column; gap: 14px; }
.ds2-verdict-pill {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 12px; font-weight: 700; font-family: 'DM Mono', monospace;
  padding: 7px 14px; border-radius: 8px; border: 1px solid;
}
.ds2-verdict-split { font-size: 10px; opacity: 0.65; font-weight: 400; margin-left: 4px; }

.ds2-vsection       { display: flex; flex-direction: column; gap: 6px; }
.ds2-vsection-label { font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.28); text-transform: uppercase; letter-spacing: 0.10em; }
.ds2-reasoning      { font-size: 12px; color: rgba(240,242,245,0.65); line-height: 1.75; margin: 0; }

.ds2-factors { display: flex; flex-direction: column; gap: 4px; }
.ds2-factor  { display: flex; align-items: flex-start; gap: 8px; font-size: 11px; color: rgba(240,242,245,0.65); padding: 5px 10px; background: rgba(240,242,245,0.03); border: 1px solid rgba(240,242,245,0.07); border-radius: 6px; }

.ds2-warnings { display: flex; flex-direction: column; gap: 4px; }
.ds2-warning  { display: flex; align-items: flex-start; gap: 8px; font-size: 11px; color: #fbbf24; padding: 5px 10px; background: rgba(251,191,36,0.05); border: 1px solid rgba(251,191,36,0.15); border-radius: 6px; }

.ds2-verdict-footer {
  display: flex; align-items: center; gap: 7px;
  padding: 9px 16px; border-top: 1px solid rgba(240,242,245,0.06);
  font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,242,245,0.25);
}

/* Animations */
.ds2-fade-up  { animation: ds2FadeUp 0.35s ease both; }
.ds2-fade-in  { animation: ds2FadeIn 0.25s ease both; }
.ds2-d1       { animation-delay: 0.06s; }
@keyframes ds2FadeUp  { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ds2FadeIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes ds2Spin    { to { transform: rotate(360deg); } }
@keyframes ds2Pulse   { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.78); } }
`;
