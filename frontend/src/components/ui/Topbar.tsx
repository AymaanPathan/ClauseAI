"use client";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setScreen, resetAll } from "../../store/slices/agreementSlice";

const STEPS = [
  { id: "select-type", label: "Type" },
  { id: "describe", label: "Describe" },
  { id: "parsed-terms", label: "Review" },
  { id: "connect-wallet", label: "Wallet" },
  { id: "share-link", label: "Share" },
  { id: "lock-funds", label: "Lock" },
  { id: "dashboard", label: "Live" },
];

export default function Topbar() {
  const dispatch = useAppDispatch();
  const screen = useAppSelector((s) => s.agreement.currentScreen);
  const stepIdx = STEPS.findIndex((s) => s.id === screen);

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "rgba(8,8,8,0.85)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--black-4)",
        padding: "0 24px",
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      {/* Logo */}
      <button
        onClick={() => dispatch(resetAll())}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "var(--yellow)",
            letterSpacing: "-0.5px",
          }}
        >
          Clause
        </span>
        <span
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "var(--white)",
            letterSpacing: "-0.5px",
          }}
        >
          Ai
        </span>
      </button>

      {/* Step indicators */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {STEPS.map((step, i) => {
          const done = i < stepIdx;
          const active = i === stepIdx;
          return (
            <div
              key={step.id}
              style={{ display: "flex", alignItems: "center", gap: 4 }}
            >
              <div
                style={{
                  width: active ? "auto" : 6,
                  height: 6,
                  padding: active ? "2px 10px" : 0,
                  borderRadius: 99,
                  background: active
                    ? "var(--yellow)"
                    : done
                      ? "var(--yellow)"
                      : "var(--black-5)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--black)",
                  display: "flex",
                  alignItems: "center",
                  transition: "all 0.3s ease",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {active ? step.label : ""}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  style={{
                    width: 12,
                    height: 1,
                    background: done ? "var(--yellow)" : "var(--black-4)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Right side */}
      <div
        style={{
          fontSize: 11,
          color: "var(--grey-1)",
          fontFamily: "var(--font-mono)",
        }}
      >
        Stacks Testnet
      </div>
    </div>
  );
}
