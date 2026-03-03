"use client";
import { useState, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { markComplete, openDispute } from "../../../useAppSelector/slices/agreementSlice";


export default function ScreenDashboard() {
  const dispatch = useAppDispatch();
  const {
    editedTerms,
    agreementId,
    walletAddress,
    counterpartyWallet,
    amountLocked,
    fundState,
  } = useAppSelector((s) => s.agreement);
  const [blockHeight, setBlockHeight] = useState(847231);
  const [showDisputeConfirm, setShowDisputeConfirm] = useState(false);

  // Simulate block height ticking
  useEffect(() => {
    const iv = setInterval(() => setBlockHeight((h) => h + 1), 8000);
    return () => clearInterval(iv);
  }, []);

  const sbtcAmount = amountLocked
    ? (parseFloat(amountLocked) / 67000).toFixed(6)
    : "0.000000";

  const statusColor = fundState === "locked" ? "var(--yellow)" : "#22c55e";
  const statusLabel =
    fundState === "locked" ? "🟡 Active — Funds Locked" : "🟢 " + fundState;

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
                color: "var(--yellow)",
              }}
            >
              {statusLabel}
            </div>
          </div>
          <p
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--grey-1)",
            }}
          >
            Block #{blockHeight} · Stacks Testnet
          </p>
        </div>

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
          <div
            style={{
              background: "var(--black-2)",
              border: "1px solid #22c55e40",
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
              Party A
            </div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {editedTerms?.partyA ?? "—"}
            </div>
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "#22c55e",
                marginTop: 4,
              }}
            >
              ✅ Signed
            </div>
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--grey-2)",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {walletAddress}
            </div>
          </div>

          <div
            style={{
              textAlign: "center",
              color: "var(--grey-2)",
              fontSize: 20,
            }}
          >
            ⇄
          </div>

          <div
            style={{
              background: "var(--black-2)",
              border: "1px solid #22c55e40",
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
              Party B
            </div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {editedTerms?.partyB ?? "—"}
            </div>
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "#22c55e",
                marginTop: 4,
              }}
            >
              ✅ Signed
            </div>
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--grey-2)",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {counterpartyWallet}
            </div>
          </div>
        </div>

        {/* Locked funds big display */}
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
            🔒 Funds Locked
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
            ≈ ${amountLocked} USD
          </div>
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

        {/* Action buttons */}
        <div
          className="animate-fade-up delay-3"
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <button
            onClick={() => dispatch(markComplete())}
            style={{
              padding: "16px",
              background: "var(--yellow)",
              color: "var(--black)",
              border: "none",
              borderRadius: "var(--radius)",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all var(--transition)",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "var(--yellow-hover)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "var(--yellow)")
            }
          >
            ✅ Mark as Complete — Release Funds
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
                transition: "all var(--transition)",
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
                This will lock the contract and notify the arbitrator. Are you
                sure?
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
                  onClick={() =>
                    dispatch(openDispute(walletAddress ?? "unknown"))
                  }
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
                  Confirm — Open Dispute
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
