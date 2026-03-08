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

const TYPE_LABELS: Record<
  string,
  { label: string; payerRole: string; receiverRole: string }
> = {
  freelance: {
    label: "Freelance Work",
    payerRole: "Client",
    receiverRole: "Freelancer",
  },
  rental: {
    label: "Rental / Equipment",
    payerRole: "Renter",
    receiverRole: "Owner",
  },
  trade: {
    label: "Trade & Commerce",
    payerRole: "Buyer",
    receiverRole: "Seller",
  },
  bet: { label: "Simple Bet", payerRole: "Bettor A", receiverRole: "Bettor B" },
};

export default function ScreenDescribe() {
  const dispatch = useDispatch<AppDispatch>();
  const { agreementType, parseLoading } = useSelector((s: RootState) => s.partyA);
  const typeMeta = agreementType ? TYPE_LABELS[agreementType] : null;

  const [text, setText] = useState(
    "Build a landing page. $100 total. 30% on wireframes, 50% on development, 20% on launch.",
  );
  const [payer, setPayer] = useState("Aymaan");
  const [receiver, setReceiver] = useState("Bob");
  const [textFocus, setTextFocus] = useState(false);
  const [payerFocus, setPayerFocus] = useState(false);
  const [receiverFocus, setReceiverFocus] = useState(false);

  const canParse = text.trim().length > 10 && payer.trim() && receiver.trim();

  async function handleParse() {
    if (!canParse || !agreementType) return;
    dispatch(setRawText(text));
    dispatch(
      setPartyNames({ partyA: payer, partyB: receiver, arbitrator: "TBD" }),
    );
    const result = await dispatch(
      parseAgreementThunk({ type: agreementType, text }),
    );
    if (parseAgreementThunk.fulfilled.match(result)) {
      dispatch(setScreen("parsed-terms"));
    }
  }

  return (
    <div className="page" style={{ alignItems: "flex-start", paddingTop: 64 }}>
      <style>{css}</style>
      <div style={{ maxWidth: 620, width: "100%" }}>
        {/* Header */}
        <div className="fade-up" style={{ marginBottom: 36 }}>
          <button
            onClick={() => dispatch(setScreen("select-type"))}
            className="back-btn"
          >
            ← Back
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <div className="step-counter">Step 2 of 6</div>
            {typeMeta && <div className="tag">{typeMeta.label}</div>}
          </div>
          <h2
            style={{
              fontSize: "clamp(24px, 3.5vw, 40px)",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              marginBottom: 8,
            }}
          >
            Describe your deal
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
            Name the parties, then describe the agreement in plain English.
          </p>
        </div>

        {/* Role legend */}
        <div className="fade-up d1 role-strip">
          <span>
            <span className="role-dot payer-dot" /> Payer locks funds
          </span>
          <span style={{ color: "var(--text-4)" }}>·</span>
          <span>
            <span className="role-dot receiver-dot" /> Receiver gets paid
          </span>
          <span style={{ color: "var(--text-4)" }}>·</span>
          <span>Arbitrator resolves disputes</span>
        </div>

        {/* Names row */}
        <div
          className="fade-up d2"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <label className="field-label">
              {typeMeta?.payerRole ?? "Payer"} — locks funds
            </label>
            <input
              className="input"
              value={payer}
              onChange={(e) => setPayer(e.target.value)}
              onFocus={() => setPayerFocus(true)}
              onBlur={() => setPayerFocus(false)}
              placeholder="e.g. Ahmed"
              style={{
                borderColor: payerFocus ? "var(--border-hi)" : "var(--border)",
              }}
            />
            <div className="field-hint">Deposits into escrow</div>
          </div>
          <div>
            <label className="field-label">
              {typeMeta?.receiverRole ?? "Receiver"} — gets paid
            </label>
            <input
              className="input"
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              onFocus={() => setReceiverFocus(true)}
              onBlur={() => setReceiverFocus(false)}
              placeholder="e.g. Bob"
              style={{
                borderColor: receiverFocus
                  ? "var(--border-hi)"
                  : "var(--border)",
              }}
            />
            <div className="field-hint">Receives on completion</div>
          </div>
        </div>

        {/* Description */}
        <div className="fade-up d3" style={{ marginBottom: 24 }}>
          <label className="field-label">Agreement description</label>
          <textarea
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setTextFocus(true)}
            onBlur={() => setTextFocus(false)}
            placeholder={
              agreementType
                ? (PLACEHOLDERS[agreementType] ?? "Describe your agreement...")
                : "Describe your agreement..."
            }
            rows={5}
            style={{
              resize: "vertical",
              lineHeight: 1.7,
              borderColor: textFocus ? "var(--border-hi)" : "var(--border)",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 6,
            }}
          >
            <span className="field-hint">
              Include: amount, deadline, and what triggers payment
            </span>
            <span className="field-hint">{text.length} chars</span>
          </div>
        </div>

        {/* Arbitrator note */}
        <div
          className="fade-up d3"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
            padding: "10px 14px",
            marginBottom: 24,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
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
            style={{ flexShrink: 0, marginTop: 1 }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            You'll set an{" "}
            <strong style={{ color: "var(--text-2)", fontWeight: 500 }}>
              arbitrator
            </strong>{" "}
            in the next step. They'll resolve disputes if needed. Both parties
            must approve them before funds are locked.
          </p>
        </div>

        {/* CTA */}
        <div className="fade-up d4">
          <button
            onClick={handleParse}
            disabled={!canParse || parseLoading}
            className="btn btn-primary btn-lg"
            style={{ width: "100%" }}
          >
            {parseLoading ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14 }} />{" "}
                Parsing with AI...
              </>
            ) : (
              <>
                Parse Agreement with AI{" "}
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
              </>
            )}
          </button>
          {!canParse && !parseLoading && (
            <p
              style={{
                textAlign: "center",
                fontSize: 11,
                fontFamily: "var(--mono)",
                color: "var(--text-4)",
                marginTop: 10,
              }}
            >
              Fill in both party names to continue
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const css = `
.back-btn { background: none; border: none; color: var(--text-3); font-size: 12px; cursor: pointer; margin-bottom: 20px; display: flex; align-items: center; gap: 6px; font-family: var(--mono); letter-spacing: 0.04em; padding: 0; }
.field-label { display: block; font-size: 11px; font-family: var(--mono); color: var(--text-3); letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 7px; }
.field-hint { font-size: 10px; font-family: var(--mono); color: var(--text-4); margin-top: 5px; }
.role-strip { background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--r-sm); padding: 10px 16px; margin-bottom: 20px; display: flex; gap: 14px; font-size: 11px; font-family: var(--mono); color: var(--text-3); letter-spacing: 0.04em; flex-wrap: wrap; align-items: center; }
.role-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 5px; vertical-align: middle; }
.payer-dot { background: var(--amber); }
.receiver-dot { background: var(--green); }
`;
