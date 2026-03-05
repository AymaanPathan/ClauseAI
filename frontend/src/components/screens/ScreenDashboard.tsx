"use client";
// ============================================================
// ScreenDashboard.tsx — FIXED v2
//
// KEY FIX: complete() in the Clarity contract is called by
// party-a (Payer) ONLY — not party-b. The receiver never signs.
//
// BEFORE (wrong):
//   isPartyB → showed "Confirm Conditions Met" → completeThunk
// AFTER (correct):
//   !isPartyB (Payer) → "Release Payment" → completeThunk
//   isPartyB  (Receiver) → informational message, no signing
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  completeThunk,
  disputeThunk,
  timeoutThunk,
  pollAgreementThunk,
} from "@/store/slices/agreementSlice";

const POLL_INTERVAL_MS = 12_000; // ~1 Stacks block

export default function ScreenDashboard() {
  const dispatch = useAppDispatch();
  const {
    editedTerms,
    agreementId,
    walletAddress,
    counterpartyWallet,
    amountLocked,
    fundState,
    onChainData,
    blockHeight,
    deadlineBlock,
    txComplete,
    txDispute,
    txTimeout,
    isPartyB,
  } = useAppSelector((s) => s.agreement);

  const [showDisputeConfirm, setShowDisputeConfirm] = useState(false);
  const [lastPolled, setLastPolled] = useState<string>("—");

  // ── Polling ───────────────────────────────────────────────────
  const poll = useCallback(() => {
    if (!agreementId) return;
    dispatch(pollAgreementThunk(agreementId));
    setLastPolled(new Date().toLocaleTimeString());
  }, [agreementId, dispatch]);

  useEffect(() => {
    poll();
    const iv = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [poll]);

  // ── Derive display values ─────────────────────────────────────
  const sbtcAmount = amountLocked
    ? (parseFloat(amountLocked) / 67000).toFixed(6)
    : onChainData?.totalDeposited
      ? (Number(onChainData.totalDeposited) / 1_000_000 / 67).toFixed(6)
      : "0.000000";

  const isTimedOut =
    deadlineBlock && blockHeight > 0 ? blockHeight >= deadlineBlock : false;

  const isBusyComplete = txComplete.status === "pending";
  const isBusyDispute = txDispute.status === "pending";
  const isBusyTimeout = txTimeout.status === "pending";

  // Who is the payer and receiver
  const payerName = editedTerms?.partyA ?? "Payer";
  const receiverName = editedTerms?.partyB ?? "Receiver";
  const payerWallet = isPartyB ? counterpartyWallet : walletAddress;
  const receiverWallet = isPartyB ? walletAddress : counterpartyWallet;

  // ── On-chain state display ────────────────────────────────────
  const onChainState = onChainData ? onChainData.state : null;
  const stateDisplay = (() => {
    switch (onChainState) {
      case 0:
        return { label: "⏳ Awaiting deposit", color: "#94a3b8" };
      case 1:
        return { label: "🔒 Funds Locked — Active", color: "var(--yellow)" };
      case 2:
        return { label: "✅ Complete — Funds Released", color: "#22c55e" };
      case 3:
        return { label: "↩️ Refunded to Payer", color: "#60a5fa" };
      case 4:
        return { label: "⚖️ Disputed — Arbitrating", color: "#f59e0b" };
      default:
        return { label: "🔒 Funds Locked — Active", color: "var(--yellow)" };
    }
  })();

  return (
    <div style={{ minHeight: "calc(100vh - 56px)", padding: "40px 24px" }}>
      <div style={{ maxWidth: 660, margin: "0 auto" }}>
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="animate-fade-up" style={{ marginBottom: 28 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: "-0.5px",
                  marginBottom: 4,
                }}
              >
                Escrow #{agreementId}
              </h2>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--grey-2)",
                  display: "flex",
                  gap: 16,
                }}
              >
                <span>Block #{blockHeight || "..."}</span>
                {deadlineBlock && <span>Deadline: #{deadlineBlock}</span>}
                <span>Polled: {lastPolled}</span>
              </div>
            </div>
            <div
              style={{
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                background: "var(--black-3)",
                border: `1px solid ${stateDisplay.color}40`,
                borderRadius: 99,
                padding: "5px 14px",
                color: stateDisplay.color,
                flexShrink: 0,
              }}
            >
              {stateDisplay.label}
            </div>
          </div>
        </div>

        {/* ── Timeout warning banner ──────────────────────────── */}
        {isTimedOut && (
          <div
            className="animate-fade-up"
            style={{
              background: "#f59e0b15",
              border: "1px solid #f59e0b",
              borderRadius: "var(--radius-sm)",
              padding: "12px 16px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 13, color: "#f59e0b" }}>
              ⏱ Deadline passed — payer can reclaim funds
            </span>
            {!isPartyB && (
              <button
                onClick={() =>
                  agreementId && dispatch(timeoutThunk(agreementId))
                }
                disabled={isBusyTimeout}
                style={{
                  background: "#f59e0b",
                  color: "var(--black)",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {isBusyTimeout ? "..." : "Trigger Refund"}
              </button>
            )}
          </div>
        )}

        {/* ── Payer ← Escrow → Receiver flow ─────────────────── */}
        <div
          className="animate-fade-up delay-1"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: 12,
            marginBottom: 20,
            alignItems: "center",
          }}
        >
          <PartyCard
            role="Payer"
            roleColor="var(--yellow)"
            name={payerName}
            wallet={payerWallet}
            status={
              onChainData?.deposited
                ? { label: "✅ Funds locked", color: "var(--yellow)" }
                : { label: "⏳ Awaiting lock", color: "var(--grey-2)" }
            }
            isMe={!isPartyB}
          />

          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--grey-2)",
                marginBottom: 6,
              }}
            >
              🔒 ESCROW
            </div>
            <div style={{ color: "var(--grey-3)", fontSize: 22 }}>⇄</div>
          </div>

          <PartyCard
            role="Receiver"
            roleColor="#22c55e"
            name={receiverName}
            wallet={receiverWallet}
            status={
              fundState === "released"
                ? { label: "✅ Received payment", color: "#22c55e" }
                : { label: "⏳ Awaiting release", color: "var(--grey-2)" }
            }
            isMe={isPartyB}
          />
        </div>

        {/* ── Locked funds ────────────────────────────────────── */}
        <div
          className="animate-fade-up delay-2"
          style={{
            background: "var(--black-2)",
            border: "1px solid var(--yellow)",
            borderRadius: 16,
            padding: "24px",
            marginBottom: 20,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--yellow)",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              marginBottom: 12,
            }}
          >
            🔒 Escrowed on Stacks Bitcoin
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 800,
              color: "var(--yellow)",
              letterSpacing: "-1px",
            }}
          >
            {sbtcAmount} sBTC
          </div>
          <div style={{ fontSize: 16, color: "var(--grey-1)", marginTop: 4 }}>
            ≈ ${amountLocked ?? editedTerms?.amount_usd ?? "—"} USD
          </div>
          {onChainData && (
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--grey-2)",
              }}
            >
              {Number(onChainData.totalDeposited).toLocaleString()} microSTX
              on-chain
            </div>
          )}
        </div>

        {/* ── Agreement details ───────────────────────────────── */}
        <div
          className="animate-fade-up delay-2"
          style={{
            background: "var(--black-2)",
            border: "1px solid var(--black-4)",
            borderRadius: "var(--radius-sm)",
            marginBottom: 24,
            overflow: "hidden",
          }}
        >
          {[
            {
              label: "⚡ Release Condition",
              value: editedTerms?.condition ?? "—",
            },
            { label: "📅 Deadline", value: editedTerms?.deadline ?? "—" },
            {
              label: "⚖️ Arbitrator",
              value: editedTerms?.arbitrator ?? "TBD",
            },
            {
              label: "⏱ Timeout Policy",
              value: "Auto-refund to payer after deadline",
            },
          ].map((row, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                borderBottom: i < 3 ? "1px solid var(--black-4)" : "none",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--grey-1)",
                }}
              >
                {row.label}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: "right",
                  maxWidth: "60%",
                }}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {/* ── Role context banner ─────────────────────────────── */}
        <div
          className="animate-fade-up delay-2"
          style={{
            background: isPartyB ? "#22c55e08" : "var(--yellow-dim)",
            border: `1px solid ${isPartyB ? "#22c55e30" : "var(--yellow)"}`,
            borderRadius: "var(--radius-sm)",
            padding: "12px 16px",
            marginBottom: 20,
            fontSize: 13,
            color: isPartyB ? "#22c55e" : "var(--yellow)",
            lineHeight: 1.6,
          }}
        >
          {isPartyB ? (
            <>
              <strong>You are the Receiver.</strong> You do not need to sign or
              pay anything. The payer releases funds to you once conditions are
              confirmed. You can open a dispute if something went wrong.
            </>
          ) : (
            <>
              <strong>You are the Payer.</strong> Click "Release Payment" once
              the receiver has fulfilled the conditions. You can also open a
              dispute or wait for the auto-refund after the deadline.
            </>
          )}
        </div>

        {/* ── Pending tx banners ──────────────────────────────── */}
        <TxBanner tx={txComplete} label="Releasing payment" />
        <TxBanner tx={txDispute} label="Opening dispute" />
        <TxBanner tx={txTimeout} label="Triggering refund" />

        {/* ── Action buttons ──────────────────────────────────── */}
        <div
          className="animate-fade-up delay-3"
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          {/*
           * FIX: complete() in the Clarity contract asserts tx-sender === party-a.
           * Therefore ONLY the Payer (!isPartyB) can call completeThunk.
           * The Receiver never signs — they just wait.
           */}
          {!isPartyB && (
            <button
              onClick={() =>
                agreementId && dispatch(completeThunk(agreementId))
              }
              disabled={isBusyComplete || isBusyDispute}
              style={{
                padding: "16px",
                background: isBusyComplete ? "var(--black-4)" : "var(--yellow)",
                color: isBusyComplete ? "var(--grey-2)" : "var(--black)",
                border: "none",
                borderRadius: "var(--radius)",
                fontSize: 15,
                fontWeight: 700,
                cursor:
                  isBusyComplete || isBusyDispute ? "not-allowed" : "pointer",
                transition: "all var(--transition)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {isBusyComplete ? (
                <>
                  <Spinner color="var(--grey-2)" /> Waiting for wallet...
                </>
              ) : (
                "✅ Release Payment to Receiver"
              )}
            </button>
          )}

          {/* Receiver: informational only — no signing required */}
          {isPartyB && (
            <div
              style={{
                padding: "16px",
                background: "#22c55e08",
                border: "1px solid #22c55e30",
                borderRadius: "var(--radius)",
                fontSize: 13,
                color: "#22c55e",
                lineHeight: 1.65,
                textAlign: "center",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                ⏳ Waiting for payer to release funds
              </div>
              <div style={{ fontSize: 12, color: "var(--grey-1)" }}>
                You don't need to sign anything. Once{" "}
                <strong style={{ color: "var(--white)" }}>{payerName}</strong>{" "}
                confirms conditions are met, funds transfer to your wallet
                automatically.
              </div>
            </div>
          )}

          {/* Dispute — both parties can open */}
          {!showDisputeConfirm ? (
            <button
              onClick={() => setShowDisputeConfirm(true)}
              style={{
                padding: "14px",
                background: "transparent",
                color: "#f87171",
                border: "1px solid #7f1d1d",
                borderRadius: "var(--radius)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ⚠️ Open Dispute
            </button>
          ) : (
            <div
              style={{
                background: "#7f1d1d20",
                border: "1px solid #7f1d1d",
                borderRadius: "var(--radius)",
                padding: "16px",
              }}
            >
              <p
                style={{
                  fontSize: 13,
                  color: "#fca5a5",
                  marginBottom: 14,
                  lineHeight: 1.6,
                }}
              >
                This locks the contract and notifies the arbitrator (
                {editedTerms?.arbitrator ?? "TBD"}). They have 48 hours to
                resolve — or funds auto-refund to the payer. Are you sure?
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setShowDisputeConfirm(false)}
                  style={{
                    flex: 1,
                    padding: "12px",
                    background: "transparent",
                    color: "var(--grey-1)",
                    border: "1px solid var(--grey-3)",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (agreementId) dispatch(disputeThunk(agreementId));
                    setShowDisputeConfirm(false);
                  }}
                  disabled={isBusyDispute}
                  style={{
                    flex: 2,
                    padding: "12px",
                    background: "#7f1d1d",
                    color: "#fca5a5",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  {isBusyDispute ? "Opening..." : "Confirm — Open Dispute"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function PartyCard({
  role,
  roleColor,
  name,
  wallet,
  status,
  isMe,
}: {
  role: string;
  roleColor: string;
  name?: string | null;
  wallet?: string | null;
  status: { label: string; color: string };
  isMe: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--black-2)",
        border: `1px solid ${roleColor}40`,
        borderRadius: "var(--radius-sm)",
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          color: roleColor,
          textTransform: "uppercase",
          marginBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {role}
        {isMe && (
          <span
            style={{
              background: `${roleColor}20`,
              borderRadius: 4,
              padding: "1px 5px",
              fontSize: 9,
            }}
          >
            YOU
          </span>
        )}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{name ?? "—"}</div>
      <div
        style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          color: status.color,
          marginTop: 4,
        }}
      >
        {status.label}
      </div>
      {wallet && (
        <div
          style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--grey-2)",
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {wallet.slice(0, 8)}...{wallet.slice(-6)}
        </div>
      )}
    </div>
  );
}

function TxBanner({
  tx,
  label,
}: {
  tx: {
    status: string;
    txId: string | null;
    txUrl: string | null;
    error: string | null;
  };
  label: string;
}) {
  if (tx.status === "idle") return null;
  return (
    <div
      style={{
        marginBottom: 12,
        padding: "12px 16px",
        background: tx.status === "failed" ? "#7f1d1d20" : "#f59e0b10",
        border: `1px solid ${tx.status === "failed" ? "#7f1d1d" : "#f59e0b40"}`,
        borderRadius: "var(--radius-sm)",
        fontSize: 12,
        fontFamily: "var(--font-mono)",
      }}
    >
      {tx.status === "pending" && (
        <span style={{ color: "#f59e0b" }}>
          ⏳ {label} — waiting for wallet signature...
        </span>
      )}
      {tx.status === "confirming" && (
        <span style={{ color: "#f59e0b" }}>
          ⏳ {label} — confirming on-chain...{" "}
          {tx.txUrl && (
            <a
              href={tx.txUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--yellow)" }}
            >
              View ↗
            </a>
          )}
        </span>
      )}
      {tx.status === "failed" && (
        <span style={{ color: "#f87171" }}>
          ❌ {label} failed: {tx.error}
        </span>
      )}
    </div>
  );
}

function Spinner({ color = "var(--black)" }: { color?: string }) {
  return (
    <span
      style={{
        width: 16,
        height: 16,
        border: `2px solid ${color}`,
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        display: "inline-block",
      }}
    />
  );
}
