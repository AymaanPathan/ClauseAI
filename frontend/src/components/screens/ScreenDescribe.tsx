"use client";
import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { AgreementType } from "@/api/parseApi";
import {
  parseAgreementThunk,
  setPartyNames,
  setRawText,
  setScreen,
} from "../../store/slices/agreementSlice";

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

function InputField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  accentColor,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  accentColor?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 11,
          fontFamily: "var(--mono)",
          color: accentColor ?? "var(--text-3)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 7,
        }}
      >
        {label}
      </label>
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={{
          borderColor: focused
            ? (accentColor ?? "var(--border-hi)")
            : "var(--border)",
        }}
      />
      {hint && (
        <div
          style={{
            fontSize: 10,
            fontFamily: "var(--mono)",
            color: "var(--text-4)",
            marginTop: 5,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

export default function ScreenDescribe() {
  const dispatch = useAppDispatch();
  const { agreementType, parseLoading } = useAppSelector((s) => s.agreement);
  const typeMeta = agreementType ? TYPE_LABELS[agreementType] : null;

  const [text, setText] = useState(
    "Build a landing page. $100 total. 30% on wireframes, 50% on development, 20% on launch.",
  );
  const [payer, setPayer] = useState("Aymaan");
  const [receiver, setReceiver] = useState("Bob");
  const [arbitrator, setArbitrator] = useState("TBD");
  const [textFocus, setTextFocus] = useState(false);

  const canParse = text.trim().length > 10 && payer.trim() && receiver.trim();

  async function handleParse() {
    if (!canParse || !agreementType) return;
    dispatch(setRawText(text));
    dispatch(setPartyNames({ partyA: payer, partyB: receiver, arbitrator }));
    const result = await dispatch(
      parseAgreementThunk({ type: agreementType, text }),
    );
    if (parseAgreementThunk.fulfilled.match(result)) {
      dispatch(setScreen("parsed-terms"));
    }
  }

  return (
    <div className="page" style={{ alignItems: "flex-start", paddingTop: 64 }}>
      <div style={{ maxWidth: 640, width: "100%" }}>
        {/* Header */}
        <div className="fade-up" style={{ marginBottom: 40 }}>
          <button
            onClick={() => dispatch(setScreen("select-type"))}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-3)",
              fontSize: 12,
              cursor: "pointer",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--mono)",
              letterSpacing: "0.04em",
              padding: 0,
            }}
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
              fontSize: "clamp(24px, 3.5vw, 38px)",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
              marginBottom: 8,
            }}
          >
            Describe your agreement
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
            Name the payer and receiver, then describe the deal in plain
            English.
          </p>
        </div>

        {/* Role info strip */}
        <div
          className="fade-up d1"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
            padding: "11px 16px",
            marginBottom: 22,
            display: "flex",
            gap: 16,
            fontSize: 11,
            fontFamily: "var(--mono)",
            color: "var(--text-3)",
            letterSpacing: "0.04em",
            flexWrap: "wrap",
          }}
        >
          <span>Payer — locks funds in escrow</span>
          <span style={{ color: "var(--text-4)" }}>·</span>
          <span>Receiver — gets paid on completion</span>
          <span style={{ color: "var(--text-4)" }}>·</span>
          <span>Arbitrator — resolves disputes</span>
        </div>

        {/* Party names */}
        <div
          className="fade-up d2"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <InputField
            label={`${typeMeta?.payerRole ?? "Payer"} (locks funds)`}
            value={payer}
            onChange={setPayer}
            placeholder="e.g. Ahmed"
            hint="Deposits into escrow"
          />
          <InputField
            label={`${typeMeta?.receiverRole ?? "Receiver"} (gets paid)`}
            value={receiver}
            onChange={setReceiver}
            placeholder="e.g. Bob"
            hint="Receives on completion"
          />
        </div>

        {/* Arbitrator */}
        <div className="fade-up d3" style={{ marginBottom: 20 }}>
          <InputField
            label="Arbitrator (optional)"
            value={arbitrator}
            onChange={setArbitrator}
            placeholder="e.g. mediator.btc or leave blank"
          />
        </div>

        {/* Textarea */}
        <div className="fade-up d3" style={{ marginBottom: 24 }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              fontFamily: "var(--mono)",
              color: "var(--text-3)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 7,
            }}
          >
            Agreement Description
          </label>
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
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                color: "var(--text-4)",
              }}
            >
              Include: amount, deadline, and what triggers payment
            </span>
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                color: "var(--text-4)",
              }}
            >
              {text.length} chars
            </span>
          </div>
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
                <span className="spinner" style={{ width: 14, height: 14 }} />
                Parsing with AI...
              </>
            ) : (
              <>
                Parse Agreement with AI
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
              Fill in payer and receiver names to continue
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
