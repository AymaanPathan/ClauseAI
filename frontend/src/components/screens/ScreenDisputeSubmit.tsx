"use client";
// ============================================================
// ScreenDisputeSubmit.tsx
// Step 1 of Arbitration: Statement + Evidence Upload
//
// This screen is shown to BOTH parties when a milestone is disputed.
// Each party sees their own submission form.
// Once both submit → AI verdict auto-triggers → screen transitions to ScreenAIVerdict.
//
// Props:
//   agreementId      — e.g. "ABC123"
//   milestoneIndex   — which milestone is disputed
//   party            — "A" (payer) or "B" (receiver)
//   milestoneName    — e.g. "Wireframes Approved"
//   milestoneAmount  — e.g. "$180"
//   onVerdictReady   — called when AI verdict is ready (transitions to step 2)
// ============================================================

import { useState, useRef, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Props {
  agreementId: string;
  milestoneIndex: number;
  party: "A" | "B";
  milestoneName: string;
  milestoneAmount: string;
  onVerdictReady: () => void;
  onBack?: () => void;
}

interface UploadedFile {
  file: File;
  url: string | null; // null while uploading
  uploading: boolean;
  error: string | null;
  preview?: string; // for images
}

export default function ScreenDisputeSubmit({
  agreementId,
  milestoneIndex,
  party,
  milestoneName,
  milestoneAmount,
  onVerdictReady,
  onBack,
}: Props) {
  const [statement, setStatement] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [polling, setPolling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const isPartyA = party === "A";
  const partyColor = isPartyA ? "#f5c400" : "#22c55e";
  const partyLabel = isPartyA ? "Payer (Party A)" : "Receiver (Party B)";
  const partyIcon = isPartyA ? "💸" : "🎯";
  const otherParty = isPartyA ? "Receiver" : "Payer";

  const canSubmit =
    statement.trim().length >= 20 &&
    !submitting &&
    !submitted &&
    files.every((f) => !f.uploading);

  // ── File upload ───────────────────────────────────────────
  async function uploadFile(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("files", file);

    const res = await fetch(`${API_BASE}/api/arbitrate/upload`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!data.success || !data.urls?.[0]) {
      throw new Error(data.error ?? "Upload failed");
    }
    return data.urls[0] as string;
  }

  function addFiles(newFiles: File[]) {
    const MAX_FILES = 5;
    const MAX_SIZE_MB = 10;

    const valid = newFiles.filter((f) => {
      if (f.size > MAX_SIZE_MB * 1024 * 1024) return false;
      return true;
    });

    if (files.length + valid.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} files allowed`);
      return;
    }

    const entries: UploadedFile[] = valid.map((f) => ({
      file: f,
      url: null,
      uploading: true,
      error: null,
      preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
    }));

    setFiles((prev) => [...prev, ...entries]);

    // Upload each file
    entries.forEach((entry, i) => {
      const idx = files.length + i;
      uploadFile(entry.file)
        .then((url) => {
          setFiles((prev) => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], url, uploading: false };
            return updated;
          });
        })
        .catch((err) => {
          setFiles((prev) => {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              uploading: false,
              error: err.message ?? "Upload failed",
            };
            return updated;
          });
        });
    });
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length) addFiles(selected);
    e.target.value = ""; // reset input
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) addFiles(dropped);
  }

  // ── Poll for verdict after submission ─────────────────────
  const startPolling = useCallback(() => {
    setPolling(true);
    let attempts = 0;
    const MAX_ATTEMPTS = 40; // 40 × 3s = 2min

    pollIntervalRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(
          `${API_BASE}/api/arbitrate/${agreementId}/${milestoneIndex}`,
        );
        const data = await res.json();
        if (
          data.dispute?.status === "ai_complete" ||
          data.dispute?.status === "resolved"
        ) {
          clearInterval(pollIntervalRef.current!);
          setPolling(false);
          onVerdictReady();
        }
        if (attempts >= MAX_ATTEMPTS) {
          clearInterval(pollIntervalRef.current!);
          setPolling(false);
          setError(
            "AI verdict is taking longer than expected. Please refresh.",
          );
        }
      } catch {
        // ignore poll errors
      }
    }, 3000);
  }, [agreementId, milestoneIndex, onVerdictReady]);

  // ── Submit statement ──────────────────────────────────────
  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const evidenceUrls = files
        .filter((f) => f.url !== null)
        .map((f) => f.url!);

      const res = await fetch(`${API_BASE}/api/arbitrate/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agreement_id: agreementId,
          milestone_index: milestoneIndex,
          party,
          statement: statement.trim(),
          evidence_urls: evidenceUrls,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Submission failed");

      setSubmitted(true);

      // If both parties have submitted, AI is already running — poll for result
      if (
        data.dispute?.status === "ai_pending" ||
        data.dispute?.status === "ai_complete"
      ) {
        startPolling();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  // ─────────────────────────────────────────────────────────
  return (
    <div style={styles.root}>
      <style>{css}</style>

      {/* Back */}
      {onBack && !submitted && (
        <button onClick={onBack} style={styles.backBtn}>
          ← Back to Dashboard
        </button>
      )}

      {/* Header */}
      <div style={styles.header} className="dispute-fade-in">
        <div
          style={{
            ...styles.partyBadge,
            color: partyColor,
            borderColor: `${partyColor}40`,
            background: `${partyColor}10`,
          }}
        >
          {partyIcon} {partyLabel}
        </div>
        <h2 style={styles.title}>Submit Your Dispute Statement</h2>
        <p style={styles.subtitle}>
          Your statement and evidence will be reviewed by AI and the arbitrator.
          Be specific, factual, and reference the contract terms.
        </p>

        {/* Milestone context */}
        <div style={styles.milestoneCard}>
          <div
            style={{
              fontSize: 11,
              fontFamily: "monospace",
              color: "#64748b",
              marginBottom: 4,
            }}
          >
            DISPUTED MILESTONE
          </div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{milestoneName}</div>
          <div
            style={{
              fontSize: 13,
              color: partyColor,
              fontFamily: "monospace",
              marginTop: 4,
            }}
          >
            {milestoneAmount} at stake
          </div>
        </div>
      </div>

      {submitted ? (
        // ── Submitted state ──────────────────────────────────
        <div style={styles.submittedBox} className="dispute-fade-in">
          <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
          <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
            Statement Submitted
          </h3>
          <p
            style={{
              fontSize: 14,
              color: "#94a3b8",
              lineHeight: 1.7,
              marginBottom: 20,
            }}
          >
            Your statement has been recorded. Once {otherParty} submits their
            statement, the AI will analyze both and generate a verdict.
          </p>

          {polling && (
            <div style={styles.pollingBox}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Spinner color="#f5c400" />
                <div>
                  <div
                    style={{ fontSize: 13, fontWeight: 600, color: "#f5c400" }}
                  >
                    Both parties submitted — AI analyzing...
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    This usually takes 5–15 seconds
                  </div>
                </div>
              </div>
            </div>
          )}

          {!polling && (
            <div style={styles.waitingBox}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <PulseDot color="#f59e0b" />
                <span style={{ fontSize: 13, color: "#f59e0b" }}>
                  Waiting for {otherParty} to submit their statement
                </span>
              </div>
            </div>
          )}

          {/* Summary of what was submitted */}
          <div style={styles.summaryCard}>
            <div
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                color: "#475569",
                marginBottom: 10,
              }}
            >
              YOUR SUBMISSION
            </div>
            <p
              style={{
                fontSize: 13,
                color: "#94a3b8",
                lineHeight: 1.6,
                marginBottom: 10,
              }}
            >
              {statement.substring(0, 200)}
              {statement.length > 200 ? "..." : ""}
            </p>
            {files.filter((f) => f.url).length > 0 && (
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: "#22c55e",
                }}
              >
                ✅ {files.filter((f) => f.url).length} evidence file(s) uploaded
              </div>
            )}
          </div>
        </div>
      ) : (
        // ── Statement form ───────────────────────────────────
        <div
          className="dispute-fade-in"
          style={{ display: "flex", flexDirection: "column", gap: 20 }}
        >
          {/* Tips */}
          <div style={styles.tipsBox}>
            <div
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                color: "#f5c400",
                marginBottom: 8,
              }}
            >
              ⚖️ TIPS FOR A STRONG STATEMENT
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {isPartyA ? (
                <>
                  <Tip text="Describe specifically what was NOT delivered or was defective" />
                  <Tip text="Reference exact contract terms that weren't met" />
                  <Tip text="Include any communications showing non-compliance" />
                  <Tip text="Attach screenshots, files, or messages as evidence" />
                </>
              ) : (
                <>
                  <Tip text="Describe exactly what you delivered and when" />
                  <Tip text="Reference the contract's delivery conditions and show you met them" />
                  <Tip text="Include proof of delivery: links, screenshots, files" />
                  <Tip text="Explain why any objections from Party A are outside the contract scope" />
                </>
              )}
            </div>
          </div>

          {/* Statement textarea */}
          <div>
            <label style={styles.label}>
              Your Statement <span style={{ color: "#ef4444" }}>*</span>
              <span style={{ color: "#475569", fontWeight: 400 }}>
                {" "}
                (minimum 20 characters)
              </span>
            </label>
            <textarea
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder={
                isPartyA
                  ? "Describe why you believe the milestone was NOT completed as agreed. Be specific about what was promised vs. what was delivered..."
                  : "Describe how you completed the milestone as agreed. Reference specific deliverables and when they were provided..."
              }
              rows={7}
              style={{
                ...styles.textarea,
                borderColor:
                  statement.length > 0 && statement.length < 20
                    ? "#ef444460"
                    : statement.length >= 20
                      ? "#22c55e40"
                      : "#1f2937",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 6,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "#475569",
                  fontFamily: "monospace",
                }}
              >
                {statement.length < 20
                  ? `${20 - statement.length} more characters needed`
                  : "✓ Length ok"}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: statement.length > 1800 ? "#ef4444" : "#475569",
                }}
              >
                {statement.length}/2000
              </span>
            </div>
          </div>

          {/* Evidence upload */}
          <div>
            <label style={styles.label}>
              Evidence Files{" "}
              <span style={{ color: "#475569", fontWeight: 400 }}>
                (optional — up to 5 files, 10MB each)
              </span>
            </label>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              style={{
                ...styles.dropZone,
                borderColor: dragOver ? partyColor : "#1f2937",
                background: dragOver ? `${partyColor}08` : "#0f172a",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf"
                onChange={handleFileInput}
                style={{ display: "none" }}
              />
              <div style={{ fontSize: 24, marginBottom: 8 }}>📎</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Click or drag files here
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#475569",
                  fontFamily: "monospace",
                }}
              >
                Images, PDFs — screenshots, contracts, delivery confirmations
              </div>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                {files.map((f, i) => (
                  <div key={i} style={styles.fileRow}>
                    {/* Preview / icon */}
                    <div style={styles.fileThumb}>
                      {f.preview ? (
                        <img
                          src={f.preview}
                          alt=""
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            borderRadius: 4,
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: 16 }}>
                          {f.file.name.endsWith(".pdf") ? "📄" : "📁"}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {f.file.name}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          fontFamily: "monospace",
                          color: "#475569",
                          marginTop: 2,
                        }}
                      >
                        {(f.file.size / 1024).toFixed(1)} KB
                        {f.uploading && " · Uploading..."}
                        {f.url && " · ✅ Uploaded"}
                        {f.error && ` · ❌ ${f.error}`}
                      </div>
                      {f.uploading && (
                        <div style={styles.uploadBar}>
                          <div
                            style={{
                              ...styles.uploadBarFill,
                              animation:
                                "upload-progress 1.5s ease-in-out infinite",
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Status + remove */}
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      {f.uploading && <Spinner color="#f5c400" size={14} />}
                      {f.url && (
                        <span style={{ color: "#22c55e", fontSize: 14 }}>
                          ✓
                        </span>
                      )}
                      {f.error && (
                        <span style={{ color: "#ef4444", fontSize: 14 }}>
                          ✗
                        </span>
                      )}
                      <button
                        onClick={() => removeFile(i)}
                        style={styles.removeBtn}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && <div style={styles.errorBox}>❌ {error}</div>}

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              ...styles.submitBtn,
              background: canSubmit ? partyColor : "#1e293b",
              color: canSubmit ? "#0a0a0a" : "#475569",
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {submitting ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Spinner color="#0a0a0a" /> Submitting...
              </span>
            ) : (
              "Submit Statement & Evidence →"
            )}
          </button>

          <p
            style={{
              textAlign: "center",
              fontSize: 12,
              color: "#475569",
              fontFamily: "monospace",
            }}
          >
            Once submitted, your statement cannot be changed. Both parties must
            submit before AI analysis begins.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function Tip({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        fontSize: 12,
        color: "#94a3b8",
        alignItems: "flex-start",
      }}
    >
      <span style={{ color: "#f5c400", flexShrink: 0 }}>→</span>
      <span>{text}</span>
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
        animation: "dispute-spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

function PulseDot({ color = "#f59e0b" }: { color?: string }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        animation: "dispute-pulse 1.4s ease-in-out infinite",
      }}
    />
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    maxWidth: 640,
    width: "100%",
    margin: "0 auto",
    padding: "40px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
    color: "#f1f5f9",
    fontFamily: "system-ui, sans-serif",
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "#64748b",
    fontSize: 13,
    cursor: "pointer",
    alignSelf: "flex-start",
    padding: 0,
  },
  header: { display: "flex", flexDirection: "column", gap: 12 },
  partyBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontFamily: "monospace",
    fontWeight: 700,
    border: "1px solid",
    borderRadius: 99,
    padding: "4px 12px",
    alignSelf: "flex-start",
  },
  title: { fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", margin: 0 },
  subtitle: { fontSize: 14, color: "#94a3b8", lineHeight: 1.7, margin: 0 },
  milestoneCard: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: 10,
    padding: "14px 18px",
  },
  tipsBox: {
    background: "#0f172a",
    border: "1px solid #f5c40020",
    borderRadius: 10,
    padding: "14px 18px",
  },
  label: {
    display: "block",
    fontSize: 12,
    fontFamily: "monospace",
    color: "#94a3b8",
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
    marginBottom: 8,
    fontWeight: 700,
  },
  textarea: {
    width: "100%",
    background: "#0f172a",
    border: "1px solid",
    borderRadius: 10,
    padding: "14px 16px",
    color: "#f1f5f9",
    fontSize: 14,
    lineHeight: 1.7,
    outline: "none",
    fontFamily: "system-ui, sans-serif",
    resize: "vertical" as const,
    boxSizing: "border-box" as const,
    transition: "border-color 0.2s",
  },
  dropZone: {
    border: "2px dashed",
    borderRadius: 10,
    padding: "28px 20px",
    textAlign: "center" as const,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "#0f172a",
    border: "1px solid #1f2937",
    borderRadius: 8,
    padding: "10px 14px",
  },
  fileThumb: {
    width: 36,
    height: 36,
    background: "#1e293b",
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  },
  uploadBar: {
    height: 2,
    background: "#1e293b",
    borderRadius: 1,
    overflow: "hidden",
    marginTop: 4,
  },
  uploadBarFill: {
    height: "100%",
    width: "40%",
    background: "#f5c400",
    borderRadius: 1,
  },
  removeBtn: {
    background: "none",
    border: "none",
    color: "#475569",
    cursor: "pointer",
    fontSize: 16,
    lineHeight: 1,
    width: 20,
    height: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    padding: 0,
  },
  errorBox: {
    background: "#7f1d1d20",
    border: "1px solid #991b1b",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: "#fca5a5",
  },
  submitBtn: {
    width: "100%",
    padding: "16px",
    border: "none",
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 700,
    transition: "all 0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  submittedBox: {
    background: "#0f172a",
    border: "1px solid #22c55e30",
    borderRadius: 14,
    padding: "32px 24px",
    textAlign: "center" as const,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 0,
  },
  pollingBox: {
    background: "#f5c40010",
    border: "1px solid #f5c40030",
    borderRadius: 8,
    padding: "12px 16px",
    marginTop: 16,
    width: "100%",
  },
  waitingBox: {
    background: "#f59e0b10",
    border: "1px solid #f59e0b30",
    borderRadius: 8,
    padding: "12px 16px",
    marginTop: 16,
    width: "100%",
  },
  summaryCard: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: 8,
    padding: "14px 16px",
    marginTop: 16,
    textAlign: "left" as const,
    width: "100%",
  },
};

const css = `
@keyframes dispute-spin { to { transform: rotate(360deg); } }
@keyframes dispute-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
@keyframes dispute-fade-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes upload-progress {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}
.dispute-fade-in { animation: dispute-fade-in 0.4s ease both; }
`;
