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
    label: "💼 Freelance Work",
    payerRole: "Client (Payer)",
    receiverRole: "Freelancer (Receiver)",
  },
  rental: {
    label: "🏠 Rental / Equipment",
    payerRole: "Renter (Payer)",
    receiverRole: "Owner (Receiver)",
  },
  trade: {
    label: "🌾 Trade & Commerce",
    payerRole: "Buyer (Payer)",
    receiverRole: "Seller (Receiver)",
  },
  bet: {
    label: "🎲 Simple Bet",
    payerRole: "Bettor A (Payer)",
    receiverRole: "Bettor B (Receiver)",
  },
};

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
  const [focused, setFocused] = useState<string | null>(null);

  const canParse = text.trim().length > 10 && payer.trim() && receiver.trim();

  async function handleParse() {
    if (!canParse || !agreementType) return;
    dispatch(setRawText(text));
    // Map payer→partyA (funds locker), receiver→partyB (funds recipient)
    dispatch(setPartyNames({ partyA: payer, partyB: receiver, arbitrator }));
    const result = await dispatch(
      parseAgreementThunk({ type: agreementType, text }),
    );
    if (parseAgreementThunk.fulfilled.match(result)) {
      dispatch(setScreen("parsed-terms"));
    }
  }

  const inputStyle = (id: string) => ({
    width: "100%",
    background: "var(--black-2)",
    border: `1px solid ${focused === id ? "var(--yellow)" : "var(--black-4)"}`,
    borderRadius: "var(--radius-sm)",
    padding: "12px 16px",
    color: "var(--white)",
    fontSize: 14,
    outline: "none",
    fontFamily: "var(--font-display)",
    transition: "border-color var(--transition)",
    boxSizing: "border-box" as const,
  });

  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 24px",
      }}
    >
      <div style={{ maxWidth: 600, width: "100%" }}>
        <div className="animate-fade-up" style={{ marginBottom: 40 }}>
          <button
            onClick={() => dispatch(setScreen("select-type"))}
            style={{
              background: "none",
              border: "none",
              color: "var(--grey-1)",
              fontSize: 13,
              cursor: "pointer",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ← Back
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                color: "var(--yellow)",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
              }}
            >
              Step 2 of 6
            </span>
            {typeMeta && (
              <span
                style={{
                  fontSize: 12,
                  background: "var(--black-3)",
                  border: "1px solid var(--black-4)",
                  borderRadius: 99,
                  padding: "2px 12px",
                  color: "var(--grey-1)",
                }}
              >
                {typeMeta.label}
              </span>
            )}
          </div>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-1px",
              marginBottom: 8,
            }}
          >
            Describe your agreement
          </h2>
          <p style={{ color: "var(--grey-1)", fontSize: 14 }}>
            Name the payer and receiver, then describe the deal in plain
            English.
          </p>
        </div>

        {/* Role explanation banner */}
        <div
          className="animate-fade-up delay-1"
          style={{
            background: "var(--black-2)",
            border: "1px solid var(--black-4)",
            borderRadius: "var(--radius-sm)",
            padding: "12px 16px",
            marginBottom: 20,
            display: "flex",
            gap: 20,
            fontSize: 12,
            color: "var(--grey-1)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span>
            <span style={{ color: "var(--yellow)" }}>💸 Payer</span> — locks
            funds in escrow
          </span>
          <span style={{ color: "var(--grey-3)" }}>→</span>
          <span>
            <span style={{ color: "#22c55e" }}>🎯 Receiver</span> — gets paid
            when conditions met
          </span>
          <span style={{ color: "var(--grey-3)" }}>→</span>
          <span>
            <span style={{ color: "#60a5fa" }}>⚖️ Arbitrator</span> — resolves
            disputes
          </span>
        </div>

        {/* Party names — 2 columns for payer/receiver */}
        <div
          className="animate-fade-up delay-1"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <label
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--yellow)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                display: "block",
                marginBottom: 6,
              }}
            >
              💸 {typeMeta?.payerRole ?? "Payer"}
            </label>
            <input
              value={payer}
              onChange={(e) => setPayer(e.target.value)}
              onFocus={() => setFocused("payer")}
              onBlur={() => setFocused(null)}
              placeholder="e.g. Ahmed"
              style={inputStyle("payer")}
            />
            <div
              style={{
                fontSize: 10,
                color: "var(--grey-2)",
                fontFamily: "var(--font-mono)",
                marginTop: 4,
              }}
            >
              Locks funds in escrow
            </div>
          </div>
          <div>
            <label
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "#22c55e",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                display: "block",
                marginBottom: 6,
              }}
            >
              🎯 {typeMeta?.receiverRole ?? "Receiver"}
            </label>
            <input
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              onFocus={() => setFocused("receiver")}
              onBlur={() => setFocused(null)}
              placeholder="e.g. Bob"
              style={inputStyle("receiver")}
            />
            <div
              style={{
                fontSize: 10,
                color: "var(--grey-2)",
                fontFamily: "var(--font-mono)",
                marginTop: 4,
              }}
            >
              Receives payment on completion
            </div>
          </div>
        </div>

        <div className="animate-fade-up delay-2" style={{ marginBottom: 20 }}>
          <label
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "#60a5fa",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              display: "block",
              marginBottom: 6,
            }}
          >
            ⚖️ Arbitrator{" "}
            <span style={{ color: "var(--grey-2)" }}>
              (optional — can be set later)
            </span>
          </label>
          <input
            value={arbitrator}
            onChange={(e) => setArbitrator(e.target.value)}
            onFocus={() => setFocused("arb")}
            onBlur={() => setFocused(null)}
            placeholder="e.g. mediator.btc or leave blank"
            style={inputStyle("arb")}
          />
        </div>

        {/* Text area */}
        <div className="animate-fade-up delay-3" style={{ marginBottom: 24 }}>
          <label
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--grey-1)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              display: "block",
              marginBottom: 6,
            }}
          >
            Describe the Agreement
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused("text")}
            onBlur={() => setFocused(null)}
            placeholder={
              agreementType
                ? (PLACEHOLDERS[agreementType] ?? "Describe your agreement...")
                : "Describe your agreement..."
            }
            rows={5}
            style={{
              ...inputStyle("text"),
              resize: "vertical",
              lineHeight: 1.7,
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
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--grey-2)",
              }}
            >
              Include: amount, deadline, and what triggers payment
            </span>
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: text.length > 10 ? "var(--grey-1)" : "var(--grey-2)",
              }}
            >
              {text.length} chars
            </span>
          </div>
        </div>

        {/* Parse button */}
        <button
          className="animate-fade-up delay-4"
          onClick={handleParse}
          disabled={!canParse || parseLoading}
          style={{
            width: "100%",
            padding: "16px",
            background:
              canParse && !parseLoading ? "var(--yellow)" : "var(--black-4)",
            color: canParse && !parseLoading ? "var(--black)" : "var(--grey-2)",
            border: "none",
            borderRadius: "var(--radius)",
            fontSize: 15,
            fontWeight: 700,
            cursor: canParse && !parseLoading ? "pointer" : "not-allowed",
            transition: "all var(--transition)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
          onMouseEnter={(e) =>
            canParse &&
            !parseLoading &&
            ((e.currentTarget as HTMLElement).style.background =
              "var(--yellow-hover)")
          }
          onMouseLeave={(e) =>
            canParse &&
            !parseLoading &&
            ((e.currentTarget as HTMLElement).style.background =
              "var(--yellow)")
          }
        >
          {parseLoading ? (
            <>
              <span
                style={{
                  width: 16,
                  height: 16,
                  border: "2px solid var(--black)",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 0.7s linear infinite",
                  display: "inline-block",
                }}
              />
              Parsing with AI...
            </>
          ) : (
            "Parse Agreement with AI →"
          )}
        </button>

        {!canParse && !parseLoading && (
          <p
            style={{
              textAlign: "center",
              fontSize: 12,
              color: "var(--grey-2)",
              marginTop: 12,
              fontFamily: "var(--font-mono)",
            }}
          >
            Fill in both payer and receiver names to continue
          </p>
        )}
      </div>
    </div>
  );
}
