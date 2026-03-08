"use client";
// ============================================================
// components/partyA/ScreenApproveAgreement.tsx
//
// Party A approves the agreement before locking funds.
// Shows terms summary + approval status of both parties.
// Once BOTH approved → CTA to lock funds.
// SSE keeps approval status live.
// ============================================================

import { useEffect, useRef, useState } from "react";

import {
  setScreen,
  approveAsPartyAThunk,
  applyApprovalUpdate,
  pollApprovalStateThunk,
} from "@/store/slices/partyASlice";
import { subscribeApproval } from "@/api/approvalApi";
import { isV2, ParsedAgreementV2 } from "@/api/parseApi";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/store";
import type { AppDispatch } from "@/store";

export default function ScreenApproveAgreement() {
  const dispatch = useDispatch<AppDispatch>();
  const {
    editedTerms,
    agreementId,
    walletAddress,
    partyAApproved,
    partyBApproved,
    partyBWallet,
  } = useSelector((s: RootState) => s.partyA);

  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const t = editedTerms as any;
  const v2 = isV2(editedTerms)
    ? (editedTerms as unknown as ParsedAgreementV2)
    : null;
  const payerName = t?.payer ?? t?.partyA ?? "Payer";
  const receiverName = t?.receiver ?? t?.partyB ?? "Receiver";
  const totalAmount = t?.total_usd ?? t?.amount_usd ?? "—";
  const arbitrator = t?.arbitrator ?? "TBD";
  const milestones = v2?.milestones ?? [];
  const bothApproved = partyAApproved && partyBApproved;

  // SSE: keep approval state live
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
    });
    // Also do an immediate poll on mount
    dispatch(pollApprovalStateThunk(agreementId));
    return () => unsubRef.current?.();
  }, [agreementId]);

  async function handleApprove() {
    if (!agreementId || !walletAddress) return;
    setApproving(true);
    setError(null);
    try {
      await dispatch(
        approveAsPartyAThunk({ agreementId, address: walletAddress }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="page" style={{ alignItems: "flex-start", paddingTop: 56 }}>
      <style>{css}</style>
      <div style={{ maxWidth: 560, width: "100%" }}>
        {/* Header */}
        <div className="fade-up" style={{ marginBottom: 32 }}>
          <button
            className="back-btn"
            onClick={() => dispatch(setScreen("connect-wallet"))}
          >
            ← Back
          </button>
          <div className="step-badge">Step 6 of 6</div>
          <h2 className="page-title">
            {bothApproved ? "Both parties approved!" : "Approve agreement"}
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
            {bothApproved
              ? "Everything is confirmed. Lock the funds to make the escrow contract active."
              : "Approve the agreement as the payer. Waiting for the receiver to approve too."}
          </p>
        </div>

        {/* Terms summary */}
        <div className="fade-up d1 terms-card" style={{ marginBottom: 16 }}>
          <div className="card-label">Agreement Summary</div>
          {[
            { label: "Payer (You)", value: payerName },
            { label: "Receiver", value: receiverName },
            { label: "Total Amount", value: `$${totalAmount} USD` },
            { label: "Arbitrator", value: arbitrator },
            ...(milestones.length > 0
              ? [
                  {
                    label: "Milestones",
                    value: `${milestones.length} payment phases`,
                  },
                ]
              : []),
          ].map(({ label, value }) => (
            <div key={label} className="term-row">
              <span className="term-label">{label}</span>
              <span className="term-value">{value}</span>
            </div>
          ))}
        </div>

        {/* Approval status grid */}
        <div className="fade-up d2" style={{ marginBottom: 20 }}>
          <div className="card-label" style={{ marginBottom: 10 }}>
            Approval Status
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            {[
              {
                role: "Payer",
                isYou: true,
                name: payerName,
                wallet: walletAddress,
                approved: partyAApproved,
              },
              {
                role: "Receiver",
                isYou: false,
                name: receiverName,
                wallet: partyBWallet,
                approved: partyBApproved,
              },
            ].map(({ role, isYou, name, wallet, approved }) => (
              <div
                key={role}
                className="approval-card"
                style={{
                  background: approved ? "rgba(34,197,94,0.06)" : "var(--bg-2)",
                  borderColor: approved
                    ? "rgba(34,197,94,0.2)"
                    : "var(--border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <span className="role-tag">
                    {role}
                    {isYou && <span className="you-badge">YOU</span>}
                  </span>
                  <span style={{ fontSize: 14 }}>{approved ? "✅" : "⏳"}</span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text-1)",
                    marginBottom: 3,
                  }}
                >
                  {name}
                </div>
                {wallet && (
                  <div
                    style={{
                      fontSize: 9,
                      fontFamily: "var(--mono)",
                      color: "var(--text-4)",
                    }}
                  >
                    {wallet.slice(0, 8)}…{wallet.slice(-6)}
                  </div>
                )}
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 10,
                    fontFamily: "var(--mono)",
                    color: approved ? "var(--green)" : "var(--text-4)",
                    fontWeight: approved ? 700 : 400,
                  }}
                >
                  {approved ? "Approved ✓" : "Pending…"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Approve button (Party A hasn't approved yet) */}
        {!partyAApproved && (
          <div className="fade-up d2" style={{ marginBottom: 16 }}>
            {error && (
              <div className="error-box fade-in" style={{ marginBottom: 12 }}>
                ⚠ {error}
              </div>
            )}
            <button
              className="btn btn-primary btn-lg"
              onClick={handleApprove}
              disabled={approving}
              style={{ width: "100%" }}
            >
              {approving ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14 }} />{" "}
                  Approving…
                </>
              ) : (
                "Approve as Payer"
              )}
            </button>
          </div>
        )}

        {/* Both approved → Lock Funds CTA */}
        {bothApproved && (
          <button
            className="btn btn-primary btn-lg fade-in"
            onClick={() => dispatch(setScreen("lock-funds"))}
            style={{
              width: "100%",
              background: "var(--green)",
              borderColor: "var(--green)",
              color: "#0a0a0a",
            }}
          >
            Both Approved — Lock Funds Now
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {!bothApproved && partyAApproved && (
          <p
            style={{
              textAlign: "center",
              fontSize: 11,
              fontFamily: "var(--mono)",
              color: "var(--text-4)",
              marginTop: 12,
            }}
          >
            Waiting for receiver to approve · Live via SSE ●
          </p>
        )}
      </div>
    </div>
  );
}

const css = `
.back-btn {
  background: none; border: none; color: var(--text-3); font-size: 12px;
  cursor: pointer; margin-bottom: 20px; font-family: var(--mono);
  letter-spacing: 0.04em; padding: 0;
}
.step-badge {
  font-size: 11px; font-family: var(--mono); color: var(--text-4);
  letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 14px; display: block;
}
.page-title {
  font-size: clamp(24px, 3.5vw, 38px); font-weight: 700;
  letter-spacing: -0.04em; line-height: 1.05; margin-bottom: 8px;
}
.terms-card {
  background: var(--bg-1); border: 1px solid var(--border);
  border-radius: var(--r); overflow: hidden;
}
.card-label {
  font-size: 9px; font-family: var(--mono); color: var(--text-4);
  text-transform: uppercase; letter-spacing: 0.1em;
  padding: 10px 16px 8px; border-bottom: 1px solid var(--border);
}
.term-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; border-bottom: 1px solid var(--border);
}
.term-row:last-child { border-bottom: none; }
.term-label { font-size: 11px; color: var(--text-3); font-family: var(--mono); }
.term-value { font-size: 12px; color: var(--text-1); font-weight: 500; }
.approval-card {
  border: 1px solid; border-radius: var(--r-sm); padding: 12px 14px; transition: all 0.3s;
}
.role-tag {
  font-size: 9px; font-family: var(--mono); text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--text-3); display: flex; align-items: center; gap: 5px;
}
.you-badge {
  font-size: 8px; background: var(--bg-3); border: 1px solid var(--border);
  border-radius: 3px; padding: 1px 4px; color: var(--text-4);
}
`;
