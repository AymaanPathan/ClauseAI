"use client";

import { useState, useEffect, useRef } from "react";

import {
  setScreen,
  generateShareLink,
  registerPartyAPresenceThunk,
  saveAgreementToDbThunk,
  applyApprovalUpdate,
  setPartyBConnected,
} from "@/store/slices/partyASlice";
import { subscribeApproval } from "@/api/approvalApi";
import { hashTerms } from "@/api/PresenceaApi";
import { isV2, ParsedAgreementV2 } from "@/api/parseApi";
import { usdToSatsPreview } from "@/lib/contractCalls";
import { AppDispatch, RootState } from "@/store";
import { useDispatch, useSelector } from "react-redux";

export default function ScreenShareLink() {
  const dispatch = useDispatch<AppDispatch>();
  const {
    shareLink,
    agreementId,
    walletAddress,
    editedTerms,
    partyBConnected,
    partyBWallet,
    partyBApproved,
    presenceRegistered,
  } = useSelector((s: RootState) => s.partyA);

  const [copied, setCopied] = useState(false);
  // Track whether we've already saved the stub to DB this session
  const dbSavedRef = useRef(false);
  const unsubRef = useRef<(() => void) | null>(null);
  const receiverName =
    (editedTerms as any)?.receiver ??
    (editedTerms as any)?.partyB ??
    "the receiver";

  // Generate share link on mount
  useEffect(() => {
    if (!shareLink) dispatch(generateShareLink());
  }, []);

  // ── Effect 1: Save agreement stub to MongoDB as soon as agreementId + terms
  //   are available — NO wallet required. This guarantees Party B's
  //   /milestones fetch never gets a 404, even though wallet connection
  //   happens at step 6 (after this step 5 screen).
  //   ScreenLockFunds will call saveAgreementToDbThunk again later to
  //   overwrite partyA wallet, milestones amounts, and txId — that's fine
  //   because the backend uses findOneAndUpdate (upsert), so last-write wins.
  useEffect(() => {
    if (!agreementId || !editedTerms || dbSavedRef.current) return;
    dbSavedRef.current = true; // prevent duplicate saves on re-renders

    const terms = editedTerms as unknown as Record<string, unknown>;
    const amountUsd = parseFloat(
      String(terms?.total_usd ?? terms?.amount_usd ?? "0"),
    );
    const totalSats = usdToSatsPreview(amountUsd);

    // Build milestone stubs from V2 terms if available
    let milestoneStubs: Array<{
      index: number;
      title: string;
      percentage: number;
      condition: string;
      deadline?: string;
      amountUsd: string;
      amountSats: number;
    }> = [];

    if (isV2(editedTerms)) {
      const v2 = editedTerms as unknown as ParsedAgreementV2;
      milestoneStubs = (v2.milestones ?? []).map((m, i) => ({
        index: i,
        title: m.title || `Milestone ${i + 1}`,
        percentage: m.percentage ?? 0,
        condition: m.condition || "",
        deadline: m.deadline || undefined,
        amountUsd: ((amountUsd * (m.percentage ?? 0)) / 100).toFixed(2),
        amountSats: Math.round((totalSats * (m.percentage ?? 0)) / 100),
      }));
    }

    // Use walletAddress if already connected, otherwise fall back to the
    // payer name from terms as a placeholder. The real wallet address will
    // be written by ScreenLockFunds once the wallet is connected.
    const partyAIdentifier =
      walletAddress ?? String(terms?.payer ?? terms?.partyA ?? "pending");

    dispatch(
      saveAgreementToDbThunk({
        agreementId: agreementId!,
        partyA: partyAIdentifier,
        partyB: String(terms?.receiver ?? terms?.partyB ?? ""),
        arbitrator: String(terms?.arbitrator ?? ""),
        totalAmountUsd: amountUsd,
        totalAmountSats: totalSats,
        terms: terms,
        milestones: milestoneStubs,
      }),
    );
  }, [agreementId, editedTerms]);

  // ── Effect 2: Register Party A presence in Redis/SSE once wallet is known.
  //   Kept separate so it only fires when walletAddress becomes available.
  useEffect(() => {
    if (!agreementId || !walletAddress || presenceRegistered) return;

    const termsHash = editedTerms
      ? hashTerms(editedTerms as unknown as Record<string, unknown>)
      : undefined;

    dispatch(
      registerPartyAPresenceThunk({
        agreementId: agreementId!,
        address: walletAddress!,
        termsHash,
        termsSnapshot: editedTerms
          ? (editedTerms as unknown as Record<string, unknown>)
          : undefined,
      }),
    );
  }, [agreementId, walletAddress, presenceRegistered]);

  // SSE: watch for Party B joining + approving
  useEffect(() => {
    if (!agreementId) return;

    unsubRef.current = subscribeApproval(agreementId, (state) => {
      dispatch(
        applyApprovalUpdate({
          partyAApproved: state.partyAApproved,
          partyBApproved: state.partyBApproved,
          partyB: state.partyB,
        }),
      );
      if (state.partyB && !partyBConnected) {
        dispatch(setPartyBConnected({ wallet: state.partyB }));
      }
    });

    return () => unsubRef.current?.();
  }, [agreementId]);

  function handleCopy() {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="page" style={{ alignItems: "flex-start", paddingTop: 56 }}>
      <style>{css}</style>
      <div style={{ maxWidth: 560, width: "100%" }}>
        <div className="fade-up" style={{ marginBottom: 32 }}>
          <button
            className="back-btn"
            onClick={() => dispatch(setScreen("set-arbitrator"))}
          >
            ← Back
          </button>
          <div className="step-badge">Step 5 of 6</div>
          <h2 className="page-title">Share with {receiverName}</h2>
          <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
            Send this link to the receiver. They'll review terms, connect their
            wallet, and approve the agreement. You'll be notified here in real
            time.
          </p>
        </div>

        {/* Link box */}
        <div className="fade-up d1" style={{ marginBottom: 20 }}>
          <label className="field-label">Agreement Link</label>
          <div className="link-box">
            <span className="link-text">{shareLink ?? "Generating…"}</span>
            <button
              className="copy-btn"
              onClick={handleCopy}
              disabled={!shareLink}
            >
              {copied ? (
                <>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--green)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="fade-up d2 status-card" style={{ marginBottom: 20 }}>
          <div className="status-label">Waiting for counterparty</div>
          <div className="status-rows">
            <StatusRow
              label="Party B opened link"
              done={partyBConnected}
              pending="Waiting for them to open the link…"
              wallet={partyBWallet}
            />
            <StatusRow
              label="Party B approved agreement"
              done={partyBApproved}
              pending={
                partyBConnected
                  ? "They've connected — waiting for approval…"
                  : "Waiting for them to review terms…"
              }
              wallet={null}
            />
          </div>
        </div>

        {/* Party B approved → CTA to connect wallet */}
        {partyBApproved ? (
          <div className="fade-in approved-banner" style={{ marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 20 }}>🎉</span>
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--green)",
                  }}
                >
                  {receiverName} approved the agreement!
                </div>
                <div
                  style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}
                >
                  Now connect your wallet and lock the funds to make it
                  official.
                </div>
              </div>
            </div>
            <button
              className="btn btn-yellow btn-lg"
              onClick={() => dispatch(setScreen("connect-wallet"))}
              style={{
                width: "100%",
              }}
            >
              Connect Wallet & Lock Funds →
            </button>
          </div>
        ) : (
          <p
            style={{
              fontSize: 11,
              fontFamily: "var(--mono)",
              color: "var(--text-4)",
              textAlign: "center",
            }}
          >
            Live updates via SSE ●
          </p>
        )}
      </div>
    </div>
  );
}

function StatusRow({
  label,
  done,
  pending,
  wallet,
}: {
  label: string;
  done: boolean;
  pending: string;
  wallet: string | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          flexShrink: 0,
          borderRadius: "50%",
          background: done ? "rgba(34,197,94,0.15)" : "var(--bg-3)",
          border: `1px solid ${done ? "rgba(34,197,94,0.4)" : "var(--border)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
          transition: "all 0.3s",
        }}
      >
        {done ? (
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--green)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <span className="spinner" style={{ width: 10, height: 10 }} />
        )}
      </div>
      <div>
        <div
          style={{
            fontSize: 12,
            fontWeight: done ? 600 : 400,
            color: done ? "var(--text-1)" : "var(--text-3)",
          }}
        >
          {label}
        </div>
        {!done && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-4)",
              fontFamily: "var(--mono)",
              marginTop: 2,
            }}
          >
            {pending}
          </div>
        )}
        {done && wallet && (
          <div
            style={{
              fontSize: 10,
              fontFamily: "var(--mono)",
              color: "var(--text-4)",
              marginTop: 2,
            }}
          >
            {wallet.slice(0, 10)}…{wallet.slice(-6)}
          </div>
        )}
      </div>
    </div>
  );
}

const css = `
.back-btn {
  background: none; border: none; color: var(--text-3); font-size: 12px;
  cursor: pointer; margin-bottom: 20px; font-family: var(--mono); letter-spacing: 0.04em; padding: 0;
}
.step-badge {
  font-size: 11px; font-family: var(--mono); color: var(--text-4);
  letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 14px; display: block;
}
.page-title {
  font-size: clamp(24px, 3.5vw, 38px); font-weight: 700;
  letter-spacing: -0.04em; line-height: 1.05; margin-bottom: 8px;
}
.field-label {
  display: block; font-size: 11px; font-family: var(--mono);
  color: var(--text-3); letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 7px;
}
.link-box {
  display: flex; align-items: center; gap: 10;
  background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--r-sm);
  padding: 10px 14px;
}
.link-text {
  flex: 1; font-size: 11px; font-family: var(--mono); color: var(--text-2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.copy-btn {
  display: flex; align-items: center; gap: 5; flex-shrink: 0;
  background: var(--bg-3); border: 1px solid var(--border); border-radius: var(--r-xs);
  padding: 5px 10px; font-size: 10px; font-family: var(--mono); color: var(--text-2);
  cursor: pointer; transition: all var(--fast) var(--ease);
}
.copy-btn:hover { background: var(--bg-1); border-color: var(--border-hi); }
.status-card {
  background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--r); overflow: hidden;
}
.status-label {
  font-size: 9px; font-family: var(--mono); color: var(--text-4);
  text-transform: uppercase; letter-spacing: 0.1em; padding: 10px 16px 8px;
  border-bottom: 1px solid var(--border);
}
.status-rows .div:last-child { border-bottom: none; }
.approved-banner {
  background: rgba(34,197,94,0.06); border: 1px solid rgba(34,197,94,0.2);
  border-radius: var(--r); padding: 16px 18px;
}
`;
