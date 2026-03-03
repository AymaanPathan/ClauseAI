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

const PLACEHOLDERS: Record<AgreementType, string> = {
  freelance:
    "e.g. I will design a logo for John by March 15th. He will pay $200 when delivered.",
  rental:
    "e.g. Sarah is renting my apartment for 6 months starting May 1st. Deposit is $1200.",
  bet: "e.g. I bet $100 that Bitcoin is above $100k by December 31. My friend Dave takes the other side.",
};

const TYPE_LABELS: Record<AgreementType, string> = {
  freelance: "💼 Freelance Work",
  rental: "🏠 Rental Deposit",
  bet: "🎲 Simple Bet",
};

export default function ScreenDescribe() {
  const dispatch = useAppDispatch();
  const { agreementType, parseLoading } = useAppSelector((s) => s.agreement);

  const [text, setText] = useState(
    "Bob will design a logo for Aymaan by March 15. He pays $200 on delivery.",
  );
  const [partyA, setPartyA] = useState("Aymaan");
  const [partyB, setPartyB] = useState("Bob");
  const [arbitrator, setArbitrator] = useState("TBD");
  const [focused, setFocused] = useState<string | null>(null);

  const canParse = text.trim().length > 10 && partyA.trim() && partyB.trim();

  async function handleParse() {
    if (!canParse || !agreementType) return;
    dispatch(setRawText(text));
    dispatch(setPartyNames({ partyA, partyB, arbitrator }));
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
            {agreementType && agreementType in TYPE_LABELS && (
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
                {TYPE_LABELS[agreementType as AgreementType]}
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
            Fill in the party names, then describe the deal in plain English.
          </p>
        </div>

        {/* Party names */}
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
                color: "var(--grey-1)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                display: "block",
                marginBottom: 6,
              }}
            >
              Your Name / Wallet
            </label>
            <input
              value={partyA}
              onChange={(e) => setPartyA(e.target.value)}
              onFocus={() => setFocused("partyA")}
              onBlur={() => setFocused(null)}
              placeholder="e.g. Alex"
              style={inputStyle("partyA")}
            />
          </div>
          <div>
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
              Other Party Name
            </label>
            <input
              value={partyB}
              onChange={(e) => setPartyB(e.target.value)}
              onFocus={() => setFocused("partyB")}
              onBlur={() => setFocused(null)}
              placeholder="e.g. John"
              style={inputStyle("partyB")}
            />
          </div>
        </div>

        <div className="animate-fade-up delay-2" style={{ marginBottom: 20 }}>
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
            Arbitrator{" "}
            <span style={{ color: "var(--grey-2)" }}>
              (optional — can set later)
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
                ? PLACEHOLDERS[agreementType as AgreementType]
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
              justifyContent: "flex-end",
              marginTop: 6,
            }}
          >
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
            "Parse Agreement →"
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
            Fill in both party names and describe the agreement to continue
          </p>
        )}
      </div>
    </div>
  );
}
