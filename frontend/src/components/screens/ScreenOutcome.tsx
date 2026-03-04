"use client";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { resetAll, setScreen } from "../../store/slices/agreementSlice";

const OUTCOMES = {
  complete: {
    icon: "✅",
    color: "#22c55e",
    bgColor: "#22c55e15",
    borderColor: "#22c55e40",
    title: "Payment Released",
    subtitle: "Conditions met — funds sent to receiver",
  },
  timeout: {
    icon: "⏱",
    color: "var(--yellow)",
    bgColor: "var(--yellow-dim)",
    borderColor: "var(--yellow)",
    title: "Escrow Expired",
    subtitle: "Deadline passed — funds auto-refunded to payer",
  },
  dispute: {
    icon: "⚖️",
    color: "#f59e0b",
    bgColor: "#f59e0b15",
    borderColor: "#f59e0b50",
    title: "Dispute Opened",
    subtitle: "Arbitrator has been notified",
  },
};

export default function ScreenOutcome() {
  const dispatch = useAppDispatch();
  const {
    currentScreen,
    editedTerms,
    agreementId,
    amountLocked,
    walletAddress,
    disputeOpenedBy,
    isPartyB,
  } = useAppSelector((s) => s.agreement);

  const type = currentScreen as "complete" | "timeout" | "dispute";
  const outcome = OUTCOMES[type] ?? OUTCOMES.complete;

  const sbtcAmount = amountLocked
    ? (parseFloat(amountLocked) / 67000).toFixed(6)
    : "0.000000";

  const payerName = editedTerms?.partyA ?? "Payer";
  const receiverName = editedTerms?.partyB ?? "Receiver";

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
      <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
        {/* Icon */}
        <div
          className="animate-fade-up"
          style={{
            width: 88,
            height: 88,
            borderRadius: "50%",
            background: outcome.bgColor,
            border: `1px solid ${outcome.borderColor}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 40,
            margin: "0 auto 28px",
          }}
        >
          {outcome.icon}
        </div>

        <div className="animate-fade-up delay-1">
          <h2
            style={{
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: "-1px",
              marginBottom: 8,
              color: outcome.color,
            }}
          >
            {outcome.title}
          </h2>
          <p style={{ fontSize: 16, color: "var(--grey-1)", marginBottom: 32 }}>
            {outcome.subtitle}
          </p>
        </div>

        {/* Transaction details */}
        <div
          className="animate-fade-up delay-2"
          style={{
            background: "var(--black-2)",
            border: `1px solid ${outcome.borderColor}`,
            borderRadius: 16,
            overflow: "hidden",
            marginBottom: 24,
            textAlign: "left",
          }}
        >
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid var(--black-4)",
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                color: "var(--grey-1)",
              }}
            >
              Escrow #{agreementId}
            </span>
          </div>

          <div style={{ padding: "20px" }}>
            {type === "complete" && (
              <>
                <Row label="💸 Payer" value={payerName} />
                <Row
                  label="🎯 Receiver (paid)"
                  value={receiverName}
                  highlight
                />
                <Row
                  label="Amount Released"
                  value={`${sbtcAmount} sBTC ≈ $${amountLocked}`}
                  highlight
                />
                <Row
                  label="Condition Met"
                  value={editedTerms?.condition ?? "—"}
                />
              </>
            )}
            {type === "timeout" && (
              <>
                <Row label="💸 Payer (refunded)" value={payerName} highlight />
                <Row label="🎯 Receiver" value={receiverName} />
                <Row
                  label="Amount Refunded"
                  value={`${sbtcAmount} sBTC ≈ $${amountLocked}`}
                  highlight
                />
                <Row
                  label="Reason"
                  value="Deadline passed without completion"
                />
              </>
            )}
            {type === "dispute" && (
              <>
                <Row
                  label="Dispute Opened By"
                  value={
                    disputeOpenedBy
                      ? `${disputeOpenedBy.slice(0, 8)}...`
                      : walletAddress
                        ? `${walletAddress.slice(0, 8)}...`
                        : "—"
                  }
                />
                <Row
                  label="⚖️ Arbitrator"
                  value={editedTerms?.arbitrator ?? "TBD"}
                />
                <Row
                  label="Escrowed Funds"
                  value={`${sbtcAmount} sBTC — locked pending resolution`}
                  highlight
                />
                <Row
                  label="Auto-Resolution"
                  value="Refund to payer in 48hrs if no action"
                />
              </>
            )}
          </div>
        </div>

        {/* Dispute-specific next steps */}
        {type === "dispute" && (
          <div
            className="animate-fade-up delay-3"
            style={{
              background: "#f59e0b10",
              border: "1px solid #f59e0b40",
              borderRadius: "var(--radius-sm)",
              padding: "16px",
              marginBottom: 24,
              textAlign: "left",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#f59e0b",
                marginBottom: 10,
              }}
            >
              ⚖️ What happens next
            </div>
            <div
              style={{ fontSize: 13, color: "var(--grey-1)", lineHeight: 2 }}
            >
              <div>→ Arbitrator reviews evidence from both parties</div>
              <div>→ Can release funds to receiver or refund to payer</div>
              <div>→ No action in 48hrs → auto-refund to payer</div>
              <div>→ All decisions are final and on-chain</div>
            </div>
          </div>
        )}

        {/* Explorer link */}
        {type !== "dispute" && (
          <div className="animate-fade-up delay-3" style={{ marginBottom: 24 }}>
            <a
              href="#"
              style={{
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                color: "var(--yellow)",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              View on Stacks Explorer ↗
            </a>
          </div>
        )}

        {/* Role-specific message */}
        {type === "complete" && (
          <div
            className="animate-fade-up delay-3"
            style={{
              background: isPartyB ? "#22c55e10" : "var(--black-2)",
              border: `1px solid ${isPartyB ? "#22c55e30" : "var(--black-4)"}`,
              borderRadius: "var(--radius-sm)",
              padding: "12px 16px",
              marginBottom: 24,
              fontSize: 13,
              color: isPartyB ? "#22c55e" : "var(--grey-1)",
              lineHeight: 1.6,
            }}
          >
            {isPartyB
              ? "🎉 Payment has been transferred to your wallet."
              : `Agreement fulfilled. ${receiverName} has received payment.`}
          </div>
        )}

        {/* Actions */}
        <div
          className="animate-fade-up delay-4"
          style={{ display: "flex", gap: 12 }}
        >
          <button
            onClick={() => dispatch(resetAll())}
            style={{
              flex: 1,
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
            New Agreement
          </button>
          {type === "dispute" && (
            <button
              onClick={() => dispatch(setScreen("dashboard"))}
              style={{
                flex: 1,
                padding: "14px",
                background: "transparent",
                color: "var(--white)",
                border: "1px solid var(--black-4)",
                borderRadius: "var(--radius)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Back to Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 0",
        borderBottom: "1px solid var(--black-4)",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--grey-1)",
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: highlight ? 700 : 600,
          color: highlight ? "var(--yellow)" : "var(--white)",
          textAlign: "right",
          maxWidth: "60%",
        }}
      >
        {value}
      </span>
    </div>
  );
}
