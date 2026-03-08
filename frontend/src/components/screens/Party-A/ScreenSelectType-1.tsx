"use client";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setScreen,
  setAgreementType,
} from "../../../store/slices/agreementSlice";
import { AgreementType } from "@/api/parseApi";

const TYPES: {
  type: AgreementType;
  title: string;
  desc: string;
  examples: string[];
  payerLabel: string;
  receiverLabel: string;
}[] = [
  {
    type: "freelance",
    title: "Freelance Work",
    desc: "Payer locks funds in escrow. Released to freelancer when work is delivered and confirmed.",
    examples: ["Logo design", "Web dev", "Writing", "Video editing"],
    payerLabel: "Client",
    receiverLabel: "Freelancer",
  },
  {
    type: "rental",
    title: "Rental / Equipment",
    desc: "Renter locks a deposit on-chain. Auto-release on return, or arbitrate damage claims.",
    examples: ["Camera gear", "Apartment", "Vehicle", "Office space"],
    payerLabel: "Renter",
    receiverLabel: "Owner",
  },
  {
    type: "trade",
    title: "Trade & Commerce",
    desc: "Buyer locks payment. Released to seller on delivery confirmation. No trust required.",
    examples: ["Agriculture", "Equipment", "P2P market", "Exports"],
    payerLabel: "Buyer",
    receiverLabel: "Seller",
  },
  {
    type: "bet",
    title: "Simple Bet",
    desc: "Lock stakes on-chain. Winner takes all when the condition resolves via arbitrator.",
    examples: ["Sports outcome", "Price target", "Election", "Any event"],
    payerLabel: "Bettor A",
    receiverLabel: "Bettor B",
  },
];

export default function ScreenSelectType() {
  const dispatch = useAppDispatch();
  const selected = useAppSelector((s) => s.agreement.agreementType);

  return (
    <div className="page">
      <div style={{ maxWidth: 920, width: "100%" }}>
        {/* Header */}
        <div className="fade-up" style={{ marginBottom: 48 }}>
          <div className="step-counter" style={{ marginBottom: 14 }}>
            Step 1 of 6
          </div>
          <h2
            style={{
              fontSize: "clamp(26px, 4vw, 44px)",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
              marginBottom: 10,
            }}
          >
            What type of agreement?
          </h2>
          <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.7 }}>
            Choose a template. One party locks funds — the other receives them
            when conditions are met.
          </p>
        </div>

        {/* Cards grid */}
        <div
          className="fade-up d2"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 10,
            marginBottom: 28,
          }}
        >
          {TYPES.map((t) => {
            const isSelected = selected === t.type;
            return (
              <button
                key={t.type}
                onClick={() => {
                  dispatch(setAgreementType(t.type));
                  setTimeout(() => dispatch(setScreen("describe")), 180);
                }}
                style={{
                  background: isSelected ? "var(--bg-3)" : "var(--bg-1)",
                  border: `1px solid ${isSelected ? "var(--border-hi)" : "var(--border)"}`,
                  borderRadius: "var(--r-md)",
                  padding: "24px 20px",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "all var(--fast) var(--ease)",
                  position: "relative",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.background =
                      "var(--bg-2)";
                    (e.currentTarget as HTMLElement).style.borderColor =
                      "var(--border-hi)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.background =
                      "var(--bg-1)";
                    (e.currentTarget as HTMLElement).style.borderColor =
                      "var(--border)";
                  }
                }}
              >
                {isSelected && (
                  <div
                    style={{
                      position: "absolute",
                      top: 14,
                      right: 14,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "var(--text-1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--bg)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}

                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: isSelected ? "var(--text-1)" : "var(--text-1)",
                    marginBottom: 8,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {t.title}
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-3)",
                    lineHeight: 1.6,
                    marginBottom: 18,
                  }}
                >
                  {t.desc}
                </p>

                {/* Roles */}
                <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                  <span
                    className="tag"
                    style={{
                      color: isSelected ? "var(--text-2)" : "var(--text-4)",
                      borderColor: isSelected
                        ? "var(--border-hi)"
                        : "var(--border)",
                    }}
                  >
                    {t.payerLabel}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--text-4)",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    →
                  </span>
                  <span className="tag" style={{ color: "var(--text-4)" }}>
                    {t.receiverLabel}
                  </span>
                </div>

                {/* Examples */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {t.examples.map((ex) => (
                    <span key={ex} className="tag" style={{ fontSize: 10 }}>
                      {ex}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* Info callout */}
        <div
          className="fade-up d3"
          style={{
            padding: "16px 20px",
            background: "var(--bg-1)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            display: "flex",
            gap: 14,
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              flexShrink: 0,
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--bg-3)",
              marginTop: 1,
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-3)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-1)",
                marginBottom: 4,
              }}
            >
              How conditional escrow works
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-3)",
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              The{" "}
              <strong style={{ color: "var(--text-2)", fontWeight: 500 }}>
                payer
              </strong>{" "}
              locks funds into a Bitcoin-secured smart contract. The{" "}
              <strong style={{ color: "var(--text-2)", fontWeight: 500 }}>
                receiver
              </strong>{" "}
              gets paid when conditions are confirmed — or funds auto-refund
              after the deadline. The{" "}
              <strong style={{ color: "var(--text-2)", fontWeight: 500 }}>
                arbitrator
              </strong>{" "}
              resolves disputes if they arise.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
