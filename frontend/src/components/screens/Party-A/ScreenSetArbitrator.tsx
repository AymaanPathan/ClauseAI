"use client";
import { useState } from "react";

import { setScreen, updateEditedTerms } from "@/store/slices/partyASlice";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/store";

export default function ScreenSetArbitrator() {
  const dispatch = useDispatch<AppDispatch>();
  const { editedTerms } = useSelector((s: RootState) => s.partyA);

  const existingArb = (editedTerms as any)?.arbitrator ?? "";
  const [address, setAddress] = useState(
    existingArb === "TBD" ? "" : existingArb,
  );
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);

  const trimmed = address.trim();
  const isValid = trimmed.length >= 10;
  const showValidState = touched && isValid;
  const showErrorState = touched && !isValid && trimmed.length > 0;

  function handleContinue() {
    setTouched(true);
    if (!isValid && trimmed.length > 0) {
      setError("Enter a valid Stacks address (SP…) — minimum 10 characters.");
      return;
    }
    if (trimmed.length === 0) {
      setError("Please enter an arbitrator address or skip to decide later.");
      return;
    }
    dispatch(updateEditedTerms({ arbitrator: trimmed } as never));
    dispatch(setScreen("share-link"));
  }

  function handleSkip() {
    dispatch(updateEditedTerms({ arbitrator: "TBD" } as never));
    dispatch(setScreen("share-link"));
  }

  return (
    <div className="page" style={{ alignItems: "flex-start", paddingTop: 64 }}>
      <style>{css}</style>
      <div style={{ maxWidth: 520, width: "100%" }}>
        {/* Back */}
        <button
          onClick={() => dispatch(setScreen("parsed-terms"))}
          className="back-btn fade-up"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back
        </button>

        {/* Header */}
        <div className="fade-up d1" style={{ marginBottom: 40 }}>
          <div
            className="step-counter"
            style={{ display: "block", marginBottom: 12 }}
          >
            Step 4 of 6
          </div>
          <h2
            style={{
              fontSize: "clamp(26px, 4vw, 42px)",
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              letterSpacing: "-0.05em",
              lineHeight: 1.0,
              marginBottom: 12,
              color: "var(--text-1)",
            }}
          >
            Set an{" "}
            <em style={{ fontStyle: "normal", color: "var(--accent)" }}>
              arbitrator
            </em>
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-3)",
              lineHeight: 1.75,
              maxWidth: 400,
            }}
          >
            The arbitrator's wallet can call{" "}
            <code className="inline-code">resolve-to-receiver</code> or{" "}
            <code className="inline-code">resolve-to-payer</code> on the Clarity
            contract if a dispute arises. Both parties must approve this choice.
          </p>
        </div>

        {/* What is an arbitrator — info card */}
        <div className="fade-up d2 info-card" style={{ marginBottom: 28 }}>
          <div className="info-card-icon">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
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
                marginBottom: 5,
              }}
            >
              What does an arbitrator do?
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-3)",
                lineHeight: 1.7,
                margin: 0,
              }}
            >
              A neutral third party — a trusted person, DAO, or multisig — who
              reviews evidence and resolves disputes. They never hold funds;
              they only call the contract function. Choose someone both parties
              trust before signing.
            </p>
          </div>
        </div>

        {/* Input field */}
        <div className="fade-up d3" style={{ marginBottom: 10 }}>
          <label className="field-label">Arbitrator Stacks address</label>
          <div
            className={`input-wrap${focused ? " input-wrap--focused" : ""}${showValidState ? " input-wrap--valid" : ""}${showErrorState ? " input-wrap--error" : ""}`}
          >
            {/* Prefix icon */}
            <div className="input-prefix">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>

            <input
              className="arb-input"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setError(null);
                if (touched) setTouched(false);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                if (address.trim().length > 0) setTouched(true);
              }}
              placeholder="SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="none"
            />

            {/* Status icon */}
            {showValidState && (
              <div className="input-suffix input-suffix--valid">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
            {showErrorState && (
              <div className="input-suffix input-suffix--error">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
            )}
          </div>

          {/* Helper text */}
          <div className="input-helper">
            {showErrorState ? (
              <span style={{ color: "var(--red)" }}>
                ⚠ Must be a valid Stacks principal (SP…) — at least 10
                characters
              </span>
            ) : showValidState ? (
              <span style={{ color: "var(--green)" }}>
                ✓ Valid address format
              </span>
            ) : (
              <span>Must be a Stacks principal that can sign transactions</span>
            )}
          </div>
        </div>

        {/* Address preview card — shown when valid */}
        {showValidState && (
          <div className="preview-card fade-in" style={{ marginBottom: 28 }}>
            <div className="preview-card-dot" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--green)",
                  marginBottom: 3,
                }}
              >
                Arbitrator selected
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: "var(--text-4)",
                  letterSpacing: "0.04em",
                  wordBreak: "break-all",
                }}
              >
                {trimmed.slice(0, 22)}…{trimmed.slice(-10)}
              </div>
            </div>
            <div className="preview-card-badge">Party B must approve</div>
          </div>
        )}

        {/* Error box */}
        {error && (
          <div className="error-box fade-in" style={{ marginBottom: 20 }}>
            ⚠ {error}
          </div>
        )}

        {/* CTAs */}
        <div
          className="fade-up d4"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginTop: showValidState ? 0 : 28,
          }}
        >
          <button
            className={`btn btn-primary btn-lg cta-primary${isValid ? " cta-primary--active" : ""}`}
            onClick={handleContinue}
            style={{ width: "100%", position: "relative", overflow: "hidden" }}
          >
            <span className="cta-shimmer" />
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Confirm & Share Agreement
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>

          <button
            className="btn btn-ghost skip-btn"
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
              marginTop: 6,
              lineHeight: 1.6,
            }}
          >
            Party B will review and must approve this choice
            <br />
            before any funds are locked on-chain
          </p>
        </div>
      </div>
    </div>
  );
}

const css = `
/* Back button */
.back-btn {
  display: inline-flex; align-items: center; gap: 7px;
  background: none; border: none;
  color: var(--text-4); font-size: 11px;
  cursor: pointer; margin-bottom: 28px;
  font-family: var(--mono); letter-spacing: 0.04em; padding: 0;
  transition: color 0.15s;
}
.back-btn:hover { color: var(--text-2); }

/* Info card */
.info-card {
  display: flex; gap: 14px; align-items: flex-start;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 16px 18px;
}
.info-card-icon {
  width: 32px; height: 32px; flex-shrink: 0;
  border: 1px solid rgba(196,255,70,0.20);
  border-radius: var(--r-sm);
  display: flex; align-items: center; justify-content: center;
  background: rgba(196,255,70,0.06);
  margin-top: 1px;
}

/* Field label */
.field-label {
  display: block;
  font-size: 11px; font-family: var(--mono);
  color: var(--text-3); letter-spacing: 0.08em;
  text-transform: uppercase; margin-bottom: 10px;
}

/* Input wrapper */
.input-wrap {
  display: flex; align-items: center; gap: 0;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  overflow: hidden;
}
.input-wrap--focused {
  border-color: var(--border-focus);
  background: var(--bg-2);
  box-shadow: 0 0 0 3px var(--accent-dim);
}
.input-wrap--valid {
  border-color: rgba(74,222,128,0.40);
  box-shadow: 0 0 0 3px rgba(74,222,128,0.08);
}
.input-wrap--error {
  border-color: rgba(248,113,113,0.40);
  box-shadow: 0 0 0 3px rgba(248,113,113,0.08);
}

.input-prefix {
  width: 44px; height: 46px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-4);
  border-right: 1px solid var(--border);
  background: var(--bg-1);
}
.input-wrap--focused .input-prefix { color: var(--accent); border-right-color: var(--border-focus); }
.input-wrap--valid   .input-prefix { color: var(--green);  border-right-color: rgba(74,222,128,0.25); }
.input-wrap--error   .input-prefix { color: var(--red);    border-right-color: rgba(248,113,113,0.25); }

.arb-input {
  flex: 1; height: 46px;
  background: transparent; border: none; outline: none;
  font-family: var(--mono); font-size: 12px;
  color: var(--text-1); letter-spacing: 0.04em;
  padding: 0 14px;
}
.arb-input::placeholder { color: var(--text-4); letter-spacing: 0.02em; }

.input-suffix {
  width: 40px; height: 46px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.input-suffix--valid { color: var(--green); }
.input-suffix--error { color: var(--red); }

/* Helper text */
.input-helper {
  margin-top: 8px;
  font-size: 11px; font-family: var(--mono);
  color: var(--text-4); letter-spacing: 0.02em;
  min-height: 16px;
}

/* Inline code */
.inline-code {
  font-family: var(--mono); font-size: 11px;
  background: var(--bg-3); border: 1px solid var(--border);
  border-radius: 4px; padding: 1px 5px;
  color: var(--amber);
}

/* Preview card */
.preview-card {
  display: flex; align-items: center; gap: 12px;
  background: rgba(74,222,128,0.05);
  border: 1px solid rgba(74,222,128,0.20);
  border-radius: var(--r-sm); padding: 13px 16px;
}
.preview-card-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--green); flex-shrink: 0;
  animation: pulseDot 2s ease infinite;
}
.preview-card-badge {
  font-size: 9px; font-family: var(--mono);
  color: var(--text-4); background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 20px; padding: 3px 10px;
  white-space: nowrap; flex-shrink: 0;
  letter-spacing: 0.06em;
}

/* CTA primary */
.cta-primary {
  background: var(--bg-3) !important;
  color: var(--text-4) !important;
  border-color: var(--border) !important;
  cursor: not-allowed;
  box-shadow: none !important;
  font-family: var(--font-display) !important;
  font-weight: 800 !important;
  letter-spacing: -0.02em;
}
.cta-primary--active {
  background: var(--accent) !important;
  color: #0b0c0d !important;
  border-color: var(--accent) !important;
  cursor: pointer !important;
  box-shadow: 0 4px 24px rgba(196,255,70,0.22) !important;
}
.cta-primary--active:hover {
  background: #d4ff60 !important;
  border-color: #d4ff60 !important;
  box-shadow: 0 8px 40px rgba(196,255,70,0.35) !important;
  transform: translateY(-1px);
}
.cta-primary--active:active { transform: translateY(0) !important; }

.cta-shimmer {
  position: absolute; top: 0; left: -100%; width: 55%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
  transition: left 0.55s ease; pointer-events: none;
}
.cta-primary--active:hover .cta-shimmer { left: 160%; }

/* Skip button */
.skip-btn {
  font-size: 13px !important;
  color: var(--text-3) !important;
}
.skip-btn:hover {
  color: var(--text-1) !important;
}
`;
