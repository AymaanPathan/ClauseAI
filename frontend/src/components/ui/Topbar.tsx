"use client";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setScreen } from "@/store/slices/agreementSlice";

export default function Topbar() {
  const dispatch = useAppDispatch();
  const screen = useAppSelector((s) => s.agreement.currentScreen);

  const STEPS = [
    { key: "select-type", label: "Type" },
    { key: "describe", label: "Describe" },
    { key: "parsed-terms", label: "Review" },
    { key: "connect-wallet", label: "Wallet" },
    { key: "share-link", label: "Invite" },
    { key: "lock-funds", label: "Lock" },
  ];

  const currentIndex = STEPS.findIndex((s) => s.key === screen);

  return (
    <header className="topbar">
      {/* Logo */}
      <button
        onClick={() => dispatch(setScreen("landing"))}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: 0,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text-1)",
            letterSpacing: "-0.03em",
          }}
        >
          Clause
        </span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 300,
            color: "var(--text-3)",
            letterSpacing: "-0.03em",
          }}
        >
          Ai
        </span>
      </button>

      {/* Step progress */}
      {currentIndex >= 0 && (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 0,
          }}
        >
          {STEPS.map((step, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            const future = i > currentIndex;
            return (
              <div
                key={step.key}
                style={{ display: "flex", alignItems: "center" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 10px",
                    borderRadius: 99,
                    background: active ? "var(--bg-3)" : "transparent",
                    border: active
                      ? "1px solid var(--border-hi)"
                      : "1px solid transparent",
                    transition: "all var(--fast) var(--ease)",
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: done
                        ? "var(--green)"
                        : active
                          ? "var(--text-1)"
                          : "var(--bg-5)",
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--mono)",
                      color: active
                        ? "var(--text-1)"
                        : done
                          ? "var(--text-3)"
                          : "var(--text-4)",
                      letterSpacing: "0.04em",
                      fontWeight: active ? 500 : 400,
                    }}
                  >
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    style={{
                      width: 20,
                      height: 1,
                      background:
                        i < currentIndex ? "var(--border-hi)" : "var(--border)",
                      margin: "0 2px",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Right */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}
      >
        <div className="badge">
          <span className="dot dot-active" />
          Stacks Testnet
        </div>
      </div>
    </header>
  );
}
