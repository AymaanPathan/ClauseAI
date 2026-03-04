"use client";
// ============================================================
// ScreenLockFunds.tsx — CONDITIONAL ESCROW MODEL
// Key change: Only the PAYER (Party A) locks funds.
// The RECEIVER (Party B) does NOT deposit — they just confirm.
// Party A: create contract → deposit funds
// Party B: review terms → confirm participation
// ============================================================

import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setScreen } from "@/store/slices/agreementSlice";
import {
  createAgreementThunk,
  depositThunk,
} from "@/store/slices/agreementSlice";

type StepPartyA = "create" | "deposit" | "done";

export default function ScreenLockFunds() {
  const dispatch = useAppDispatch();
  const {
    editedTerms,
    walletAddress,
    counterpartyWallet,
    agreementId,
    txCreate,
    txDeposit,
    isPartyB,
  } = useAppSelector((s) => s.agreement);

  const [stepA, setStepA] = useState<StepPartyA>("create");
  const [partyBConfirmed, setPartyBConfirmed] = useState(false);

  const sbtcAmount = editedTerms?.amount_usd
    ? (parseFloat(editedTerms.amount_usd) / 67000).toFixed(6)
    : "0.000000";

  const amountUsd = parseFloat(editedTerms?.amount_usd ?? "0");
  const isBusy =
    txCreate.status === "pending" || txDeposit.status === "pending";

  // ── Party A: Step 1 — Create contract ────────────────────────
  async function handleCreate() {
    if (!agreementId || !walletAddress || !counterpartyWallet || !editedTerms)
      return;

    const arbitrator =
      editedTerms.arbitrator && editedTerms.arbitrator !== "TBD"
        ? editedTerms.arbitrator
        : walletAddress;

    const result = await dispatch(
      createAgreementThunk({
        agreementId,
        partyA: walletAddress, // Payer (locks funds)
        partyB: counterpartyWallet, // Receiver (gets paid)
        arbitrator,
        amountUsd,
      }),
    );

    if (createAgreementThunk.fulfilled.match(result)) {
      setStepA("deposit");
    }
  }

  // ── Party A: Step 2 — Lock funds ─────────────────────────────
  async function handleDeposit() {
    if (!agreementId || !walletAddress) return;

    const result = await dispatch(
      depositThunk({
        agreementId,
        amountUsd,
        senderAddress: walletAddress,
      }),
    );

    if (depositThunk.fulfilled.match(result)) {
      setStepA("done");
    }
  }

  // ── Party B view — review & confirm ──────────────────────────
  if (isPartyB) {
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
        <div style={{ maxWidth: 520, width: "100%" }}>
          <div className="animate-fade-up" style={{ marginBottom: 32 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "#22c55e15",
                border: "1px solid #22c55e40",
                borderRadius: 99,
                padding: "6px 14px",
                marginBottom: 16,
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                color: "#22c55e",
              }}
            >
              🎯 You are the Receiver
            </div>
            <h2
              style={{
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: "-1px",
                marginBottom: 8,
              }}
            >
              Review the escrow terms
            </h2>
            <p
              style={{ color: "var(--grey-1)", fontSize: 14, lineHeight: 1.7 }}
            >
              The payer will lock funds into a Bitcoin-secured escrow contract.
              You receive payment when the conditions below are fulfilled.
            </p>
          </div>

          {/* What receiver needs to know */}
          <div
            className="animate-fade-up delay-1"
            style={{
              background: "#22c55e08",
              border: "1px solid #22c55e30",
              borderRadius: 12,
              padding: "16px 20px",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#22c55e",
                marginBottom: 12,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Your role as receiver
            </div>
            {[
              "You do NOT need to deposit any funds",
              "Funds are locked by the payer on your behalf",
              "You receive payment when conditions are met",
              "Dispute with arbitrator if anything goes wrong",
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  fontSize: 13,
                  color: "var(--grey-1)",
                  marginBottom: 8,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: "#22c55e", flexShrink: 0 }}>✓</span>
                {item}
              </div>
            ))}
          </div>

          {/* Agreement summary */}
          <div
            className="animate-fade-up delay-2"
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
                padding: "14px 20px",
                borderBottom: "1px solid var(--black-4)",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              📋 Agreement #{agreementId}
            </div>
            <div style={{ padding: "0 4px" }}>
              {[
                {
                  label: "💸 Payer",
                  value: editedTerms?.partyA ?? "—",
                  sub: counterpartyWallet,
                },
                {
                  label: "🎯 You receive",
                  value: editedTerms?.partyB ?? "—",
                  sub: walletAddress,
                },
                { label: "⚡ Condition", value: editedTerms?.condition ?? "—" },
                { label: "📅 Deadline", value: editedTerms?.deadline ?? "—" },
                {
                  label: "⚖️ Arbitrator",
                  value: editedTerms?.arbitrator ?? "TBD",
                },
              ].map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    padding: "12px 16px",
                    borderBottom: i < 4 ? "1px solid var(--black-4)" : "none",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--grey-1)",
                      fontFamily: "var(--font-mono)",
                      flexShrink: 0,
                    }}
                  >
                    {row.label}
                  </span>
                  <div style={{ textAlign: "right", maxWidth: "60%" }}>
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
                        {row.sub.slice(0, 10)}...{row.sub.slice(-6)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Amount highlight */}
            <div
              style={{
                background: "#22c55e10",
                borderTop: "1px solid #22c55e30",
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
                    color: "#22c55e",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  You Will Receive
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: "#22c55e",
                    marginTop: 2,
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
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  ${editedTerms?.amount_usd ?? "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Confirm button */}
          {!partyBConfirmed ? (
            <button
              onClick={() => setPartyBConfirmed(true)}
              className="animate-fade-up delay-3"
              style={{
                width: "100%",
                padding: "18px",
                background: "#22c55e",
                color: "var(--black)",
                border: "none",
                borderRadius: "var(--radius)",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all var(--transition)",
              }}
            >
              ✓ I Understand & Agree to These Terms
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
                ✅ Terms confirmed. Waiting for payer to lock funds...
              </div>
              <button
                onClick={() => dispatch(setScreen("dashboard"))}
                style={{
                  width: "100%",
                  padding: "14px",
                  background: "var(--yellow)",
                  color: "var(--black)",
                  border: "none",
                  borderRadius: "var(--radius)",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                View Dashboard →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Party A (Payer) view ──────────────────────────────────────
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
        {/* Header */}
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
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "var(--yellow-dim)",
              border: "1px solid var(--yellow)",
              borderRadius: 99,
              padding: "6px 14px",
              marginBottom: 16,
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--yellow)",
            }}
          >
            💸 You are the Payer
          </div>
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
            Lock funds in escrow
          </h2>
          <p style={{ color: "var(--grey-1)", fontSize: 14, lineHeight: 1.7 }}>
            Deploy the contract on-chain, then lock your payment. Funds are
            released to{" "}
            <strong style={{ color: "#22c55e" }}>
              {editedTerms?.partyB ?? "the receiver"}
            </strong>{" "}
            when conditions are met — or refunded to you if not.
          </p>
        </div>

        {/* Agreement summary */}
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

          <div style={{ padding: "0 4px" }}>
            {[
              {
                label: "💸 You (Payer)",
                value: editedTerms?.partyA ?? "—",
                sub: walletAddress ?? "",
              },
              {
                label: "🎯 Receiver",
                value: editedTerms?.partyB ?? "—",
                sub: counterpartyWallet ?? "",
              },
              { label: "⚡ Condition", value: editedTerms?.condition ?? "—" },
              { label: "📅 Deadline", value: editedTerms?.deadline ?? "—" },
              {
                label: "⚖️ Arbitrator",
                value: editedTerms?.arbitrator ?? "TBD",
              },
            ].map((row, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  padding: "10px 16px",
                  borderBottom: i < 4 ? "1px solid var(--black-4)" : "none",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--grey-1)",
                    fontFamily: "var(--font-mono)",
                    flexShrink: 0,
                  }}
                >
                  {row.label}
                </span>
                <div style={{ textAlign: "right", maxWidth: "65%" }}>
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
                      {row.sub.slice(0, 10)}...{row.sub.slice(-6)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Amount */}
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
                You Lock
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
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                ${editedTerms?.amount_usd ?? "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Progress steps */}
        <div
          className="animate-fade-up delay-2"
          style={{
            background: "var(--black-2)",
            border: "1px solid var(--black-4)",
            borderRadius: "var(--radius-sm)",
            padding: "16px 20px",
            marginBottom: 20,
          }}
        >
          {[
            {
              id: "create",
              label: "Deploy escrow contract on-chain",
              sublabel: "Registers agreement on Stacks",
              tx: txCreate,
              done: stepA === "deposit" || stepA === "done",
              active: stepA === "create",
            },
            {
              id: "deposit",
              label: "Lock funds in escrow",
              sublabel: `${sbtcAmount} sBTC sent to contract`,
              tx: txDeposit,
              done: stepA === "done",
              active: stepA === "deposit",
            },
          ].map((s, i) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "10px 0",
                borderBottom: i === 0 ? "1px solid var(--black-4)" : "none",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  flexShrink: 0,
                  marginTop: 2,
                  background: s.done
                    ? "#22c55e"
                    : s.active
                      ? "var(--yellow)"
                      : "var(--black-4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 800,
                  color: s.done || s.active ? "var(--black)" : "var(--grey-2)",
                }}
              >
                {s.done ? "✓" : i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: s.done
                      ? "#22c55e"
                      : s.active
                        ? "var(--yellow)"
                        : "var(--grey-2)",
                    marginBottom: 2,
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--grey-2)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {s.sublabel}
                </div>
                {s.tx?.txId && (
                  <a
                    href={s.tx.txUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: "var(--yellow)",
                      textDecoration: "none",
                      display: "block",
                      marginTop: 2,
                    }}
                  >
                    {s.tx.txId.slice(0, 12)}...{s.tx.txId.slice(-6)} ↗
                  </a>
                )}
                {s.tx?.error && (
                  <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>
                    {s.tx.error}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Refund policy info */}
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
          <span style={{ flexShrink: 0 }}>⚡</span>
          <span>
            Funds auto-refund to you after the deadline if conditions aren't
            met. 48hr arbitrator window on disputes. You remain in control.
          </span>
        </div>

        {/* Action buttons */}
        {stepA === "create" && (
          <button
            onClick={handleCreate}
            disabled={isBusy}
            className="animate-fade-up delay-3"
            style={actionButtonStyle(isBusy)}
          >
            {isBusy ? (
              <>
                <Spinner /> Waiting for wallet...
              </>
            ) : (
              "Step 1 — Deploy Escrow Contract →"
            )}
          </button>
        )}

        {stepA === "deposit" && (
          <button
            onClick={handleDeposit}
            disabled={isBusy}
            className="animate-fade-up"
            style={actionButtonStyle(isBusy)}
          >
            {isBusy ? (
              <>
                <Spinner /> Signing deposit...
              </>
            ) : (
              `Step 2 — Lock ${sbtcAmount} sBTC in Escrow →`
            )}
          </button>
        )}

        {stepA === "done" && (
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
              🔒 Funds locked. Escrow contract active on Stacks testnet.
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

        {(txCreate.error || txDeposit.error) && (
          <div
            style={{
              marginTop: 12,
              padding: "12px 16px",
              background: "#7f1d1d20",
              border: "1px solid #7f1d1d",
              borderRadius: 8,
              fontSize: 13,
              color: "#fca5a5",
            }}
          >
            ❌ {txCreate.error || txDeposit.error}
          </div>
        )}
      </div>
    </div>
  );
}

function actionButtonStyle(isBusy: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "18px",
    background: isBusy ? "var(--black-4)" : "var(--yellow)",
    color: isBusy ? "var(--grey-2)" : "var(--black)",
    border: "none",
    borderRadius: "var(--radius)",
    fontSize: 15,
    fontWeight: 700,
    cursor: isBusy ? "not-allowed" : "pointer",
    transition: "all var(--transition)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  };
}

function Spinner() {
  return (
    <span
      style={{
        width: 16,
        height: 16,
        border: "2px solid var(--grey-2)",
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        display: "inline-block",
      }}
    />
  );
}
