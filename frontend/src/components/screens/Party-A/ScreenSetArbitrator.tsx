"use client";
import { useState } from "react";

import { setScreen, updateEditedTerms } from "@/store/slices/partyASlice";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/store";

const KNOWN_ARBITRATORS = [
  {
    address: "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ",
    name: "ClauseAI Default",
    desc: "Managed multi-sig arbitration. 48h response SLA.",
    fee: "1%",
    rating: "4.9",
  },
  {
    address: "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE",
    name: "Community Pool",
    desc: "Decentralised panel of vetted community arbitrators.",
    fee: "0.5%",
    rating: "4.7",
  },
];

export default function ScreenSetArbitrator() {
  const dispatch = useDispatch<AppDispatch>();
  const { editedTerms } = useSelector((s: RootState) => s.partyA);

  const existingArb = (editedTerms as any)?.arbitrator ?? "";
  const [address, setAddress] = useState(
    existingArb === "TBD" ? "" : existingArb,
  );
  const [customMode, setCustomMode] = useState(
    !!existingArb &&
      existingArb !== "TBD" &&
      !KNOWN_ARBITRATORS.find((a) => a.address === existingArb),
  );
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const isValid =
    address.trim().length >= 10 || address.trim().toLowerCase() === "tbd";
  const selectedPreset = KNOWN_ARBITRATORS.find((a) => a.address === address);

  function selectPreset(addr: string) {
    setAddress(addr);
    setCustomMode(false);
    setError(null);
  }

  function handleContinue() {
    if (!isValid) {
      setError(
        "Enter a valid Stacks address (SP…) or choose a preset arbitrator.",
      );
      return;
    }
    dispatch(
      updateEditedTerms({ arbitrator: address.trim() || "TBD" } as never),
    );
    dispatch(setScreen("share-link"));
  }

  function handleSkip() {
    dispatch(updateEditedTerms({ arbitrator: "TBD" } as never));
    dispatch(setScreen("share-link"));
  }

  return (
    <div className="page" style={{ alignItems: "flex-start", paddingTop: 64 }}>
      <style>{css}</style>
      <div style={{ maxWidth: 560, width: "100%" }}>
        {/* Header */}
        <div className="fade-up" style={{ marginBottom: 36 }}>
          <button
            onClick={() => dispatch(setScreen("parsed-terms"))}
            className="back-btn"
          >
            ← Back
          </button>
          <div
            className="step-counter"
            style={{ display: "block", marginBottom: 12 }}
          >
            Step 4 of 6
          </div>
          <h2
            style={{
              fontSize: "clamp(24px, 3.5vw, 40px)",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              marginBottom: 10,
            }}
          >
            Choose an arbitrator
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
            The arbitrator resolves disputes if they arise. Both parties will
            see and approve this choice before any funds are locked.
          </p>
        </div>

        {/* Why this matters */}
        <div
          className="fade-up d1"
          style={{
            background: "var(--bg-1)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
            padding: "14px 16px",
            marginBottom: 24,
            display: "flex",
            gap: 12,
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
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
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
              Why this matters
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-3)",
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              Their wallet can call{" "}
              <code className="inline-code">resolve-to-receiver</code> or{" "}
              <code className="inline-code">resolve-to-payer</code> on the
              Clarity contract if a dispute arises.
            </p>
          </div>
        </div>

        {/* Preset arbitrators */}
        <div className="fade-up d2" style={{ marginBottom: 20 }}>
          <div className="label" style={{ marginBottom: 10 }}>
            Recommended arbitrators
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {KNOWN_ARBITRATORS.map((arb) => {
              const isSelected = address === arb.address && !customMode;
              return (
                <button
                  key={arb.address}
                  onClick={() => selectPreset(arb.address)}
                  className={`arb-card${isSelected ? " arb-card--selected" : ""}`}
                >
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text-1)",
                        }}
                      >
                        {arb.name}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: "var(--mono)",
                          color: "var(--green)",
                          fontWeight: 700,
                        }}
                      >
                        ★ {arb.rating}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-3)",
                        lineHeight: 1.5,
                        marginBottom: 5,
                      }}
                    >
                      {arb.desc}
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        fontFamily: "var(--mono)",
                        color: "var(--text-4)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {arb.address.slice(0, 14)}…{arb.address.slice(-6)}
                    </div>
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      flexShrink: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--mono)",
                        color: "var(--text-3)",
                      }}
                    >
                      Fee: {arb.fee}
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
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom address */}
        <div className="fade-up d3" style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: customMode ? 12 : 0,
            }}
          >
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <button
              onClick={() => setCustomMode(!customMode)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-3)",
                fontSize: 11,
                fontFamily: "var(--mono)",
                cursor: "pointer",
                padding: "0 4px",
                letterSpacing: "0.04em",
              }}
            >
              {customMode ? "Hide custom" : "Use custom address"}
            </button>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          {customMode && (
            <div style={{ animation: "slide-down 0.2s ease both" }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  color: "var(--text-3)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase" as const,
                  marginBottom: 8,
                }}
              >
                Custom Stacks address (SP…)
              </label>
              <input
                className="input"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setError(null);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ"
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  borderColor: focused ? "var(--border-hi)" : "var(--border)",
                }}
              />
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: "var(--text-4)",
                  marginTop: 6,
                }}
              >
                Must be a valid Stacks principal that can sign transactions
              </div>
            </div>
          )}
        </div>

        {/* Selected summary */}
        {(selectedPreset || (customMode && address.trim().length > 10)) && (
          <div
            className="fade-in"
            style={{
              background: "rgba(34,197,94,0.06)",
              border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: "var(--r-sm)",
              padding: "12px 16px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--green)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--green)",
                  marginBottom: 2,
                }}
              >
                {selectedPreset
                  ? selectedPreset.name
                  : "Custom arbitrator selected"}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: "var(--text-4)",
                }}
              >
                {address.slice(0, 18)}…{address.slice(-8)}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="error-box fade-in" style={{ marginBottom: 16 }}>
            ⚠ {error}
          </div>
        )}

        {/* CTAs */}
        <div
          className="fade-up d4"
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <button
            className="btn btn-primary btn-lg"
            onClick={handleContinue}
            disabled={!isValid && address.trim().length > 0}
            style={{ width: "100%" }}
          >
            Confirm & Share Agreement
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
          <button
            className="btn btn-ghost"
            onClick={handleSkip}
            style={{ width: "100%" }}
          >
            Skip — decide later (TBD)
          </button>
          <p
            style={{
              textAlign: "center",
              fontSize: 11,
              fontFamily: "var(--mono)",
              color: "var(--text-4)",
              marginTop: 4,
            }}
          >
            Party B will review and must approve this choice
          </p>
        </div>
      </div>
    </div>
  );
}

const css = `
.back-btn { background: none; border: none; color: var(--text-3); font-size: 11px; cursor: pointer; margin-bottom: 20px; font-family: var(--mono); letter-spacing: 0.04em; padding: 0; }
.arb-card { display: flex; align-items: center; gap: 14px; border: 1px solid var(--border); border-radius: var(--r-md); padding: 14px 16px; cursor: pointer; transition: all var(--fast) var(--ease); background: var(--bg-1); width: 100%; text-align: left; }
.arb-card:hover { background: var(--bg-2); border-color: var(--border-hi); }
.arb-card--selected { background: var(--bg-3); border-color: var(--border-hi); }
.inline-code { font-family: var(--mono); font-size: 11px; background: var(--bg-3); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; color: var(--amber); }
@keyframes slide-down { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
`;
