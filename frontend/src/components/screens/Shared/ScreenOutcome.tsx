"use client";

import { AppDispatch, RootState } from "@/store";
import { resetAll, setScreen } from "@/store/slices/partyASlice";
import { useDispatch, useSelector } from "react-redux";

const OUTCOMES = {
  complete: {
    bgColor: "rgba(34,197,94,0.06)",
    borderColor: "rgba(34,197,94,0.2)",
    title: "Milestone Released",
    subtitle: "Conditions met — funds sent to receiver",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--green)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  timeout: {
    bgColor: "rgba(245,158,11,0.06)",
    borderColor: "rgba(245,158,11,0.2)",
    title: "Tranche Expired",
    subtitle: "Deadline passed — that tranche auto-refunded to payer",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--amber)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  dispute: {
    bgColor: "rgba(245,158,11,0.06)",
    borderColor: "rgba(245,158,11,0.2)",
    title: "Dispute Opened",
    subtitle: "Arbitrator has been notified for this tranche",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--amber)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
};

interface Props {
  /** Pass the outcome type explicitly — avoids reading stale screen state */
  type?: keyof typeof OUTCOMES;
}

export default function ScreenOutcome({ type = "complete" }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const { editedTerms, agreementId, amountLocked, walletAddress } =
    useSelector((s: RootState) => s.partyA);

  const outcome = OUTCOMES[type] ?? OUTCOMES.complete;
  const terms = editedTerms as unknown as Record<string, unknown>;
  const amount =
    amountLocked ?? String(terms?.amount_usd ?? terms?.total_usd ?? "—");

  return (
    <div className="page">
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        {/* Icon */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: outcome.bgColor,
            border: `1px solid ${outcome.borderColor}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 28px",
          }}
        >
          {outcome.icon}
        </div>

        <h2
          style={{
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            lineHeight: 1.1,
            marginBottom: 8,
          }}
        >
          {outcome.title}
        </h2>
        <p
          style={{
            color: "var(--text-2)",
            fontSize: 13,
            lineHeight: 1.7,
            marginBottom: 32,
          }}
        >
          {outcome.subtitle}
        </p>

        {/* Details */}
        <div className="table" style={{ marginBottom: 28, textAlign: "left" }}>
          {[
            {
              label: "Agreement ID",
              value: agreementId ? `#${agreementId}` : "—",
            },
            { label: "Amount", value: `$${amount} USD` },
            {
              label: "Your address",
              value: walletAddress
                ? `${walletAddress.slice(0, 10)}...${walletAddress.slice(-6)}`
                : "—",
            },
          ].map(({ label, value }) => (
            <div key={label} className="table-row">
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                {label}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: "var(--mono)",
                  color: "var(--text-1)",
                  fontWeight: 500,
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => dispatch(setScreen("dashboard"))}
            style={{ width: "100%" }}
          >
            Go to Dashboard
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              dispatch(resetAll());
              dispatch(setScreen("landing"));
            }}
            style={{ width: "100%" }}
          >
            Create new agreement
          </button>
        </div>
      </div>
    </div>
  );
}
