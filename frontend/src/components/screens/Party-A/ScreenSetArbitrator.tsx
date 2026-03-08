"use client";
// ============================================================
// ScreenSetArbitrator.tsx
// Step 4.5 — Party A sets an arbitrator address.
// The address is stored in editedTerms and pushed to the
// presence store so Party B can see it when they join.
//
// Flow:
//   ScreenConnectWallet → ScreenSetArbitrator → ScreenShareLink
//   (Party B sees ScreenApproveAgreement after connecting)
// ============================================================

import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setScreen, updateEditedTerms } from "@/store/slices/agreementSlice";

const KNOWN_ARBITRATORS = [
  {
    address: "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ",
    name: "ClauseAI Default Arbitrator",
    desc: "Managed multi-sig arbitration service. 48h response SLA.",
    fee: "1%",
    rating: "4.9",
    icon: "⚖️",
  },
  {
    address: "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE",
    name: "Community Arbitrator Pool",
    desc: "Decentralised panel of vetted community arbitrators.",
    fee: "0.5%",
    rating: "4.7",
    icon: "🏛️",
  },
];

export default function ScreenSetArbitrator() {
  const dispatch = useAppDispatch();
  const { editedTerms } = useAppSelector((s) => s.agreement);

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

  const selectedPreset = KNOWN_ARBITRATORS.find((a) => a.address === address);

  return (
    <div className="page" style={{ alignItems: "flex-start", paddingTop: 64 }}>
      <style>{css}</style>
      <div style={{ maxWidth: 560, width: "100%" }}>
        {/* ── Header ───────────────────────────────────────── */}
        <div className="fade-up" style={{ marginBottom: 36 }}>
          <button
            onClick={() => dispatch(setScreen("parsed-terms"))}
            style={backBtnStyle}
          >
            ← Back
          </button>

          <div
            className="step-counter"
            style={{ display: "block", marginBottom: 12 }}
          >
            Step 4 of 6
          </div>

          <h2 style={titleStyle}>Choose an arbitrator</h2>
          <p style={subtitleStyle}>
            The arbitrator resolves disputes if they arise. Both parties must
            approve the arbitrator before funds are locked.
          </p>
        </div>

        {/* ── What is an arbitrator callout ───────────────── */}
        <div className="fade-up d1" style={infoBoxStyle}>
          <div style={{ fontSize: 20, flexShrink: 0 }}>🔐</div>
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#f2f2f0",
                marginBottom: 4,
              }}
            >
              Why this matters
            </div>
            <p
              style={{
                fontSize: 12,
                color: "rgba(242,242,240,0.45)",
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              If a dispute arises, the arbitrator's wallet will be able to call{" "}
              <code style={codeStyle}>resolve-to-receiver</code> or{" "}
              <code style={codeStyle}>resolve-to-payer</code> on the Clarity
              contract. Both parties see and approve this address before any
              funds are locked.
            </p>
          </div>
        </div>

        {/* ── Preset arbitrators ───────────────────────────── */}
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
                  style={{
                    ...presetCardStyle,
                    borderColor: isSelected
                      ? "rgba(242,242,240,0.22)"
                      : "rgba(242,242,240,0.08)",
                    background: isSelected ? "#1a1a1a" : "#0f0f0f",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flex: 1,
                    }}
                  >
                    <div style={arbIconStyle}>{arb.icon}</div>
                    <div style={{ textAlign: "left", flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#f2f2f0",
                          marginBottom: 3,
                        }}
                      >
                        {arb.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "rgba(242,242,240,0.4)",
                          lineHeight: 1.5,
                        }}
                      >
                        {arb.desc}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          fontFamily: "monospace",
                          color: "rgba(242,242,240,0.25)",
                          marginTop: 5,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {arb.address.slice(0, 14)}…{arb.address.slice(-6)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#22c55e",
                          marginBottom: 2,
                        }}
                      >
                        ★ {arb.rating}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          fontFamily: "monospace",
                          color: "rgba(242,242,240,0.3)",
                        }}
                      >
                        Fee: {arb.fee}
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <div style={checkmarkStyle}>
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
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Custom address ───────────────────────────────── */}
        <div className="fade-up d3" style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: customMode ? 10 : 0,
            }}
          >
            <div
              style={{
                flex: 1,
                height: 1,
                background: "rgba(242,242,240,0.08)",
              }}
            />
            <button
              onClick={() => {
                setCustomMode(!customMode);
                if (!customMode) setAddress("");
              }}
              style={{
                background: "none",
                border: "1px solid rgba(242,242,240,0.1)",
                borderRadius: 99,
                color: "rgba(242,242,240,0.4)",
                fontSize: 11,
                fontFamily: "monospace",
                padding: "5px 14px",
                cursor: "pointer",
                letterSpacing: "0.04em",
                transition: "all 0.15s",
              }}
            >
              {customMode ? "↑ Hide custom" : "Enter custom address →"}
            </button>
            <div
              style={{
                flex: 1,
                height: 1,
                background: "rgba(242,242,240,0.08)",
              }}
            />
          </div>

          {customMode && (
            <div style={{ animation: "arb-slide-down 0.25s ease both" }}>
              <label style={labelStyle}>
                Custom arbitrator address (Stacks SP…)
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
                  fontFamily: "monospace",
                  fontSize: 12,
                  borderColor: focused
                    ? "rgba(242,242,240,0.22)"
                    : "rgba(242,242,240,0.08)",
                }}
              />
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "rgba(242,242,240,0.2)",
                  marginTop: 6,
                }}
              >
                Must be a valid Stacks principal that can sign transactions
              </div>
            </div>
          )}
        </div>

        {/* Selected arbitrator summary */}
        {(selectedPreset || (customMode && address.trim().length > 10)) && (
          <div
            className="fade-in"
            style={{
              background: "rgba(34,197,94,0.06)",
              border: "1px solid rgba(34,197,94,0.18)",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ color: "#22c55e", fontSize: 14 }}>✓</span>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#22c55e",
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
                  fontFamily: "monospace",
                  color: "rgba(242,242,240,0.3)",
                }}
              >
                {address.slice(0, 18)}…{address.slice(-8)}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
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
            Confirm Arbitrator & Continue
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
              fontFamily: "monospace",
              color: "rgba(242,242,240,0.2)",
              marginTop: 4,
            }}
          >
            Party B will see and must approve this choice before funds are
            locked
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────

const backBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "rgba(242,242,240,0.35)",
  fontSize: 11,
  cursor: "pointer",
  marginBottom: 20,
  fontFamily: "monospace",
  letterSpacing: "0.04em",
  padding: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: "clamp(24px, 3.5vw, 36px)",
  fontWeight: 700,
  letterSpacing: "-0.04em",
  lineHeight: 1.1,
  marginBottom: 10,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: "rgba(242,242,240,0.55)",
  lineHeight: 1.7,
};

const infoBoxStyle: React.CSSProperties = {
  display: "flex",
  gap: 14,
  background: "#0f0f0f",
  border: "1px solid rgba(242,242,240,0.07)",
  borderRadius: 10,
  padding: "14px 16px",
  marginBottom: 24,
  alignItems: "flex-start",
};

const codeStyle: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: 11,
  background: "rgba(242,242,240,0.08)",
  border: "1px solid rgba(242,242,240,0.1)",
  borderRadius: 4,
  padding: "1px 5px",
  color: "#f5c400",
};

const presetCardStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: 12,
  border: "1px solid",
  borderRadius: 12,
  padding: "14px 16px",
  cursor: "pointer",
  transition: "all 0.15s",
  width: "100%",
  textAlign: "left",
};

const arbIconStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 10,
  background: "rgba(242,242,240,0.05)",
  border: "1px solid rgba(242,242,240,0.08)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 18,
  flexShrink: 0,
};

const checkmarkStyle: React.CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  width: 20,
  height: 20,
  borderRadius: "50%",
  background: "#f2f2f0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontFamily: "monospace",
  color: "rgba(242,242,240,0.35)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 8,
};

const css = `
@keyframes arb-slide-down {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;
