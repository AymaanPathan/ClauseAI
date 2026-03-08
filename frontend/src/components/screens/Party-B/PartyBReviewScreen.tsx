"use client";
import { AppDispatch, RootState } from "@/store";
import { useDispatch, useSelector } from "react-redux";
import { setScreen } from "../../../store/slices/partyBSlice";
import { isV2, ParsedAgreementV2 } from "@/api/parseApi";

export default function PartyBReviewScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const { terms, agreementId } = useSelector((s: RootState) => s.partyB);

  const t = terms as any;
  const v2 = isV2(terms) ? (terms as unknown as ParsedAgreementV2) : null;
  const payerName = t?.payer ?? t?.partyA ?? "Payer";
  const receiverName = t?.receiver ?? t?.partyB ?? "Receiver";
  const amount = t?.total_usd ?? t?.amount_usd ?? "—";
  const arbitrator = t?.arbitrator ?? "TBD";
  const condition = t?.condition ?? null;
  const milestones = v2?.milestones ?? [];

  const rows = [
    { label: "Agreement ID", value: `#${agreementId}` },
    { label: "Payer (locks funds)", value: payerName },
    { label: "Receiver (gets paid)", value: receiverName },
    { label: "Total Amount", value: `$${amount} USD` },
    { label: "Arbitrator", value: arbitrator },
  ];
  if (condition) rows.push({ label: "Condition", value: condition });

  return (
    <div className="page" style={{ alignItems: "flex-start", paddingTop: 56 }}>
      <style>{css}</style>
      <div style={{ maxWidth: 580, width: "100%" }}>
        {/* Header */}
        <div className="fade-up" style={{ marginBottom: 32 }}>
          <div className="step-badge">Step 1 of 4 — You are the Receiver</div>
          <h2 className="page-title">Review your agreement</h2>
          <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
            Read every term carefully before approving. Once you approve, the
            payer will lock funds into escrow.
          </p>
        </div>

        {/* Terms table */}
        <div className="fade-up d1 terms-card" style={{ marginBottom: 16 }}>
          <div className="card-label">Agreement Terms</div>
          {rows.map(({ label, value }) => (
            <div key={label} className="term-row">
              <span className="term-label">{label}</span>
              <span className="term-value">{value}</span>
            </div>
          ))}
        </div>

        {/* Milestones */}
        {milestones.length > 0 && (
          <div className="fade-up d2 terms-card" style={{ marginBottom: 24 }}>
            <div className="card-label">Payment Milestones</div>
            {milestones.map((ms, i) => (
              <div key={i} className="milestone-row">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-1)",
                    }}
                  >
                    {ms.title || `Milestone ${i + 1}`}
                  </span>
                  <span className="pct-badge">{ms.percentage}%</span>
                </div>
                {ms.condition && (
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--text-3)",
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    {ms.condition}
                  </p>
                )}
                {ms.deadline && (
                  <p
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--mono)",
                      color: "var(--text-4)",
                      marginTop: 4,
                    }}
                  >
                    Deadline: {ms.deadline}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Info box */}
        <div className="fade-up d2 info-box" style={{ marginBottom: 24 }}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-3)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, marginTop: 1 }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            By approving, you confirm you've read and accepted all terms. You
            will need to connect your wallet in the next step.
          </p>
        </div>

        {/* CTA */}
        <div className="fade-up d3">
          <button
            className="btn btn-primary btn-lg"
            onClick={() => dispatch(setScreen("connect-wallet"))}
            style={{ width: "100%" }}
          >
            I've read the terms — Connect Wallet
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
        </div>
      </div>
    </div>
  );
}

const css = `
.step-badge {
  display: inline-block;
  font-size: 10px; font-family: var(--mono); color: var(--text-4);
  letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 14px;
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
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 10px 16px; border-bottom: 1px solid var(--border); gap: 12px;
}
.term-row:last-child { border-bottom: none; }
.term-label { font-size: 11px; color: var(--text-3); font-family: var(--mono); flex-shrink: 0; }
.term-value { font-size: 12px; color: var(--text-1); font-weight: 500; text-align: right; }
.milestone-row {
  padding: 12px 16px; border-bottom: 1px solid var(--border);
}
.milestone-row:last-child { border-bottom: none; }
.pct-badge {
  font-size: 11px; font-family: var(--mono); font-weight: 700;
  color: var(--text-2); background: var(--bg-3); border: 1px solid var(--border);
  border-radius: 4px; padding: 2px 8px;
}
.info-box {
  display: flex; gap: 10px; align-items: flex-start;
  background: var(--bg-2); border: 1px solid var(--border);
  border-radius: var(--r-sm); padding: 12px 14px;
}
`;
