"use client";
// ============================================================
// components/partyB/ScreenPartyBApprove.tsx
//
// Party B Step 3: Confirm and approve the agreement.
// Shows terms summary + wallet, then one-click approve.
// On success → moves to "waiting-funds" screen.
// ============================================================

import { AppDispatch, RootState } from "@/store";
import { useDispatch, useSelector } from "react-redux";
import { setScreen, approveAsPartyBThunk } from "@/store/slices/partyBSlice";
import { isV2, ParsedAgreementV2 } from "@/api/parseApi";

export default function ScreenPartyBApprove() {
  const dispatch = useDispatch<AppDispatch>();
  const {
    terms,
    agreementId,
    walletAddress,
    walletConnected,
    approving,
    approveError,
  } = useSelector((s: RootState) => s.partyB);

  const t = terms as any;
  const payerName = t?.payer ?? t?.partyA ?? "Payer";
  const receiverName = t?.receiver ?? t?.partyB ?? "Receiver";
  const amount = t?.total_usd ?? t?.amount_usd ?? "—";
  const arbitrator = t?.arbitrator ?? "TBD";
  const v2 = isV2(terms) ? (terms as unknown as ParsedAgreementV2) : null;
  const milestones = v2?.milestones ?? [];

  async function handleApprove() {
    if (!agreementId || !walletAddress) return;
    await dispatch(
      approveAsPartyBThunk({ agreementId, address: walletAddress }),
    );
    // slice handles screen transition to "waiting-funds" on success
  }

  return (
    <div className="page">
      <style>{css}</style>
      <div style={{ maxWidth: 500, width: "100%", textAlign: "center" }}>
        <div className="fade-up">
          <button
            className="back-btn"
            onClick={() => dispatch(setScreen("connect-wallet"))}
          >
            ← Back
          </button>

          {/* Lock icon */}
          <div
            className="icon-ring"
            style={{
              background: "var(--bg-3)",
              borderColor: "var(--border-hi)",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-2)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <div className="step-badge">Step 3 of 4</div>
          <h2 className="page-title">Approve agreement</h2>
          <p
            style={{
              color: "var(--text-2)",
              fontSize: 13,
              lineHeight: 1.7,
              marginBottom: 24,
            }}
          >
            You're approving as{" "}
            <strong style={{ color: "var(--text-1)" }}>{receiverName}</strong>.
            Once you approve, Party A will be notified to lock funds.
          </p>
        </div>

        {/* Summary */}
        <div
          className="fade-up d1 summary-card"
          style={{ marginBottom: 16, textAlign: "left" }}
        >
          {[
            { label: "Payer", value: payerName },
            { label: "You (Receiver)", value: receiverName },
            { label: "Amount", value: `$${amount} USD` },
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
            <div key={label} className="summary-row">
              <span className="summary-label">{label}</span>
              <span className="summary-value">{value}</span>
            </div>
          ))}
        </div>

        {/* Wallet badge */}
        {walletAddress && (
          <div className="fade-up d1 wallet-badge" style={{ marginBottom: 20 }}>
            <div className="wallet-dot" />
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--mono)",
                color: "var(--text-3)",
              }}
            >
              Signing as: {walletAddress.slice(0, 12)}…{walletAddress.slice(-8)}
            </span>
          </div>
        )}

        {approveError && (
          <div
            className="error-box fade-in"
            style={{ marginBottom: 16, textAlign: "left" }}
          >
            ⚠ {approveError}
          </div>
        )}

        <div className="fade-up d2">
          <button
            className="btn btn-primary btn-lg"
            onClick={handleApprove}
            disabled={approving || !walletConnected}
            style={{ width: "100%" }}
          >
            {approving ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14 }} />{" "}
                Approving…
              </>
            ) : (
              <>
                Approve Agreement
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
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </>
            )}
          </button>
          <p
            style={{
              fontSize: 11,
              fontFamily: "var(--mono)",
              color: "var(--text-4)",
              marginTop: 10,
            }}
          >
            This approval is recorded on our server. Funds are locked separately
            by Party A.
          </p>
        </div>
      </div>
    </div>
  );
}

const css = `
.back-btn {
  background: none; border: none; color: var(--text-3); font-size: 11px;
  cursor: pointer; margin-bottom: 32px; font-family: var(--mono); letter-spacing: 0.04em; display: block;
}
.icon-ring {
  width: 64px; height: 64px; border-radius: 50%; border: 1px solid;
  display: flex; align-items: center; justify-content: center; margin: 0 auto 28px;
}
.step-badge {
  font-size: 10px; font-family: var(--mono); color: var(--text-4);
  letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 12px; display: block;
}
.page-title {
  font-size: 32px; font-weight: 700; letter-spacing: -0.04em; line-height: 1.1; margin-bottom: 10px;
}
.summary-card {
  background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--r); overflow: hidden;
}
.summary-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; border-bottom: 1px solid var(--border);
}
.summary-row:last-child { border-bottom: none; }
.summary-label { font-size: 11px; color: var(--text-3); font-family: var(--mono); }
.summary-value { font-size: 12px; color: var(--text-1); font-weight: 500; }
.wallet-badge {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--r-sm);
  padding: 8px 14px;
}
.wallet-dot {
  width: 6px; height: 6px; border-radius: 50%; background: var(--green); flex-shrink: 0;
}
`;
