"use client";
import { useState, useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  completeThunk,
  disputeThunk,
  timeoutThunk,
  pollAgreementThunk,
} from "@/store/slices/agreementSlice";
import { CONTRACT_STATE } from "@/lib/stacksConfig";
import { explorerTxUrl } from "@/lib/stacksConfig";

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
  } = useAppSelector((s) => s.agreement);
  console.log("Agreement state:", {
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
  });

  const [showDisputeConfirm, setShowDisputeConfirm] = useState(false);
  const [lastPolled, setLastPolled] = useState<string>("—");

  // ── Polling ───────────────────────────────────────────────────
  const poll = useCallback(() => {
    if (!agreementId) return;
    dispatch(pollAgreementThunk(agreementId));
    setLastPolled(new Date().toLocaleTimeString());
  }, [agreementId, dispatch]);

  useEffect(() => {
    poll(); // immediate first poll
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

  // On-chain state display
  const onChainState = onChainData ? onChainData.state : null;
  const stateLabels: Record<number, { label: string; color: string }> = {
    0: { label: "⏳ Pending deposits", color: "#94a3b8" },
    1: { label: "🟡 Active — Funds Locked", color: "var(--yellow)" },
    2: { label: "✅ Complete", color: "#22c55e" },
    3: { label: "↩️ Refunded", color: "#60a5fa" },
    4: { label: "⚖️ Disputed", color: "#f59e0b" },
  };
  const stateDisplay =
    onChainState !== null
      ? (stateLabels[onChainState] ?? {
          label: "Unknown",
          color: "var(--grey-1)",
        })
      : { label: "🟡 Active — Funds Locked", color: "var(--yellow)" };

  return (
    <div style={{ minHeight: "calc(100vh - 56px)", padding: "40px 24px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {/* Header */}
        <div className="animate-fade-up" style={{ marginBottom: 32 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <h2
              style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px" }}
            >
              Agreement #{agreementId}
            </h2>
            <div
              style={{
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                background: "var(--yellow-dim)",
                border: "1px solid var(--yellow)",
                borderRadius: 99,
                padding: "4px 14px",
                color: stateDisplay.color,
              }}
            >
              {stateDisplay.label}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 20,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--grey-1)",
            }}
          >
            <span>Block #{blockHeight || "..."}</span>
            {deadlineBlock && <span>Deadline block: #{deadlineBlock}</span>}
            <span style={{ color: "var(--grey-2)" }}>Polled: {lastPolled}</span>
          </div>
        </div>

        {/* Timeout warning banner */}
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
              ⏱ Deadline passed — timeout can be triggered
            </span>
            <button
              onClick={() => agreementId && dispatch(timeoutThunk(agreementId))}
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
              {isBusyTimeout ? "..." : "Trigger Timeout"}
            </button>
          </div>
        )}

        {/* Parties row */}
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
          {[
            {
              label: "Party A",
              name: editedTerms?.partyA,
              wallet: walletAddress,
              deposited: onChainData?.partyADeposited ?? true,
            },
            {
              label: "Party B",
              name: editedTerms?.partyB,
              wallet: counterpartyWallet,
              deposited: onChainData?.partyBDeposited ?? true,
            },
          ].map((party, i) =>
            i === 0 ? (
              <PartyCard key={i} {...party} />
            ) : (
              <PartyCard key={i} {...party} />
            ),
          )}
          <div
            style={{
              textAlign: "center",
              color: "var(--grey-2)",
              fontSize: 20,
            }}
          >
            ⇄
          </div>
          <PartyCard
            label="Party B"
            name={editedTerms?.partyB}
            wallet={counterpartyWallet}
            deposited={onChainData?.partyBDeposited ?? true}
          />
        </div>

        {/* Locked funds */}
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
            🔒 Funds Locked on Stacks
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
            ≈ ${amountLocked ?? "—"} USD
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

        {/* Agreement details */}
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
            { label: "Condition", value: editedTerms?.condition ?? "—" },
            { label: "Deadline", value: editedTerms?.deadline ?? "—" },
            { label: "Arbitrator", value: editedTerms?.arbitrator ?? "TBD" },
            {
              label: "72hr Timeout",
              value: "Auto-refund to Party B if no action",
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
                  textTransform: "uppercase",
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

        {/* Pending tx banners */}
        <TxBanner tx={txComplete} label="Completing agreement" />
        <TxBanner tx={txDispute} label="Opening dispute" />
        <TxBanner tx={txTimeout} label="Triggering timeout" />

        {/* Action buttons */}
        <div
          className="animate-fade-up delay-3"
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <button
            onClick={() => agreementId && dispatch(completeThunk(agreementId))}
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
                <Spinner /> Waiting for wallet...
              </>
            ) : (
              "✅ Mark as Complete — Release Funds"
            )}
          </button>

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
                This will lock the contract and notify the arbitrator (
                {editedTerms?.arbitrator ?? "TBD"}). Are you sure?
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
  label,
  name,
  wallet,
  deposited,
}: {
  label: string;
  name?: string | null;
  wallet?: string | null;
  deposited: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--black-2)",
        border: `1px solid ${deposited ? "#22c55e40" : "var(--black-4)"}`,
        borderRadius: "var(--radius-sm)",
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          color: "var(--grey-1)",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{name ?? "—"}</div>
      <div
        style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          color: deposited ? "#22c55e" : "var(--grey-2)",
          marginTop: 4,
        }}
      >
        {deposited ? "✅ Deposited" : "⏳ Pending deposit"}
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

function Spinner() {
  return (
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
  );
}
