"use client";
import { RootState } from "@/store";
import { useSelector } from "react-redux";

export default function PartyBDashboard() {
  const { terms, amountLocked, walletAddress, agreementId } = useSelector(
    (s: RootState) => s.partyB,
  );

  const t = terms as any;
  const amount = amountLocked ?? t?.total_usd ?? t?.amount_usd ?? "—";
  const receiverName = t?.receiver ?? t?.partyB ?? "You";

  return (
    <div className="page">
      <style>{css}</style>
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        <div className="fade-up">
          {/* Success icon */}
          <div className="success-ring">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--green)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h2 className="page-title">Funds are locked!</h2>
          <p
            style={{
              color: "var(--text-2)",
              fontSize: 14,
              lineHeight: 1.7,
              marginBottom: 32,
            }}
          >
            The payer has locked{" "}
            <strong style={{ color: "var(--green)" }}>${amount} USD</strong>{" "}
            into the escrow contract. You'll receive payment when each milestone
            condition is met.
          </p>
        </div>

        {/* Details */}
        <div
          className="fade-up d1 details-card"
          style={{ marginBottom: 28, textAlign: "left" }}
        >
          {[
            { label: "Agreement ID", value: `#${agreementId ?? "—"}` },
            { label: "Your role", value: "Receiver" },
            { label: "Your name", value: receiverName },
            { label: "Amount locked", value: `$${amount} USD` },
            ...(walletAddress
              ? [
                  {
                    label: "Your wallet",
                    value: `${walletAddress.slice(0, 10)}…${walletAddress.slice(-6)}`,
                  },
                ]
              : []),
          ].map(({ label, value }) => (
            <div key={label} className="detail-row">
              <span className="detail-label">{label}</span>
              <span className="detail-value">{value}</span>
            </div>
          ))}
        </div>

        {/* Info */}
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
            style={{ flexShrink: 0, marginTop: 2 }}
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
            Complete each milestone to receive your payment tranches. If a
            dispute arises, the arbitrator will resolve it.
          </p>
        </div>

        {/* CTA */}
        <div className="fade-up d3">
          <button
            className="btn btn-primary btn-lg"
            style={{ width: "100%" }}
            onClick={() => (window.location.href = `/dashboard/${agreementId}`)}
          >
            Go to Agreement Dashboard
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
.success-ring {
  width: 72px; height: 72px; border-radius: 50%;
  background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.25);
  display: flex; align-items: center; justify-content: center; margin: 0 auto 28px;
}
.page-title {
  font-size: clamp(28px, 4vw, 40px); font-weight: 700;
  letter-spacing: -0.04em; line-height: 1.05; margin-bottom: 8px;
}
.details-card {
  background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--r); overflow: hidden;
}
.detail-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; border-bottom: 1px solid var(--border);
}
.detail-row:last-child { border-bottom: none; }
.detail-label { font-size: 11px; color: var(--text-3); font-family: var(--mono); }
.detail-value { font-size: 12px; color: var(--text-1); font-weight: 500; font-family: var(--mono); }
.info-box {
  display: flex; gap: 10px; align-items: flex-start;
  background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--r-sm); padding: 12px 14px;
  text-align: left;
}
`;
