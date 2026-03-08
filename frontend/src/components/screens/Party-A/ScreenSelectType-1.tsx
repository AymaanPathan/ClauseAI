"use client";

import { setScreen, setAgreementType } from "@/store/slices/partyASlice";
import { AgreementType } from "@/api/parseApi";
import { AppDispatch, RootState } from "@/store";
import { useDispatch, useSelector } from "react-redux";

const TYPES: {
  type: AgreementType;
  title: string;
  emoji: string;
  desc: string;
  examples: string[];
  payerLabel: string;
  receiverLabel: string;
}[] = [
  {
    type: "freelance",
    title: "Freelance Work",
    emoji: "✦",
    desc: "Client locks funds in escrow. Released to freelancer when work is delivered and confirmed.",
    examples: ["Logo design", "Web dev", "Writing", "Video editing"],
    payerLabel: "Client",
    receiverLabel: "Freelancer",
  },
  {
    type: "rental",
    title: "Rental / Equipment",
    emoji: "◈",
    desc: "Renter locks a deposit on-chain. Auto-release on return, or arbitrate damage claims.",
    examples: ["Camera gear", "Apartment", "Vehicle", "Office space"],
    payerLabel: "Renter",
    receiverLabel: "Owner",
  },
  {
    type: "trade",
    title: "Trade & Commerce",
    emoji: "⟐",
    desc: "Buyer locks payment. Released to seller on delivery confirmation. No trust required.",
    examples: ["Agriculture", "Equipment", "P2P market", "Exports"],
    payerLabel: "Buyer",
    receiverLabel: "Seller",
  },
  {
    type: "bet",
    title: "Simple Bet",
    emoji: "⬡",
    desc: "Lock stakes on-chain. Winner takes all when the condition resolves via arbitrator.",
    examples: ["Sports outcome", "Price target", "Election", "Any event"],
    payerLabel: "Bettor A",
    receiverLabel: "Bettor B",
  },
];

const FLOW_STEPS = [
  { label: "Select type", active: true },
  { label: "Describe deal" },
  { label: "Review terms" },
  { label: "Set arbitrator" },
  { label: "Share with counterparty" },
  { label: "Lock escrow funds" },
];

export default function ScreenSelectType() {
  const dispatch = useDispatch<AppDispatch>();
  const selected = useSelector((s: RootState) => s.partyA.agreementType);

  return (
    <div
      className="page"
      style={{ alignItems: "flex-start", paddingTop: 0, minHeight: "100vh" }}
    >
      <style>{css}</style>
      <div
        style={{
          display: "flex",
          width: "100%",
          maxWidth: 1020,
          gap: 48,
          paddingTop: 56,
          paddingBottom: 56,
        }}
      >
        {/* Sidebar */}
        <div
          style={{ width: 200, flexShrink: 0, paddingTop: 4 }}
          className="hide-mobile"
        >
          <div
            style={{
              fontSize: 10,
              fontFamily: "var(--mono)",
              color: "var(--text-4)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 20,
            }}
          >
            Your journey
          </div>
          {FLOW_STEPS.map((step, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                marginBottom: 16,
                opacity: step.active ? 1 : 0.35,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: step.active ? "var(--text-1)" : "transparent",
                    border: step.active
                      ? "1px solid var(--text-1)"
                      : "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    fontFamily: "var(--mono)",
                    color: step.active ? "var(--bg)" : "var(--text-4)",
                    fontWeight: 700,
                  }}
                >
                  {i + 1}
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <div
                    style={{
                      width: 1,
                      height: 20,
                      background: "var(--border)",
                      marginTop: 3,
                    }}
                  />
                )}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: step.active ? "var(--text-1)" : "var(--text-4)",
                  fontWeight: step.active ? 600 : 400,
                  paddingTop: 2,
                }}
              >
                {step.label}
              </div>
            </div>
          ))}
        </div>

        {/* Main */}
        <div style={{ flex: 1 }}>
          <div className="fade-up" style={{ marginBottom: 40 }}>
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--mono)",
                color: "var(--text-4)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              Step 1 of 6
            </div>
            <h2
              style={{
                fontSize: "clamp(28px, 4vw, 46px)",
                fontWeight: 700,
                letterSpacing: "-0.04em",
                lineHeight: 1.05,
                marginBottom: 10,
              }}
            >
              What type of
              <br />
              agreement?
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--text-2)",
                lineHeight: 1.7,
                maxWidth: 460,
              }}
            >
              One party locks funds — the other receives them when conditions
              are met. Choose a template to begin.
            </p>
          </div>

          {/* Type cards */}
          <div
            className="fade-up d2"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginBottom: 28,
            }}
          >
            {TYPES.map((t) => {
              const isSelected = selected === t.type;
              return (
                <button
                  key={t.type}
                  className={`type-card${isSelected ? " type-card--selected" : ""}`}
                  onClick={() => {
                    dispatch(setAgreementType(t.type));
                    setTimeout(() => dispatch(setScreen("describe")), 160);
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: 14,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 22,
                        color: "var(--text-3)",
                        fontFamily: "monospace",
                      }}
                    >
                      {t.emoji}
                    </span>
                    {isSelected && (
                      <div
                        style={{
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
                          width="9"
                          height="9"
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
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-1)",
                      marginBottom: 6,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {t.title}
                  </div>
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--text-3)",
                      lineHeight: 1.6,
                      marginBottom: 14,
                    }}
                  >
                    {t.desc}
                  </p>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    <span className="role-tag role-tag--payer">
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
                    <span className="role-tag">{t.receiverLabel}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Info strip */}
          <div className="fade-up d3 info-strip">
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
    </div>
  );
}

const css = `
.type-card { background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--r-md); padding: 20px 18px; text-align: left; cursor: pointer; transition: all var(--fast) var(--ease); }
.type-card:hover { background: var(--bg-2); border-color: var(--border-hi); }
.type-card--selected { background: var(--bg-3); border-color: var(--border-hi); }
.role-tag { display: inline-block; border: 1px solid var(--border); border-radius: var(--r-xs); padding: 2px 8px; font-size: 10px; font-family: var(--mono); color: var(--text-4); letter-spacing: 0.04em; }
.role-tag--payer { color: var(--text-2); border-color: var(--border-hi); }
.info-strip { padding: 16px 18px; background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--r); display: flex; gap: 14px; align-items: flex-start; }
@media (max-width: 600px) { .hide-mobile { display: none !important; } }
`;
