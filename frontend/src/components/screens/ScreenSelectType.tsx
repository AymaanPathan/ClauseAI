"use client";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setScreen, setAgreementType } from "../../../useAppSelector/slices/agreementSlice";
import { AgreementType } from "@/api/parseApi";

const TYPES: {
  type: AgreementType;
  icon: string;
  title: string;
  desc: string;
  examples: string[];
}[] = [
  {
    type: "freelance",
    icon: "💼",
    title: "Freelance Work",
    desc: "Lock payment until work is delivered. Auto-release or dispute with arbitrator.",
    examples: ["Logo design", "Web development", "Writing", "Video editing"],
  },
  {
    type: "rental",
    icon: "🏠",
    title: "Rental Deposit",
    desc: "Secure a deposit on-chain. Auto-refund on move-out, or arbitrate damage claims.",
    examples: ["Apartment", "Car", "Equipment", "Office space"],
  },
  {
    type: "bet",
    icon: "🎲",
    title: "Simple Bet",
    desc: "Lock stakes on-chain. Winner takes all when the condition resolves.",
    examples: [
      "Sports outcome",
      "Price target",
      "Election result",
      "Any event",
    ],
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
      <div style={{ maxWidth: 760, width: "100%" }}>
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
            Choose a template. We&apos;ll guide the AI to parse your specific
            situation.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
                  padding: "28px 24px",
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
                      top: 14,
                      right: 14,
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

                <div style={{ fontSize: 32, marginBottom: 16 }}>{t.icon}</div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: isSelected ? "var(--yellow)" : "var(--white)",
                    marginBottom: 10,
                  }}
                >
                  {t.title}
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--grey-1)",
                    lineHeight: 1.6,
                    marginBottom: 20,
                  }}
                >
                  {t.desc}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {t.examples.map((ex) => (
                    <span
                      key={ex}
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        background: "var(--black-4)",
                        color: "var(--grey-1)",
                        borderRadius: 4,
                        padding: "3px 8px",
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
      </div>
    </div>
  );
}
