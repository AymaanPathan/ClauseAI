"use client";
import { useState } from "react";
import {
  parseAgreementThunk,
  setPartyNames,
  setRawText,
  setScreen,
} from "@/store/slices/partyASlice";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/store";

const PLACEHOLDERS: Record<string, string> = {
  freelance:
    "e.g. I'm hiring Bob to design a logo by March 15. I'll pay $200 when he delivers the final files.",
  rental:
    "e.g. I'm renting a camera from Sarah for 7 days. I'll leave a $300 deposit, returned when I bring it back undamaged.",
  trade:
    "e.g. Ahmed will buy 100kg of wheat from farmer Maria for $180. Payment released when delivery is confirmed.",
  bet: "e.g. I bet $100 that Bitcoin is above $100k by December 31. My friend Dave takes the other side.",
};

const TYPE_META: Record<
  string,
  {
    label: string;
    icon: string;
    payerRole: string;
    receiverRole: string;
    color: string;
  }
> = {
  freelance: {
    label: "Freelance Work",
    icon: "✦",
    payerRole: "Client",
    receiverRole: "Freelancer",
    color: "var(--accent)",
  },
  rental: {
    label: "Rental / Equipment",
    icon: "◈",
    payerRole: "Renter",
    receiverRole: "Owner",
    color: "var(--blue)",
  },
  trade: {
    label: "Trade & Commerce",
    icon: "⟐",
    payerRole: "Buyer",
    receiverRole: "Seller",
    color: "var(--green)",
  },
  bet: {
    label: "Simple Bet",
    icon: "⬡",
    payerRole: "Bettor A",
    receiverRole: "Bettor B",
    color: "var(--amber)",
  },
};

const FLOW_STEPS = [
  "Select type",
  "Describe deal",
  "Review terms",
  "Set arbitrator",
  "Share link",
  "Lock funds",
];

export default function ScreenDescribe() {
  const dispatch = useDispatch<AppDispatch>();
  const { agreementType, parseLoading } = useSelector(
    (s: RootState) => s.partyA,
  );
  const meta = agreementType ? TYPE_META[agreementType] : null;

  const [text, setText] = useState(
    "Build a landing page. $100 total. 30% on wireframes, 50% on development, 20% on launch.",
  );
  const [payer, setPayer] = useState("Aymaan");
  const [receiver, setReceiver] = useState("Bob");
  const [activeField, setActiveField] = useState<string | null>(null);

  const canParse = text.trim().length > 10 && payer.trim() && receiver.trim();
  const charPct = Math.min((text.length / 180) * 100, 100);
  const charGood = text.length > 30;

  const missingHint = !payer.trim()
    ? `Add ${meta?.payerRole ?? "payer"} name`
    : !receiver.trim()
      ? `Add ${meta?.receiverRole ?? "receiver"} name`
      : text.trim().length <= 10
        ? "Describe the agreement"
        : null;

  async function handleParse() {
    if (!canParse || !agreementType) return;
    dispatch(setRawText(text));
    dispatch(
      setPartyNames({ partyA: payer, partyB: receiver, arbitrator: "TBD" }),
    );
    const result = await dispatch(
      parseAgreementThunk({ type: agreementType, text }),
    );
    if (parseAgreementThunk.fulfilled.match(result))
      dispatch(setScreen("parsed-terms"));
  }

  return (
    <div className="sd-root">
      <style>{css}</style>

      {/* ══════════ TOPBAR ══════════ */}
      <header className="sd-topbar">
        <div className="sd-brand">
          <div className="sd-brand-mark">◈</div>
          <span className="sd-brand-name">ClauseAI</span>
        </div>

        <div className="sd-steps">
          {FLOW_STEPS.map((s, i) => {
            const done = i < 1;
            const active = i === 1;
            return (
              <div
                key={i}
                className={`sd-step${done ? " sd-step--done" : active ? " sd-step--active" : ""}`}
              >
                <div className="sd-step-dot">
                  {done ? (
                    <svg
                      width="7"
                      height="7"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className="sd-step-label">{s}</span>
                {i < FLOW_STEPS.length - 1 && <div className="sd-step-line" />}
              </div>
            );
          })}
        </div>

        {meta && (
          <div className="sd-type-badge" style={{ color: meta.color }}>
            <span>{meta.icon}</span>
            <span>{meta.label}</span>
          </div>
        )}
      </header>

      {/* ══════════ TWO-PANEL BODY ══════════ */}
      <main className="sd-main">
        {/* ── LEFT: heading + party inputs ── */}
        <section className="sd-left">
          <button
            className="sd-back"
            onClick={() => dispatch(setScreen("select-type"))}
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

          {/* Heading block */}
          <div className="fade-up">
            <div className="sd-eyebrow">Step 2 of 6</div>
            <h1 className="sd-title">
              Describe
              <br />
              your <em>deal</em>
            </h1>
            <p className="sd-subtitle">
              Name both parties and describe the agreement in plain English —
              our AI will extract the terms.
            </p>
          </div>

          {/* Party cards */}
          <div
            className="sd-parties fade-up"
            style={{ animationDelay: "0.08s" }}
          >
            {/* Payer */}
            <div
              className={`sd-party-card sd-party-card--payer${activeField === "payer" ? " sd-pc--focus-payer" : ""}${payer.trim() ? " sd-pc--filled" : ""}`}
            >
              <div className="sd-pc-header">
                <div
                  className="sd-pc-dot"
                  style={{ background: "var(--amber)" }}
                />
                <span className="sd-pc-role">{meta?.payerRole ?? "Payer"}</span>
                <span className="sd-pc-hint">locks funds</span>
              </div>
              <input
                className="sd-pc-input"
                value={payer}
                onChange={(e) => setPayer(e.target.value)}
                onFocus={() => setActiveField("payer")}
                onBlur={() => setActiveField(null)}
                placeholder="Enter name…"
                autoComplete="off"
              />
              {payer.trim() && (
                <div
                  className="sd-pc-check"
                  style={{ background: "var(--amber)" }}
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#0b0c0d"
                    strokeWidth="3"
                    strokeLinecap="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
            </div>

            <div className="sd-party-arrow">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-4)"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>

            {/* Receiver */}
            <div
              className={`sd-party-card sd-party-card--receiver${activeField === "receiver" ? " sd-pc--focus-receiver" : ""}${receiver.trim() ? " sd-pc--filled" : ""}`}
            >
              <div className="sd-pc-header">
                <div
                  className="sd-pc-dot"
                  style={{ background: "var(--green)" }}
                />
                <span className="sd-pc-role">
                  {meta?.receiverRole ?? "Receiver"}
                </span>
                <span className="sd-pc-hint">gets paid</span>
              </div>
              <input
                className="sd-pc-input"
                value={receiver}
                onChange={(e) => setReceiver(e.target.value)}
                onFocus={() => setActiveField("receiver")}
                onBlur={() => setActiveField(null)}
                placeholder="Enter name…"
                autoComplete="off"
              />
              {receiver.trim() && (
                <div
                  className="sd-pc-check"
                  style={{ background: "var(--green)" }}
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#0b0c0d"
                    strokeWidth="3"
                    strokeLinecap="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Escrow flow */}
          <div className="sd-flow fade-up" style={{ animationDelay: "0.14s" }}>
            {[
              {
                color: "var(--amber)",
                label: payer.trim() || (meta?.payerRole ?? "Payer"),
                sub: "deposits sBTC",
              },
              {
                color: "var(--accent)",
                label: "Smart Contract",
                sub: "holds securely",
              },
              {
                color: "var(--green)",
                label: receiver.trim() || (meta?.receiverRole ?? "Receiver"),
                sub: "receives on completion",
              },
            ].map(({ color, label, sub }, i) => (
              <div key={i} className="sd-flow-item">
                {i > 0 && (
                  <div className="sd-flow-sep">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--border-hi)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </div>
                )}
                <div className="sd-flow-node">
                  <div
                    className="sd-flow-dot"
                    style={{ background: color, boxShadow: `0 0 7px ${color}` }}
                  />
                  <div>
                    <div className="sd-flow-name">{label}</div>
                    <div className="sd-flow-sub">{sub}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── RIGHT: textarea + CTA ── */}
        <section className="sd-right">
          {/* Textarea box */}
          <div
            className={`sd-ta-wrap${activeField === "text" ? " sd-ta-wrap--focus" : ""}${charGood ? " sd-ta-wrap--good" : ""}`}
          >
            <div className="sd-ta-header">
              <div className="sd-ta-label">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Agreement description
              </div>
              <div className="sd-ta-char-info">
                {charGood && <span className="sd-ta-good-badge">✓ Good</span>}
                <span className="sd-ta-char-count">{text.length} chars</span>
              </div>
            </div>

            <textarea
              className="sd-ta"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setActiveField("text")}
              onBlur={() => setActiveField(null)}
              placeholder={
                agreementType
                  ? (PLACEHOLDERS[agreementType] ?? "Describe your agreement…")
                  : "Describe your agreement…"
              }
            />

            {/* Progress fill bar */}
            <div className="sd-ta-bar">
              <div
                className="sd-ta-bar-fill"
                style={{
                  width: `${charPct}%`,
                  background: charGood ? "var(--accent)" : "var(--text-4)",
                }}
              />
            </div>

            <div className="sd-ta-footer">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Include: amount, deadline, and what triggers payment. Arbitrator
              set in next step.
            </div>
          </div>

          {/* CTA section */}
          <div className="sd-cta">
            {/* Checklist */}
            <div className="sd-checklist">
              {[
                {
                  done: !!payer.trim(),
                  label: payer.trim() || (meta?.payerRole ?? "Payer") + " name",
                },
                {
                  done: !!receiver.trim(),
                  label:
                    receiver.trim() ||
                    (meta?.receiverRole ?? "Receiver") + " name",
                },
                {
                  done: text.trim().length > 10,
                  label: "Agreement description",
                },
              ].map(({ done, label }, i) => (
                <div
                  key={i}
                  className={`sd-check-item${done ? " sd-check-item--done" : ""}`}
                >
                  <div className="sd-check-icon">
                    {done ? (
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <div
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: "var(--text-4)",
                        }}
                      />
                    )}
                  </div>
                  <span>{label}</span>
                </div>
              ))}
            </div>

            {/* Button */}
            <button
              className={`sd-btn${canParse && !parseLoading ? " sd-btn--active" : ""}`}
              onClick={handleParse}
              disabled={!canParse || parseLoading}
            >
              <span className="sd-btn-shimmer" />
              {parseLoading ? (
                <>
                  <span
                    className="spinner"
                    style={{ width: 16, height: 16, borderTopColor: "#0b0c0d" }}
                  />
                  Parsing with AI…
                </>
              ) : (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  {missingHint
                    ? `Missing: ${missingHint}`
                    : "Parse Agreement with AI"}
                  {!missingHint && (
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
                  )}
                </>
              )}
            </button>

            <div className="sd-ai-note">
              <span className="sd-ai-dot" />
              Powered by Claude AI — terms extracted in seconds
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════
   CSS — viewport-locked, zero scroll
═══════════════════════════════════════════ */
const css = `
.sd-root {
  display: flex; flex-direction: column;
  height: 100vh; overflow: hidden;
  background: var(--bg); color: var(--text-1);
}

/* ── Topbar ── */
.sd-topbar {
  height: 52px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 28px; gap: 24px;
  background: rgba(11,12,13,0.96); backdrop-filter: blur(24px);
  border-bottom: 1px solid var(--border); z-index: 100;
}
.sd-brand { display: flex; align-items: center; gap: 9px; flex-shrink: 0; }
.sd-brand-mark {
  width: 28px; height: 28px; border-radius: 7px; background: var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display); font-size: 14px; font-weight: 800; color: #0b0c0d;
}
.sd-brand-name { font-family: var(--font-display); font-size: 15px; font-weight: 800; color: var(--text-1); letter-spacing: -0.03em; }

.sd-steps { display: flex; align-items: center; flex: 1; justify-content: center; }
.sd-step  { display: flex; align-items: center; gap: 6px; opacity: 0.25; }
.sd-step--done   { opacity: 0.5; }
.sd-step--active { opacity: 1; }
.sd-step-dot {
  width: 18px; height: 18px; border-radius: 50%;
  border: 1px solid var(--border); background: transparent;
  display: flex; align-items: center; justify-content: center;
  font-size: 8px; font-family: var(--mono); font-weight: 700; color: var(--text-4);
  flex-shrink: 0;
}
.sd-step--done .sd-step-dot, .sd-step--active .sd-step-dot {
  background: var(--accent); border-color: var(--accent); color: #0b0c0d;
}
.sd-step--active .sd-step-dot { box-shadow: 0 0 10px rgba(196,255,70,0.4); }
.sd-step-label { font-size: 10px; font-family: var(--mono); color: var(--text-4); white-space: nowrap; }
.sd-step--active .sd-step-label { color: var(--text-1); font-weight: 600; }
.sd-step--done  .sd-step-label  { color: var(--text-3); }
.sd-step-line { width: 20px; height: 1px; background: var(--border); margin: 0 2px; flex-shrink: 0; }
.sd-type-badge {
  display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
  font-size: 10px; font-family: var(--mono); letter-spacing: 0.04em;
  background: rgba(255,255,255,0.04); border: 1px solid var(--border);
  border-radius: 20px; padding: 3px 11px;
}

/* ── Two-panel main ── */
.sd-main {
  flex: 1; min-height: 0;
  display: grid; grid-template-columns: 1fr 1fr;
}

/* ── Left panel ── */
.sd-left {
  padding: 32px 44px 32px 48px;
  display: flex; flex-direction: column; gap: 22px;
  border-right: 1px solid var(--border);
  overflow: hidden;
}
.sd-back {
  display: inline-flex; align-items: center; gap: 6px;
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: 11px; font-family: var(--mono); color: var(--text-4);
  letter-spacing: 0.04em; transition: color 0.15s; align-self: flex-start;
}
.sd-back:hover { color: var(--text-2); }
.sd-eyebrow {
  font-size: 9px; font-family: var(--mono); color: var(--accent);
  text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 10px;
}
.sd-title {
  font-family: var(--font-display);
  font-size: clamp(28px, 3vw, 42px);
  font-weight: 800; letter-spacing: -0.05em; line-height: 1.0;
  color: var(--text-1); margin-bottom: 10px;
}
.sd-title em { font-style: normal; color: var(--accent); }
.sd-subtitle { font-size: 13px; color: var(--text-3); line-height: 1.65; max-width: 340px; }

/* Party cards row */
.sd-parties { display: flex; align-items: stretch; gap: 8px; }
.sd-party-card {
  flex: 1; position: relative;
  background: var(--bg-2); border: 1px solid var(--border);
  border-radius: 12px; padding: 13px 15px;
  transition: all 0.18s ease;
}
.sd-pc--focus-payer    { border-color: rgba(251,191,36,0.55); box-shadow: 0 0 0 3px rgba(251,191,36,0.07); }
.sd-pc--focus-receiver { border-color: rgba(74,222,128,0.55);  box-shadow: 0 0 0 3px rgba(74,222,128,0.07);  }
.sd-pc--filled { background: var(--bg-3); border-color: var(--border-hi); }
.sd-pc-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.sd-pc-dot  { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.sd-pc-role { font-size: 10px; font-family: var(--mono); font-weight: 700; color: var(--text-2); letter-spacing: 0.04em; }
.sd-pc-hint { font-size: 9px; font-family: var(--mono); color: var(--text-4); margin-left: auto; }
.sd-pc-input {
  width: 100%; background: transparent; border: none; outline: none;
  font-family: var(--font-display); font-size: 18px; font-weight: 700;
  color: var(--text-1); letter-spacing: -0.03em; padding: 0;
}
.sd-pc-input::placeholder { color: var(--text-4); font-weight: 400; font-size: 15px; font-family: var(--font); }
.sd-pc-check {
  position: absolute; top: 11px; right: 11px;
  width: 18px; height: 18px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.sd-party-arrow { flex-shrink: 0; display: flex; align-items: center; }

/* Escrow flow */
.sd-flow {
  display: flex; align-items: center;
  padding: 13px 16px;
  background: var(--bg-1); border: 1px solid var(--border); border-radius: 10px;
}
.sd-flow-item { display: flex; align-items: center; flex: 1; min-width: 0; }
.sd-flow-sep  { flex-shrink: 0; padding: 0 8px; }
.sd-flow-node { display: flex; align-items: center; gap: 8px; min-width: 0; }
.sd-flow-dot  { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.sd-flow-name { font-size: 11px; font-weight: 600; color: var(--text-1); letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sd-flow-sub  { font-size: 9px; font-family: var(--mono); color: var(--text-4); }

/* ── Right panel ── */
.sd-right {
  padding: 32px 48px 32px 44px;
  display: flex; flex-direction: column; gap: 18px;
  overflow: hidden;
}

/* Textarea wrapper */
.sd-ta-wrap {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  background: var(--bg-1); border: 1px solid var(--border);
  border-radius: 14px; overflow: hidden;
  transition: border-color 0.18s, box-shadow 0.18s;
}
.sd-ta-wrap--focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--accent-dim);
}
.sd-ta-wrap--good:not(.sd-ta-wrap--focus) { border-color: var(--border-hi); }

.sd-ta-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 11px 16px 9px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.sd-ta-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 10px; font-family: var(--mono); color: var(--text-4);
  text-transform: uppercase; letter-spacing: 0.1em;
}
.sd-ta-char-info { display: flex; align-items: center; gap: 8px; }
.sd-ta-good-badge {
  font-size: 9px; font-family: var(--mono); color: var(--green);
  background: var(--green-dim); border: 1px solid rgba(74,222,128,0.22);
  border-radius: 4px; padding: 1px 7px;
}
.sd-ta-char-count { font-size: 10px; font-family: var(--mono); color: var(--text-4); }

.sd-ta {
  flex: 1; min-height: 0;
  background: transparent; border: none; outline: none; resize: none;
  padding: 16px 18px;
  font-family: var(--font); font-size: 13.5px; color: var(--text-1);
  line-height: 1.75; letter-spacing: -0.01em;
}
.sd-ta::placeholder { color: var(--text-4); }

.sd-ta-bar { height: 2px; background: var(--bg-3); flex-shrink: 0; }
.sd-ta-bar-fill { height: 100%; border-radius: 1px; transition: width 0.25s ease, background 0.3s ease; }

.sd-ta-footer {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 16px; border-top: 1px solid var(--border); flex-shrink: 0;
  font-size: 10px; font-family: var(--mono); color: var(--text-4);
  letter-spacing: 0.02em;
}

/* CTA */
.sd-cta { display: flex; flex-direction: column; gap: 12px; flex-shrink: 0; }

.sd-checklist { display: flex; gap: 6px; flex-wrap: wrap; }
.sd-check-item {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 20px;
  background: var(--bg-2); border: 1px solid var(--border);
  font-size: 10px; font-family: var(--mono); color: var(--text-4);
  transition: all 0.2s;
}
.sd-check-item--done {
  background: var(--green-dim); border-color: rgba(74,222,128,0.25); color: var(--green);
}
.sd-check-icon {
  width: 14px; height: 14px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.sd-check-item--done .sd-check-icon { color: var(--green); }

/* Main button */
.sd-btn {
  position: relative; overflow: hidden;
  width: 100%; height: 50px;
  background: var(--bg-3); border: 1px solid var(--border);
  border-radius: 12px; cursor: not-allowed;
  display: flex; align-items: center; justify-content: center; gap: 9px;
  font-family: var(--font-display); font-size: 15px; font-weight: 800;
  color: var(--text-4); letter-spacing: -0.02em;
  transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
}
.sd-btn--active {
  background: var(--accent); border-color: var(--accent);
  color: #0b0c0d; cursor: pointer;
  box-shadow: 0 4px 24px rgba(196,255,70,0.22);
}
.sd-btn--active:hover {
  background: #d4ff60; border-color: #d4ff60;
  box-shadow: 0 8px 40px rgba(196,255,70,0.35);
  transform: translateY(-1px);
}
.sd-btn--active:active { transform: translateY(0); }
.sd-btn-shimmer {
  position: absolute; top: 0; left: -100%; width: 55%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
  transition: left 0.55s ease; pointer-events: none;
}
.sd-btn--active:hover .sd-btn-shimmer { left: 160%; }

.sd-ai-note {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  font-size: 10px; font-family: var(--mono); color: var(--text-4);
}
.sd-ai-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--accent); flex-shrink: 0;
  animation: pulseDot 2s ease infinite;
}

/* ── Responsive ── */
@media (max-width: 820px) {
  .sd-root { height: auto; overflow: auto; }
  .sd-main { grid-template-columns: 1fr; }
  .sd-left { border-right: none; border-bottom: 1px solid var(--border); padding: 28px 24px; gap: 18px; }
  .sd-right { padding: 28px 24px; }
  .sd-ta { min-height: 160px; }
  .sd-steps { display: none; }
  .sd-ta-wrap { flex: none; }
}
`;
