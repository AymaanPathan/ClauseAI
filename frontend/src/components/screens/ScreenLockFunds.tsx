"use client";
import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setScreen, lockFunds } from "../../../useAppSelector/slices/agreementSlice";

export default function ScreenLockFunds() {
  const dispatch = useAppDispatch();
  const { editedTerms, walletAddress, counterpartyWallet, agreementId } =
    useAppSelector((s) => s.agreement);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  const sbtcAmount = editedTerms?.amount_usd
    ? (parseFloat(editedTerms.amount_usd) / 67000).toFixed(6)
    : "0.000000";

  function handleLock() {
    setSigning(true);
    setTimeout(() => {
      setSigned(true);
      setSigning(false);
      dispatch(lockFunds());
    }, 1800);
  }

  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 540, width: "100%" }}>
        <div className="animate-fade-up" style={{ marginBottom: 36 }}>
          <button
            onClick={() => dispatch(setScreen("share-link"))}
            style={{
              background: "none",
              border: "none",
              color: "var(--grey-1)",
              fontSize: 13,
              cursor: "pointer",
              marginBottom: 20,
            }}
          >
            ← Back
          </button>
          <span
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--yellow)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              display: "block",
              marginBottom: 12,
            }}
          >
            Step 6 of 6
          </span>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-1px",
              marginBottom: 8,
            }}
          >
            Review & lock funds
          </h2>
          <p style={{ color: "var(--grey-1)", fontSize: 14 }}>
            Both parties sign. Funds lock into the smart contract. Bitcoin
            enforces the rest.
          </p>
        </div>

        {/* Agreement summary card */}
        <div
          className="animate-fade-up delay-1"
          style={{
            background: "var(--black-2)",
            border: "1px solid var(--black-4)",
            borderRadius: 16,
            overflow: "hidden",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--black-4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              📋 Agreement #{agreementId}
            </span>
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--grey-1)",
              }}
            >
              Stacks Testnet
            </span>
          </div>

          <div style={{ padding: "20px" }}>
            {[
              {
                label: "From (Party A)",
                value: editedTerms?.partyA ?? "—",
                sub: walletAddress ?? "",
              },
              {
                label: "To (Party B)",
                value: editedTerms?.partyB ?? "—",
                sub: counterpartyWallet ?? "",
              },
              { label: "Condition", value: editedTerms?.condition ?? "—" },
              { label: "Deadline", value: editedTerms?.deadline ?? "—" },
              { label: "Arbitrator", value: editedTerms?.arbitrator ?? "TBD" },
            ].map((row, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  padding: "10px 0",
                  borderBottom: i < 4 ? "1px solid var(--black-4)" : "none",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--grey-1)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {row.label}
                </span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {row.value}
                  </div>
                  {row.sub && (
                    <div
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        color: "var(--grey-2)",
                        marginTop: 2,
                      }}
                    >
                      {row.sub}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Amount highlight */}
          <div
            style={{
              background: "var(--yellow-dim)",
              borderTop: "1px solid var(--yellow)",
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--yellow)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Total Locked
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "var(--yellow)",
                  marginTop: 2,
                  letterSpacing: "-0.5px",
                }}
              >
                {sbtcAmount} sBTC
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--grey-1)",
                }}
              >
                ≈ USD
              </div>
              <div
                style={{ fontSize: 18, fontWeight: 700, color: "var(--white)" }}
              >
                ${editedTerms?.amount_usd ?? "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Timeout info */}
        <div
          className="animate-fade-up delay-2"
          style={{
            background: "var(--black-2)",
            border: "1px solid var(--black-4)",
            borderRadius: "var(--radius-sm)",
            padding: "12px 16px",
            display: "flex",
            gap: 10,
            marginBottom: 24,
            fontSize: 12,
            color: "var(--grey-1)",
            lineHeight: 1.6,
          }}
        >
          <span>⏱</span>
          <span>
            If no action is taken within{" "}
            <strong style={{ color: "var(--white)" }}>72 hours</strong> of the
            deadline, funds auto-refund to {editedTerms?.partyB ?? "Party B"}.
          </span>
        </div>

        {/* Sign button */}
        {!signed ? (
          <button
            onClick={handleLock}
            disabled={signing}
            className="animate-fade-up delay-3"
            style={{
              width: "100%",
              padding: "18px",
              background: signing ? "var(--black-4)" : "var(--yellow)",
              color: signing ? "var(--grey-2)" : "var(--black)",
              border: "none",
              borderRadius: "var(--radius)",
              fontSize: 15,
              fontWeight: 700,
              cursor: signing ? "not-allowed" : "pointer",
              transition: "all var(--transition)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            {signing ? (
              <>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    border: "2px solid var(--grey-2)",
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 0.7s linear infinite",
                    display: "inline-block",
                  }}
                />
                Signing with wallet...
              </>
            ) : (
              `🔐 Lock ${sbtcAmount} sBTC & Sign`
            )}
          </button>
        ) : (
          <div
            className="animate-fade-up"
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <div
              style={{
                background: "#22c55e15",
                border: "1px solid #22c55e",
                borderRadius: "var(--radius)",
                padding: "16px",
                textAlign: "center",
                color: "#22c55e",
                fontWeight: 700,
              }}
            >
              ✅ Funds locked. Contract deployed on Stacks.
            </div>
            <button
              onClick={() => dispatch(setScreen("dashboard"))}
              style={{
                width: "100%",
                padding: "16px",
                background: "var(--yellow)",
                color: "var(--black)",
                border: "none",
                borderRadius: "var(--radius)",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              View Live Dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
