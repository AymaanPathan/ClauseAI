"use client";

import { setScreen, setAgreementType } from "@/store/slices/partyASlice";
import { AgreementType } from "@/api/parseApi";
import { AppDispatch, RootState } from "@/store";
import { useDispatch, useSelector } from "react-redux";

const TYPES: {
  type: AgreementType;
  title: string;
  icon: string;
  desc: string;
  examples: string[];
  payerLabel: string;
  receiverLabel: string;
  accentColor: string;
}[] = [
  {
    type: "freelance",
    title: "Freelance Work",
    icon: "✦",
    desc: "Client locks funds in escrow. Released to freelancer when work is delivered and confirmed.",
    examples: ["Logo design", "Web dev", "Writing", "Video editing"],
    payerLabel: "Client",
    receiverLabel: "Freelancer",
    accentColor: "var(--accent)",
  },
  {
    type: "rental",
    title: "Rental / Equipment",
    icon: "◈",
    desc: "Renter locks a deposit on-chain. Auto-release on return, or arbitrate damage claims.",
    examples: ["Camera gear", "Apartment", "Vehicle", "Office space"],
    payerLabel: "Renter",
    receiverLabel: "Owner",
    accentColor: "var(--blue)",
  },
  {
    type: "trade",
    title: "Trade & Commerce",
    icon: "⟐",
    desc: "Buyer locks payment. Released to seller on delivery confirmation. No trust required.",
    examples: ["Agriculture", "Equipment", "P2P market", "Exports"],
    payerLabel: "Buyer",
    receiverLabel: "Seller",
    accentColor: "var(--green)",
  },
  {
    type: "bet",
    title: "Simple Bet",
    icon: "⬡",
    desc: "Lock stakes on-chain. Winner takes all when the condition resolves via arbitrator.",
    examples: ["Sports outcome", "Price target", "Election", "Any event"],
    payerLabel: "Bettor A",
    receiverLabel: "Bettor B",
    accentColor: "var(--amber)",
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
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <style>{css}</style>

      {/* ── Topbar ── */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          height: 56,
          background: "rgba(11,12,13,0.94)",
          backdropFilter: "blur(24px)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 32px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <a
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              textDecoration: "none",
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 15,
                color: "#0b0c0d",
              }}
            >
              ◈
            </div>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 16,
                fontWeight: 800,
                color: "var(--text-1)",
                letterSpacing: "-0.03em",
              }}
            >
              ClauseAI
            </span>
          </a>
          <div
            style={{
              width: 1,
              height: 18,
              background: "var(--border)",
              margin: "0 16px",
            }}
          />
          <nav
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 12,
              color: "var(--text-4)",
              fontFamily: "var(--mono)",
              gap: 0,
            }}
          >
            <span>New Agreement</span>
            <span style={{ margin: "0 7px", color: "var(--text-4)" }}>/</span>
            <span style={{ color: "var(--accent)", fontWeight: 500 }}>
              Select Type
            </span>
          </nav>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            fontFamily: "var(--mono)",
            color: "var(--text-4)",
            letterSpacing: "0.08em",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 10px",
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              borderRadius: 20,
            }}
          >
            STEP 1 / 6
          </span>
        </div>
      </nav>

      {/* ── Body ── */}
      <div
        style={{
          display: "flex",
          maxWidth: 1040,
          margin: "0 auto",
          gap: 52,
          padding: "52px 24px 80px",
        }}
      >
        {/* ── Sidebar — progress steps ── */}
        <div className="st-sidebar">
          <div
            style={{
              fontSize: 9,
              fontFamily: "var(--mono)",
              color: "var(--text-4)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 22,
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
                gap: 12,
                marginBottom: i < FLOW_STEPS.length - 1 ? 0 : 0,
              }}
            >
              {/* Spine */}
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
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: step.active ? "var(--accent)" : "transparent",
                    border: step.active
                      ? "1px solid var(--accent)"
                      : "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    fontFamily: "var(--mono)",
                    fontWeight: 700,
                    color: step.active ? "#0b0c0d" : "var(--text-4)",
                    boxShadow: step.active
                      ? "0 0 12px rgba(196,255,70,0.35)"
                      : "none",
                    transition: "all 0.2s",
                  }}
                >
                  {i + 1}
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <div
                    style={{
                      width: 1,
                      height: 28,
                      background: step.active
                        ? "rgba(196,255,70,0.2)"
                        : "var(--border)",
                      marginTop: 3,
                    }}
                  />
                )}
              </div>
              {/* Label */}
              <div
                style={{
                  paddingTop: 3,
                  paddingBottom: i < FLOW_STEPS.length - 1 ? 24 : 0,
                  fontSize: 12,
                  fontWeight: step.active ? 600 : 400,
                  color: step.active ? "var(--text-1)" : "var(--text-4)",
                  opacity: step.active ? 1 : 0.5,
                }}
              >
                {step.label}
              </div>
            </div>
          ))}

          {/* Info box */}
          <div
            style={{
              marginTop: 36,
              padding: "14px 16px",
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: "var(--accent-dim)",
                  border: "1px solid rgba(196,255,70,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-1)",
                }}
              >
                How it works
              </span>
            </div>
            <p
              style={{
                fontSize: 11,
                color: "var(--text-4)",
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              Payer locks sBTC. Receiver gets paid when conditions are
              confirmed. Arbitrator resolves disputes.
            </p>
          </div>
        </div>

        {/* ── Main content ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div className="fade-up" style={{ marginBottom: 40 }}>
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                color: "var(--accent)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              Step 1 of 6
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(28px, 4vw, 46px)",
                fontWeight: 800,
                letterSpacing: "-0.04em",
                lineHeight: 1.05,
                color: "var(--text-1)",
                marginBottom: 12,
              }}
            >
              What type of
              <br />
              <span style={{ color: "var(--accent)" }}>agreement?</span>
            </h1>
            <p
              style={{
                fontSize: 14,
                color: "var(--text-3)",
                lineHeight: 1.7,
                maxWidth: 460,
              }}
            >
              One party locks funds — the other receives them when conditions
              are met. Choose a template to begin.
            </p>
          </div>

          {/* Type cards grid */}
          <div className="fade-up d2 st-grid">
            {TYPES.map((t) => {
              const isSelected = selected === t.type;
              return (
                <button
                  key={t.type}
                  className={`st-card${isSelected ? " st-card--selected" : ""}`}
                  style={{ "--card-accent": t.accentColor } as any}
                  onClick={() => {
                    dispatch(setAgreementType(t.type));
                    setTimeout(() => dispatch(setScreen("describe")), 160);
                  }}
                >
                  {/* Top row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: isSelected
                          ? t.accentColor + "18"
                          : "var(--bg-3)",
                        border: `1px solid ${isSelected ? t.accentColor + "40" : "var(--border)"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        color: isSelected ? t.accentColor : "var(--text-3)",
                        transition: "all 0.2s",
                        boxShadow: isSelected
                          ? `0 0 16px ${t.accentColor}20`
                          : "none",
                      }}
                    >
                      {t.icon}
                    </div>

                    {isSelected ? (
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "var(--accent)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 0 10px rgba(196,255,70,0.4)",
                        }}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#0b0c0d"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    ) : (
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          border: "1px solid var(--border)",
                        }}
                      />
                    )}
                  </div>

                  {/* Title */}
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      fontFamily: "var(--font-display)",
                      color: "var(--text-1)",
                      marginBottom: 7,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {t.title}
                  </div>

                  {/* Desc */}
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--text-3)",
                      lineHeight: 1.65,
                      marginBottom: 16,
                    }}
                  >
                    {t.desc}
                  </p>

                  {/* Example tags */}
                  <div
                    style={{
                      display: "flex",
                      gap: 5,
                      flexWrap: "wrap",
                      marginBottom: 16,
                    }}
                  >
                    {t.examples.map((ex) => (
                      <span
                        key={ex}
                        style={{
                          fontSize: 9,
                          fontFamily: "var(--mono)",
                          color: "var(--text-4)",
                          background: "var(--bg-3)",
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          padding: "2px 7px",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {ex}
                      </span>
                    ))}
                  </div>

                  {/* Role chips */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      paddingTop: 12,
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--mono)",
                        color: isSelected ? t.accentColor : "var(--text-2)",
                        background: isSelected
                          ? t.accentColor + "12"
                          : "var(--bg-3)",
                        border: `1px solid ${isSelected ? t.accentColor + "30" : "var(--border-hi)"}`,
                        borderRadius: 5,
                        padding: "2px 9px",
                        letterSpacing: "0.04em",
                        transition: "all 0.2s",
                      }}
                    >
                      {t.payerLabel}
                    </span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--text-4)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--mono)",
                        color: "var(--text-4)",
                        background: "var(--bg-3)",
                        border: "1px solid var(--border)",
                        borderRadius: 5,
                        padding: "2px 9px",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {t.receiverLabel}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Info strip */}
          <div
            className="fade-up d3"
            style={{
              marginTop: 24,
              padding: "16px 18px",
              background: "var(--bg-1)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                flexShrink: 0,
                border: "1px solid var(--border)",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--bg-3)",
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-3)"
                strokeWidth="1.5"
                strokeLinecap="round"
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
                  marginBottom: 5,
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
/* Sidebar */
.st-sidebar {
  width: 210px;
  flex-shrink: 0;
  padding-top: 4px;
}
@media (max-width: 700px) { .st-sidebar { display: none; } }

/* Cards grid */
.st-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 600px) { .st-grid { grid-template-columns: 1fr; } }

/* Card base */
.st-card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 18px;
  text-align: left;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.16,1,0.3,1);
  position: relative;
  overflow: hidden;
}
.st-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at top left, var(--card-accent, var(--accent)) 0%, transparent 60%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}
.st-card:hover {
  background: var(--bg-2);
  border-color: var(--border-hi);
  transform: translateY(-1px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.25);
}
.st-card:hover::before { opacity: 0.04; }
.st-card--selected {
  background: var(--bg-2);
  border-color: var(--border-hi);
  box-shadow: 0 0 0 1px var(--border-hi);
}
.st-card--selected::before { opacity: 0.06; }
`;
