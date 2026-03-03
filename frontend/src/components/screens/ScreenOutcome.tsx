"use client";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { resetAll, setScreen } from "../../store/slices/agreementSlice";

const OUTCOMES = {
  complete: {
    icon: "✅",
    color: "#22c55e",
    bgColor: "#22c55e15",
    borderColor: "#22c55e40",
    title: "Agreement Complete",
    subtitle: "Funds released successfully",
  },
  timeout: {
    icon: "⏱",
    color: "var(--yellow)",
    bgColor: "var(--yellow-dim)",
    borderColor: "var(--yellow)",
    title: "Agreement Expired",
    subtitle: "Auto-refund triggered",
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
  } = useAppSelector((s) => s.agreement);

  const type = currentScreen as "complete" | "timeout" | "dispute";
  const outcome = OUTCOMES[type] ?? OUTCOMES.complete;

  const sbtcAmount = amountLocked
    ? (parseFloat(amountLocked) / 67000).toFixed(6)
    : "0.000000";

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
              Agreement #{agreementId}
            </span>
          </div>

          <div style={{ padding: "20px" }}>
            {type === "complete" && (
              <>
                <Row
                  label="Released to"
                  value={editedTerms?.partyA ?? "Party A"}
                />
                <Row
                  label="Amount"
                  value={`${sbtcAmount} sBTC ≈ $${amountLocked}`}
                  highlight
                />
                <Row
                  label="Condition met"
                  value={editedTerms?.condition ?? "—"}
                />
              </>
            )}
            {type === "timeout" && (
              <>
                <Row
                  label="Refunded to"
                  value={editedTerms?.partyB ?? "Party B"}
                />
                <Row
                  label="Amount"
                  value={`${sbtcAmount} sBTC ≈ $${amountLocked}`}
                  highlight
                />
                <Row
                  label="Reason"
                  value="72hr deadline passed with no action"
                />
              </>
            )}
            {type === "dispute" && (
              <>
                <Row
                  label="Dispute by"
                  value={disputeOpenedBy ?? walletAddress ?? "—"}
                />
                <Row
                  label="Arbitrator"
                  value={editedTerms?.arbitrator ?? "TBD"}
                />
                <Row
                  label="Funds"
                  value={`${sbtcAmount} sBTC locked pending resolution`}
                  highlight
                />
                <Row
                  label="Timeout"
                  value="Auto-resolve in 48hrs if arbitrator inactive"
                />
              </>
            )}
          </div>
        </div>

        {/* Dispute specific info */}
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
                marginBottom: 8,
              }}
            >
              ⚖️ What happens next
            </div>
            <ul
              style={{
                fontSize: 13,
                color: "var(--grey-1)",
                lineHeight: 2,
                paddingLeft: 20,
              }}
            >
              <li>Arbitrator reviews the dispute</li>
              <li>They can release to Party A or refund to Party B</li>
              <li>If no action in 48hrs → auto-refund to Party B</li>
              <li>All decisions are final and on-chain</li>
            </ul>
          </div>
        )}

        {/* Transaction hash mock */}
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
              View on Explorer ↗
            </a>
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
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: highlight ? 700 : 600,
          color: highlight ? "var(--yellow)" : "var(--white)",
        }}
      >
        {value}
      </span>
    </div>
  );
}
