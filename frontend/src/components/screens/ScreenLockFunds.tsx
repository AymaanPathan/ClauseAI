"use client";
import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setScreen } from "@/store/slices/agreementSlice";
import {
  createAgreementThunk,
  depositThunk,
} from "@/store/slices/agreementSlice";

type Step = "create" | "deposit" | "done";

export default function ScreenLockFunds() {
  const dispatch = useAppDispatch();
  const {
    editedTerms,
    walletAddress,
    counterpartyWallet,
    agreementId,
    txCreate,
    txDeposit,
  } = useAppSelector((s) => s.agreement);

  const [step, setStep] = useState<Step>("create");

  const sbtcAmount = editedTerms?.amount_usd
    ? (parseFloat(editedTerms.amount_usd) / 67000).toFixed(6)
    : "0.000000";

  const amountUsd = parseFloat(editedTerms?.amount_usd ?? "0");

  // ── Step 1: Create agreement on chain ────────────────────────
  async function handleCreate() {
    if (!agreementId || !walletAddress || !counterpartyWallet || !editedTerms)
      return;

    const arbitrator =
      editedTerms.arbitrator && editedTerms.arbitrator !== "TBD"
        ? editedTerms.arbitrator
        : walletAddress; // fallback: self as arbitrator for demo

    const result = await dispatch(
      createAgreementThunk({
        agreementId,
        partyA: walletAddress,
        partyB: counterpartyWallet,
        arbitrator,
        amountUsd,
      }),
    );

    if (createAgreementThunk.fulfilled.match(result)) {
      setStep("deposit");
    }
  }

  // ── Step 2: Deposit your share ────────────────────────────────
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
      setStep("done");
    }
  }

  const isBusy =
    txCreate.status === "pending" || txDeposit.status === "pending";

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

          <div style={{ padding: 20 }}>
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
                Your Deposit
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
            { id: "create", label: "Deploy contract on-chain", tx: txCreate },
            {
              id: "deposit",
              label: "Lock your funds (deposit)",
              tx: txDeposit,
            },
            { id: "done", label: "Contract active", tx: null },
          ].map((s, i) => {
            const isDone =
              (s.id === "create" && (step === "deposit" || step === "done")) ||
              (s.id === "deposit" && step === "done") ||
              (s.id === "done" && step === "done");
            const isActive = s.id === step;
            return (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 0",
                  borderBottom: i < 2 ? "1px solid var(--black-4)" : "none",
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: isDone
                      ? "#22c55e"
                      : isActive
                        ? "var(--yellow)"
                        : "var(--black-4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color:
                      isDone || isActive ? "var(--black)" : "var(--grey-2)",
                  }}
                >
                  {isDone ? "✓" : i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: isDone
                        ? "#22c55e"
                        : isActive
                          ? "var(--yellow)"
                          : "var(--grey-2)",
                    }}
                  >
                    {s.label}
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
                      }}
                    >
                      {s.tx.txId.slice(0, 12)}...{s.tx.txId.slice(-6)} ↗
                    </a>
                  )}
                  {s.tx?.error && (
                    <div
                      style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}
                    >
                      {s.tx.error}
                    </div>
                  )}
                </div>
                {isActive && s.tx?.status === "confirming" && (
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      color: "#f59e0b",
                      background: "#f59e0b15",
                      borderRadius: 4,
                      padding: "2px 8px",
                    }}
                  >
                    confirming...
                  </span>
                )}
              </div>
            );
          })}
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
            72hr auto-refund after deadline if no action. 48hr arbitrator
            fallback on dispute.
          </span>
        </div>

        {/* Action button */}
        {step === "create" && (
          <button
            onClick={handleCreate}
            disabled={isBusy}
            className="animate-fade-up delay-3"
            style={{
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
            }}
          >
            {isBusy ? (
              <>
                <Spinner /> Waiting for wallet...
              </>
            ) : (
              "Step 1 — Deploy Agreement On-Chain →"
            )}
          </button>
        )}

        {step === "deposit" && (
          <button
            onClick={handleDeposit}
            disabled={isBusy}
            className="animate-fade-up"
            style={{
              width: "100%",
              padding: "18px",
              background: isBusy ? "var(--black-4)" : "var(--yellow)",
              color: isBusy ? "var(--grey-2)" : "var(--black)",
              border: "none",
              borderRadius: "var(--radius)",
              fontSize: 15,
              fontWeight: 700,
              cursor: isBusy ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            {isBusy ? (
              <>
                <Spinner /> Signing deposit...
              </>
            ) : (
              `Step 2 — Lock ${sbtcAmount} sBTC →`
            )}
          </button>
        )}

        {step === "done" && (
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
              ✅ Funds locked. Contract active on Stacks testnet.
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
