"use client";
// ============================================================
// components/screens/Shared/DisputeSubmitScreen.tsx
// ============================================================

import { useState, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

interface Props {
  agreementId: string;
  milestoneIndex: number;
  party: "A" | "B";
  milestoneDescription: string;
  contractTerms: ContractTerms; // ← now required; auto-opens dispute if needed
  onSubmitted?: () => void;
}

interface UploadedFile {
  url: string;
  name: string;
  isImage: boolean;
}

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
  const fileRef = useRef<HTMLInputElement>(null);

  const isA = party === "A";
  const partyColor = isA ? "#60a5fa" : "#f472b6";
  const partyLabel = isA ? "Party A (Payer)" : "Party B (Receiver)";
  const claim = isA
    ? "You are claiming the milestone was NOT completed as agreed."
    : "You are claiming the milestone WAS completed as agreed.";

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
          name: selected[i]?.name ?? url.split("/").pop() ?? url,
          isImage: /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url),
        }),
      );
      setUploadedFiles((prev) => [...prev, ...newFiles]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    handleFileUpload(dropped);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    handleFileUpload(selected);
  }

  function removeFile(idx: number) {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== idx));
  }

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
          contract_terms: contractTerms, // ← the key fix
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `Submit failed: ${res.status}`);
      }
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="submit-root">
        <style>{css}</style>
        <div className="success-card fade-up">
          <div className="success-icon">✓</div>
          <h2 className="success-title">Statement Submitted</h2>
          <p className="success-desc">
            Your statement and {uploadedFiles.length} evidence file
            {uploadedFiles.length !== 1 ? "s" : ""} have been received. The
            arbitrator will be notified once both parties have submitted.
          </p>
          <div className="success-badge">
            Waiting for {isA ? "Party B" : "Party A"} to submit their statement
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="submit-root">
      <style>{css}</style>
      <div className="submit-container fade-up">
        {/* Header */}
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
          <h2 className="submit-title">Submit Dispute Statement</h2>
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

        {/* Statement */}
        <div className="section">
          <label className="section-label">Your Statement</label>
          <p className="section-hint">
            Describe{" "}
            {isA
              ? "why the milestone was not completed as agreed"
              : "how and when you completed the milestone"}
            . Be specific and factual — the arbitrator will use this alongside
            your evidence.
          </p>
          <textarea
            className="statement-input"
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder={
              isA
                ? "e.g. The deliverable did not meet the agreed specifications because…"
                : "e.g. I completed the work on [date] by delivering [specific items]…"
            }
            rows={6}
          />
          <div
            className="char-count"
            style={{
              color:
                statement.length < 10 ? "#f87171" : "rgba(240,250,245,0.25)",
            }}
          >
            {statement.length} chars {statement.length < 10 ? "(min 10)" : "✓"}
          </div>
        </div>

        {/* Evidence Upload */}
        <div className="section">
          <label className="section-label">Evidence Files</label>
          <p className="section-hint">
            Upload documents, screenshots, emails, contracts, or any proof
            relevant to your case. Accepted: JPG, PNG, PDF, GIF, WebP, MP4.
          </p>
          <div
            className="dropzone"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.pdf,.gif,.webp,.svg,.mp4"
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />
            {uploading ? (
              <div className="dz-uploading">
                <span className="spinner" />
                <span>Uploading files…</span>
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
                  Drop files here or <span className="dz-link">browse</span>
                </div>
                <div className="dz-sub">JPG · PNG · PDF · GIF · WebP · MP4</div>
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
                    onClick={() => removeFile(i)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {submitError && <div className="error-box fade-in">{submitError}</div>}

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
      </div>
    </div>
  );
}

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .submit-root { font-family: 'DM Sans', sans-serif; color: #f0faf5; background: #080c0a; min-height: 100vh; padding: 36px 24px 80px; display: flex; align-items: flex-start; justify-content: center; }
  .submit-container { width: 100%; max-width: 640px; display: flex; flex-direction: column; gap: 24px; }
  .submit-header { display: flex; flex-direction: column; gap: 12px; }
  .submit-badge { display: inline-flex; align-self: flex-start; font-size: 10px; font-family: 'DM Mono', monospace; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; border: 1px solid; border-radius: 8px; padding: 4px 12px; }
  .submit-title { font-family: 'DM Serif Display', serif; font-size: 32px; letter-spacing: -0.02em; color: #f0faf5; }
  .submit-milestone { font-size: 13px; color: rgba(240,250,245,0.5); line-height: 1.5; }
  .ms-label { font-family: 'DM Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(240,250,245,0.3); margin-right: 6px; }
  .claim-box { display: flex; align-items: center; gap: 10px; border: 1px solid; border-radius: 10px; padding: 10px 14px; }
  .claim-text { font-size: 13px; color: rgba(240,250,245,0.6); }
  .section { background: rgba(12,18,14,0.8); border: 1px solid rgba(52,211,153,0.1); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
  .section-label { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.35); text-transform: uppercase; letter-spacing: 0.1em; }
  .section-hint { font-size: 12px; color: rgba(240,250,245,0.4); line-height: 1.65; }
  .statement-input { width: 100%; background: rgba(240,250,245,0.04); border: 1px solid rgba(240,250,245,0.1); border-radius: 10px; padding: 14px 16px; color: #f0faf5; resize: vertical; font-family: 'DM Sans', sans-serif; font-size: 14px; line-height: 1.7; outline: none; transition: border-color 0.2s; }
  .statement-input:focus { border-color: rgba(52,211,153,0.3); }
  .statement-input::placeholder { color: rgba(240,250,245,0.2); }
  .char-count { font-size: 10px; font-family: 'DM Mono', monospace; text-align: right; }
  .dropzone { border: 1px dashed rgba(240,250,245,0.15); border-radius: 12px; padding: 28px; cursor: pointer; transition: border-color 0.2s, background 0.2s; background: rgba(240,250,245,0.02); }
  .dropzone:hover { border-color: rgba(52,211,153,0.3); background: rgba(52,211,153,0.03); }
  .dz-idle { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .dz-icon { color: rgba(240,250,245,0.25); }
  .dz-text { font-size: 13px; color: rgba(240,250,245,0.45); }
  .dz-link { color: #34d399; text-decoration: underline; text-underline-offset: 2px; }
  .dz-sub { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.2); }
  .dz-uploading { display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 13px; color: rgba(240,250,245,0.5); }
  .file-list { display: flex; flex-direction: column; gap: 7px; }
  .file-chip { display: flex; align-items: center; gap: 8px; background: rgba(52,211,153,0.05); border: 1px solid rgba(52,211,153,0.15); border-radius: 8px; padding: 8px 12px; }
  .file-chip-icon { font-size: 14px; flex-shrink: 0; }
  .file-chip-name { font-size: 12px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.6); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-chip-link { font-size: 11px; color: #34d399; text-decoration: none; flex-shrink: 0; }
  .file-chip-remove { background: none; border: none; cursor: pointer; color: rgba(240,250,245,0.3); font-size: 16px; line-height: 1; flex-shrink: 0; padding: 0; transition: color 0.2s; }
  .file-chip-remove:hover { color: #f87171; }
  .error-sm { font-size: 11px; font-family: 'DM Mono', monospace; color: #f87171; }
  .error-box { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); border-radius: 10px; padding: 12px 16px; font-size: 12px; color: #f87171; font-family: 'DM Mono', monospace; }
  .btn-submit { width: 100%; padding: 15px 24px; border: none; border-radius: 12px; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 600; color: #080c0a; display: flex; align-items: center; justify-content: center; gap: 8px; transition: opacity 0.2s, transform 0.15s; }
  .btn-submit:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
  .btn-submit:active:not(:disabled) { transform: translateY(0); }
  .btn-submit:disabled { opacity: 0.4; cursor: not-allowed; }
  .submit-note { font-size: 11px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.25); text-align: center; }
  .success-card { max-width: 480px; margin: 80px auto; background: rgba(12,18,14,0.8); border: 1px solid rgba(52,211,153,0.2); border-radius: 20px; padding: 48px; display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; }
  .success-icon { font-size: 48px; color: #34d399; }
  .success-title { font-family: 'DM Serif Display', serif; font-size: 28px; color: #f0faf5; }
  .success-desc { font-size: 14px; color: rgba(240,250,245,0.55); line-height: 1.7; }
  .success-badge { font-size: 11px; font-family: 'DM Mono', monospace; background: rgba(52,211,153,0.08); border: 1px solid rgba(52,211,153,0.2); color: #34d399; border-radius: 8px; padding: 7px 14px; }
  .spinner { display: inline-block; border: 2px solid rgba(52,211,153,0.2); border-top-color: #34d399; border-radius: 50%; animation: spin 0.7s linear infinite; width: 18px; height: 18px; }
  .spinner.sm { width: 14px; height: 14px; }
  .spinner.dark { border-color: rgba(8,12,10,0.3); border-top-color: #080c0a; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .fade-up { animation: fadeUp 0.4s ease both; }
  .fade-in { animation: fadeIn 0.3s ease both; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
`;
