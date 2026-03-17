"use client";
// ============================================================
// components/partyB/ScreenPartyBWaitingFunds.tsx
//
// Party B Step 4: Approved — waiting for Party A to lock funds.
//
// Two signals trigger the redirect to dashboard:
//   1. SSE push  — instant when Party A calls POST /status
//   2. Polling   — fallback every 4s on GET /status
//
// Whichever fires first wins. Both call notifyFundsLocked().
// ============================================================

import { useEffect, useRef } from "react";
import { AppDispatch, RootState } from "@/store";
import { useDispatch, useSelector } from "react-redux";
import {
  applyApprovalUpdate,
  notifyFundsLocked,
} from "../../../store/slices/partyBSlice";
import { subscribeApproval } from "@/api/approvalApi";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL;

export default function PartyBWaitingFundsScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const { agreementId, partyAApproved, partyBApproved, walletAddress, terms } =
    useSelector((s: RootState) => s.partyB);

  const t = terms as any;
  const amount = t?.total_usd ?? t?.amount_usd ?? "—";

  // Guard against double-dispatch if both SSE and poll fire together
  const notifiedRef = useRef(false);

  function handleFundsLocked(amountLocked: string) {
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    dispatch(notifyFundsLocked({ amountLocked }));
  }

  useEffect(() => {
    if (!agreementId) return;

    // ── 1. SSE subscription ───────────────────────────────────
    // The same SSE stream already used for approval also carries
    // fundsLocked / fundState after we added them to the server response.
    const unsub = subscribeApproval(agreementId, (state: any) => {
      // Handle approval updates as before
      dispatch(
        applyApprovalUpdate({
          partyAApproved: state.partyAApproved,
          partyBApproved: state.partyBApproved,
          partyA: state.partyA,
        }),
      );

      // NEW: react to funds being locked via SSE push
      if (state.fundsLocked === true || state.fundState === "locked") {
        handleFundsLocked(state.amountLocked ?? String(amount));
      }
    });

    // ── 2. Polling fallback ───────────────────────────────────
    // Hits GET /api/agreement/:id/status (now a real endpoint).
    // Catches cases where Party B opened the page after SSE fired,
    // or where the SSE connection dropped briefly.
    const pollFunds = setInterval(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/agreement/${agreementId}/status`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.fundState === "locked" || data.fundsLocked === true) {
          handleFundsLocked(data.amountLocked ?? String(amount));
          clearInterval(pollFunds);
        }
      } catch {
        // ignore transient network errors
      }
    }, 4000);

    return () => {
      unsub();
      clearInterval(pollFunds);
    };
  }, [agreementId, dispatch, amount]);

  const steps = [
    { label: "You approved", done: true },
    { label: "Party A notified", done: true }, // they're notified via SSE the moment B approves
    { label: "Party A locks funds", done: false },
    { label: "Agreement active", done: false },
  ];

  return (
    <div className="page">
      <style>{css}</style>
      <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
        <div className="fade-up">
          {/* Animated waiting icon */}
          <div className="waiting-ring">
            <span className="spinner" style={{ width: 26, height: 26 }} />
          </div>

          <div className="step-badge">Step 4 of 4</div>
          <h2 className="page-title">Waiting for funds</h2>
          <p
            style={{
              color: "var(--text-2)",
              fontSize: 13,
              lineHeight: 1.7,
              marginBottom: 32,
            }}
          >
            You've approved the agreement. The payer has been notified and needs
            to connect their wallet and lock{" "}
            <strong style={{ color: "var(--text-1)" }}>${amount} USD</strong>{" "}
            into escrow.
          </p>
        </div>

        {/* Progress steps */}
        <div className="fade-up d1 progress-card" style={{ marginBottom: 24 }}>
          {steps.map((step, i) => (
            <div key={i} className="progress-row">
              <div
                className="progress-dot"
                style={{
                  background: step.done
                    ? "rgba(34,197,94,0.15)"
                    : "var(--bg-3)",
                  borderColor: step.done
                    ? "rgba(34,197,94,0.4)"
                    : "var(--border)",
                }}
              >
                {step.done ? (
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
                  <div
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: "var(--border)",
                    }}
                  />
                )}
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: step.done ? "var(--text-1)" : "var(--text-4)",
                  fontWeight: step.done ? 500 : 400,
                }}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Approval status */}
        <div className="fade-up d2 approval-grid" style={{ marginBottom: 20 }}>
          {[
            {
              role: "You (Receiver)",
              approved: partyBApproved,
              wallet: walletAddress,
            },
            { role: "Payer", approved: partyAApproved, wallet: null },
          ].map(({ role, approved, wallet }) => (
            <div
              key={role}
              className="approval-card"
              style={{
                background: approved ? "rgba(34,197,94,0.06)" : "var(--bg-2)",
                borderColor: approved ? "rgba(34,197,94,0.2)" : "var(--border)",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontFamily: "var(--mono)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.1em",
                  color: approved ? "var(--green)" : "var(--text-4)",
                  marginBottom: 6,
                }}
              >
                {role}
              </div>
              <div style={{ fontSize: 14 }}>{approved ? "✅" : "⏳"}</div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: approved ? "var(--green)" : "var(--text-4)",
                  marginTop: 4,
                }}
              >
                {approved ? "Approved" : "Pending"}
              </div>
              {wallet && (
                <div
                  style={{
                    fontSize: 9,
                    fontFamily: "var(--mono)",
                    color: "var(--text-4)",
                    marginTop: 2,
                  }}
                >
                  {wallet.slice(0, 8)}…{wallet.slice(-6)}
                </div>
              )}
            </div>
          ))}
        </div>

        <p
          style={{
            fontSize: 10,
            fontFamily: "var(--mono)",
            color: "var(--text-4)",
          }}
        >
          Live updates via SSE ● polling every 4s ○
        </p>
      </div>
    </div>
  );
}

const css = `
.waiting-ring {
  width: 64px; height: 64px; border-radius: 50%;
  background: var(--bg-3); border: 1px solid var(--border-hi);
  display: flex; align-items: center; justify-content: center; margin: 0 auto 28px;
}
.step-badge {
  font-size: 10px; font-family: var(--mono); color: var(--text-4);
  letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 12px; display: block;
}
.page-title {
  font-size: 32px; font-weight: 700; letter-spacing: -0.04em; line-height: 1.1; margin-bottom: 10px;
}
.progress-card {
  background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--r);
  padding: 4px 0; text-align: left;
}
.progress-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px; border-bottom: 1px solid var(--border);
}
.progress-row:last-child { border-bottom: none; }
.progress-dot {
  width: 20px; height: 20px; flex-shrink: 0; border-radius: 50%; border: 1px solid;
  display: flex; align-items: center; justify-content: center; transition: all 0.3s;
}
.approval-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
}
.approval-card {
  border: 1px solid; border-radius: var(--r-sm); padding: 14px;
  text-align: center; transition: all 0.3s;
}
`;
