"use client";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setScreen, setAgreementType } from "../../store/slices/agreementSlice";
import { AgreementType } from "@/api/parseApi";

const TYPES: {
  type: AgreementType;
  icon: string;
  title: string;
  desc: string;
  examples: string[];
  payerLabel: string;
  receiverLabel: string;
}[] = [
  {
    type: "freelance",
    icon: "💼",
    title: "Freelance Work",
    desc: "Payer locks funds in escrow. Released to freelancer when work is delivered and confirmed.",
    examples: ["Logo design", "Web development", "Writing", "Video editing"],
    payerLabel: "Client",
    receiverLabel: "Freelancer",
  },
  {
    type: "rental",
    icon: "🏠",
    title: "Rental / Equipment",
    desc: "Renter locks a deposit on-chain. Auto-release on return, or arbitrate damage claims.",
    examples: ["Camera gear", "Apartment deposit", "Vehicle", "Office space"],
    payerLabel: "Renter",
    receiverLabel: "Owner",
  },
  {
    type: "trade",
    icon: "🌾",
    title: "Trade & Commerce",
    desc: "Buyer locks payment. Released to seller on delivery confirmation. No trust required.",
    examples: ["Agricultural goods", "Equipment", "P2P marketplace", "Exports"],
    payerLabel: "Buyer",
    receiverLabel: "Seller",
  },
  {
    type: "bet",
    icon: "🎲",
    title: "Simple Bet",
    desc: "Lock stakes on-chain. Winner takes all when the condition resolves via arbitrator.",
    examples: [
      "Sports outcome",
      "Price target",
      "Election result",
      "Any event",
    ],
    payerLabel: "Bettor A",
    receiverLabel: "Bettor B",
  },
];

export default function ScreenSelectType() {
  const dispatch = useAppDispatch();
  const selected = useAppSelector((s) => s.agreement.agreementType);

  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 24px",
      }}
    >
      <div style={{ maxWidth: 860, width: "100%" }}>
        <div
          className="animate-fade-up"
          style={{ marginBottom: 48, textAlign: "center" }}
        >
          <p
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--yellow)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            Step 1 of 6
          </p>
          <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-1px" }}>
            What type of agreement?
          </h2>
          <p style={{ color: "var(--grey-1)", marginTop: 12, fontSize: 15 }}>
            Choose a template. One party locks funds — the other receives them
            when conditions are met.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
          }}
        >
          {TYPES.map((t, i) => {
            const isSelected = selected === t.type;
            return (
              <button
                key={t.type}
                className={`animate-fade-up delay-${i + 1}`}
                onClick={() => {
                  dispatch(setAgreementType(t.type));
                  setTimeout(() => dispatch(setScreen("describe")), 200);
                }}
                style={{
                  background: isSelected
                    ? "var(--yellow-dim)"
                    : "var(--black-2)",
                  border: `1px solid ${isSelected ? "var(--yellow)" : "var(--black-4)"}`,
                  borderRadius: 16,
                  padding: "24px 20px",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "all var(--transition)",
                  position: "relative",
                  overflow: "hidden",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.borderColor =
                      "var(--grey-2)";
                    (e.currentTarget as HTMLElement).style.background =
                      "var(--black-3)";
                    (e.currentTarget as HTMLElement).style.transform =
                      "translateY(-2px)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.borderColor =
                      "var(--black-4)";
                    (e.currentTarget as HTMLElement).style.background =
                      "var(--black-2)";
                    (e.currentTarget as HTMLElement).style.transform =
                      "translateY(0)";
                  }
                }}
              >
                {isSelected && (
                  <div
                    style={{
                      position: "absolute",
                      top: 12,
                      right: 12,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "var(--yellow)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      color: "var(--black)",
                      fontWeight: 800,
                    }}
                  >
                    ✓
                  </div>
                )}

                <div style={{ fontSize: 28, marginBottom: 12 }}>{t.icon}</div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: isSelected ? "var(--yellow)" : "var(--white)",
                    marginBottom: 8,
                  }}
                >
                  {t.title}
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--grey-1)",
                    lineHeight: 1.6,
                    marginBottom: 16,
                  }}
                >
                  {t.desc}
                </p>

                {/* Role indicators */}
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    marginBottom: 14,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      background: isSelected
                        ? "rgba(245,196,0,0.15)"
                        : "var(--black-4)",
                      border: `1px solid ${isSelected ? "var(--yellow)" : "transparent"}`,
                      color: isSelected ? "var(--yellow)" : "var(--grey-1)",
                      borderRadius: 4,
                      padding: "3px 8px",
                    }}
                  >
                    💸 {t.payerLabel}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      background: "var(--black-4)",
                      color: "var(--grey-1)",
                      borderRadius: 4,
                      padding: "3px 8px",
                    }}
                  >
                    → {t.receiverLabel}
                  </span>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {t.examples.map((ex) => (
                    <span
                      key={ex}
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        background: "var(--black-4)",
                        color: "var(--grey-2)",
                        borderRadius: 4,
                        padding: "2px 7px",
                      }}
                    >
                      {ex}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* How it works callout */}
        <div
          className="animate-fade-up delay-5"
          style={{
            marginTop: 32,
            padding: "16px 20px",
            background: "var(--black-2)",
            border: "1px solid var(--black-4)",
            borderRadius: 12,
            display: "flex",
            gap: 16,
            alignItems: "flex-start",
          }}
        >
          <span style={{ fontSize: 20, flexShrink: 0 }}>⚡</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              How conditional escrow works
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--grey-1)",
                lineHeight: 1.7,
                margin: 0,
              }}
            >
              The <strong style={{ color: "var(--white)" }}>payer</strong> locks
              funds into a Bitcoin-secured smart contract. The{" "}
              <strong style={{ color: "var(--white)" }}>receiver</strong> gets
              paid when conditions are confirmed — or funds auto-refund after
              the deadline. The{" "}
              <strong style={{ color: "var(--white)" }}>arbitrator</strong>{" "}
              resolves disputes if they arise.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
