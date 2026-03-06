"use client";
// ============================================================
// ScreenOutcome.tsx — MILESTONE UPGRADE
// 9A (complete): shows which milestone completed + that tranche amount
// 9B (timeout):  shows which milestone timed out + only that tranche refunded
// Dispute:       shows which tranche is locked + arbitrator path
// ============================================================
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { resetAll, setScreen } from "../../store/slices/agreementSlice";

// ── Milestone status codes ────────────────────────────────────
const MS_STATUS = {
  PENDING: 0,
  ACTIVE: 1,
  COMPLETE: 2,
  REFUNDED: 3,
  DISPUTED: 4,
};

function msColor(idx: number) {
  return `hsl(${(idx * 47 + 140) % 360}, 70%, 55%)`;
}

// ── Outcome configs ───────────────────────────────────────────
const OUTCOMES = {
  complete: {
    icon: "✅",
    color: "#22c55e",
    bgColor: "#22c55e15",
    borderColor: "#22c55e40",
    title: "Milestone Released",
    subtitle: "Conditions met — funds sent to receiver",
  },
  timeout: {
    icon: "⏱",
    color: "var(--yellow)",
    bgColor: "var(--yellow-dim)",
    borderColor: "var(--yellow)",
    title: "Tranche Expired",
    subtitle: "Deadline passed — that tranche auto-refunded to payer",
  },
  dispute: {
    icon: "⚖️",
    color: "#f59e0b",
    bgColor: "#f59e0b15",
    borderColor: "#f59e0b50",
    title: "Dispute Opened",
    subtitle: "Arbitrator has been notified for this tranche",
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
    milestones,
    milestoneInputs,
  } = useAppSelector((s) => s.agreement);

  const type = currentScreen as "complete" | "timeout" | "dispute";
  const outcome = OUTCOMES[type] ?? OUTCOMES.complete;

  // ── Derive relevant milestone(s) ─────────────────────────
  const totalUsd = parseFloat(
    (editedTerms as any)?.total_usd ??
      (editedTerms as any)?.amount_usd ??
      amountLocked ??
      "0",
  );

  // Find the just-completed / just-refunded / disputed milestone
  const targetStatus =
    type === "complete"
      ? MS_STATUS.COMPLETE
      : type === "timeout"
        ? MS_STATUS.REFUNDED
        : MS_STATUS.DISPUTED;

  // Use on-chain milestones if available, else milestoneInputs
  const allMs =
    milestones.length > 0
      ? milestones
      : milestoneInputs.map((inp, i) => ({
          index: i,
          percentage: inp.percentage,
          amount: 0,
          status: MS_STATUS.ACTIVE,
          deadlineBlock: inp.deadlineBlock,
          disputeBlock: 0,
        }));

  // The "last touched" milestone (most recently changed to target status)
  // For complete/timeout: last in target status. For dispute: last disputed.
  const touchedMs =
    [...allMs].reverse().find((m) => m.status === targetStatus) ??
    allMs[allMs.length - 1];
  const touchedIdx = touchedMs ? allMs.indexOf(touchedMs) : 0;
  const color = msColor(touchedIdx);

  // Labels from editedTerms.milestones if available
  const msLabels: string[] = (() => {
    const v2ms = (editedTerms as any)?.milestones;
    if (Array.isArray(v2ms))
      return v2ms.map((m: any, i: number) => m.title || `Milestone ${i + 1}`);
    return allMs.map((_, i) => `Milestone ${i + 1}`);
  })();

  const touchedLabel = msLabels[touchedIdx] ?? `Milestone ${touchedIdx + 1}`;
  const touchedPct = touchedMs ? touchedMs.percentage / 100 : 0; // basis pts → %
  const touchedUsd = ((totalUsd * touchedPct) / 100).toFixed(2);

  const payerName =
    (editedTerms as any)?.payer ?? (editedTerms as any)?.partyA ?? "Payer";
  const receiverName =
    (editedTerms as any)?.receiver ??
    (editedTerms as any)?.partyB ??
    "Receiver";
  const arbitrator = (editedTerms as any)?.arbitrator ?? "TBD";

  // Remaining milestones not yet resolved
  const remainingActive = allMs.filter(
    (m) => m.status === MS_STATUS.ACTIVE,
  ).length;
  const completedCount = allMs.filter(
    (m) => m.status === MS_STATUS.COMPLETE,
  ).length;

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
        {/* ── Icon ─────────────────────────────────────────── */}
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

        {/* ── Milestone badge ───────────────────────────────── */}
        <div
          className="animate-fade-up"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: `${color}15`,
            border: `1px solid ${color}40`,
            borderRadius: 99,
            padding: "4px 14px",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: color,
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color,
              fontWeight: 700,
              textTransform: "uppercase" as const,
              letterSpacing: "0.1em",
            }}
          >
            {touchedLabel} · {touchedPct}%
          </span>
        </div>

        <div className="animate-fade-up delay-1">
          <h2
            style={{
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: "-1px",
              marginBottom: 8,
              color: outcome.color,
            }}
          >
            {outcome.title}
          </h2>
          <p style={{ fontSize: 15, color: "var(--grey-1)", marginBottom: 28 }}>
            {outcome.subtitle}
          </p>
        </div>

        {/* ── Transaction detail card ───────────────────────── */}
        <div
          className="animate-fade-up delay-2"
          style={{
            background: "var(--black-2)",
            border: `1px solid ${outcome.borderColor}`,
            borderRadius: 16,
            overflow: "hidden",
            marginBottom: 20,
            textAlign: "left",
          }}
        >
          <div
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid var(--black-4)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
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
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color,
                background: `${color}15`,
                border: `1px solid ${color}30`,
                borderRadius: 99,
                padding: "2px 8px",
              }}
            >
              {touchedLabel}
            </span>
          </div>

          <div style={{ padding: 20 }}>
            {/* COMPLETE — 9A */}
            {type === "complete" && (
              <>
                <Row label="💸 Payer" value={payerName} />
                <Row
                  label="🎯 Receiver (paid)"
                  value={receiverName}
                  highlight
                />
                <Row
                  label="Tranche Released"
                  value={`$${touchedUsd} (${touchedPct}%)`}
                  highlight
                />
                <Row
                  label="Condition"
                  value={
                    (editedTerms as any)?.milestones?.[touchedIdx]?.condition ??
                    (editedTerms as any)?.condition ??
                    "—"
                  }
                />
                {allMs.length > 1 && (
                  <Row
                    label="Progress"
                    value={`${completedCount}/${allMs.length} milestones complete`}
                  />
                )}
              </>
            )}

            {/* TIMEOUT — 9B */}
            {type === "timeout" && (
              <>
                <Row label="💸 Payer (refunded)" value={payerName} highlight />
                <Row label="🎯 Receiver" value={receiverName} />
                <Row
                  label="Tranche Refunded"
                  value={`$${touchedUsd} (${touchedPct}%)`}
                  highlight
                />
                <Row
                  label="Reason"
                  value="Deadline passed without payer approval"
                />
                {allMs.length > 1 && (
                  <Row
                    label="Other Tranches"
                    value={`${remainingActive} milestone${remainingActive !== 1 ? "s" : ""} still active`}
                  />
                )}
              </>
            )}

            {/* DISPUTE */}
            {type === "dispute" && (
              <>
                <Row
                  label="Dispute Opened By"
                  value={
                    disputeOpenedBy
                      ? `${disputeOpenedBy.slice(0, 8)}…`
                      : walletAddress
                        ? `${walletAddress.slice(0, 8)}…`
                        : "—"
                  }
                />
                <Row label="⚖️ Arbitrator" value={arbitrator} />
                <Row
                  label="Tranche Locked"
                  value={`$${touchedUsd} (${touchedPct}%)`}
                  highlight
                />
                <Row
                  label="Other Tranches"
                  value={`${remainingActive} milestone${remainingActive !== 1 ? "s" : ""} unaffected`}
                />
                <Row
                  label="Auto-Resolution"
                  value="Refund to payer in 48hrs if no action"
                />
              </>
            )}
          </div>
        </div>

        {/* ── All milestones mini tracker ───────────────────── */}
        {allMs.length > 1 && (
          <div
            className="animate-fade-up delay-2"
            style={{
              background: "var(--black-2)",
              border: "1px solid var(--black-4)",
              borderRadius: 12,
              padding: "14px 16px",
              marginBottom: 20,
              textAlign: "left",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--grey-1)",
                textTransform: "uppercase" as const,
                letterSpacing: "0.1em",
                marginBottom: 10,
              }}
            >
              All Milestones
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column" as const,
                gap: 6,
              }}
            >
              {allMs.map((ms, i) => {
                const c = msColor(i);
                const statusEmoji =
                  ms.status === MS_STATUS.COMPLETE
                    ? "✅"
                    : ms.status === MS_STATUS.REFUNDED
                      ? "↩️"
                      : ms.status === MS_STATUS.DISPUTED
                        ? "⚖️"
                        : ms.status === MS_STATUS.ACTIVE
                          ? "🔒"
                          : "⏸";
                const statusColor =
                  ms.status === MS_STATUS.COMPLETE
                    ? "#22c55e"
                    : ms.status === MS_STATUS.REFUNDED
                      ? "#60a5fa"
                      : ms.status === MS_STATUS.DISPUTED
                        ? "#f59e0b"
                        : ms.status === MS_STATUS.ACTIVE
                          ? "#f5c400"
                          : "#475569";
                const pct = ms.percentage / 100;
                const usd = ((totalUsd * pct) / 100).toFixed(2);
                const isActive = i === touchedIdx;
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 8px",
                      background: isActive ? `${c}10` : "transparent",
                      border: `1px solid ${isActive ? c + "40" : "transparent"}`,
                      borderRadius: 6,
                    }}
                  >
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: c,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12,
                        flex: 1,
                        fontWeight: isActive ? 700 : 400,
                      }}
                    >
                      {msLabels[i] ?? `Milestone ${i + 1}`}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        color: "var(--grey-2)",
                      }}
                    >
                      ${usd}
                    </span>
                    <span style={{ fontSize: 11, color: statusColor }}>
                      {statusEmoji}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Dispute next steps ────────────────────────────── */}
        {type === "dispute" && (
          <div
            className="animate-fade-up delay-3"
            style={{
              background: "#f59e0b10",
              border: "1px solid #f59e0b40",
              borderRadius: "var(--radius-sm)",
              padding: 16,
              marginBottom: 20,
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
              <div>
                → Only <strong style={{ color: "#fff" }}>{touchedLabel}</strong>
                's ${touchedUsd} is frozen
              </div>
              <div>→ Other milestones continue as normal</div>
              <div>→ Arbitrator reviews evidence from both parties</div>
              <div>→ No action in 48hrs → auto-refund to payer</div>
              <div>→ All decisions are final and on-chain</div>
            </div>
          </div>
        )}

        {/* ── Explorer link ─────────────────────────────────── */}
        {type !== "dispute" && (
          <div className="animate-fade-up delay-3" style={{ marginBottom: 20 }}>
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

        {/* ── Role message ──────────────────────────────────── */}
        {type === "complete" && (
          <div
            className="animate-fade-up delay-3"
            style={{
              background: isPartyB ? "#22c55e10" : "var(--black-2)",
              border: `1px solid ${isPartyB ? "#22c55e30" : "var(--black-4)"}`,
              borderRadius: "var(--radius-sm)",
              padding: "12px 16px",
              marginBottom: 20,
              fontSize: 13,
              color: isPartyB ? "#22c55e" : "var(--grey-1)",
              lineHeight: 1.6,
            }}
          >
            {isPartyB
              ? `🎉 $${touchedUsd} has been transferred to your wallet.`
              : `${receiverName} received $${touchedUsd} for ${touchedLabel}.${remainingActive > 0 ? ` ${remainingActive} milestone${remainingActive > 1 ? "s" : ""} remaining.` : " All milestones complete!"}`}
          </div>
        )}

        {/* ── Actions ───────────────────────────────────────── */}
        <div
          className="animate-fade-up delay-4"
          style={{ display: "flex", gap: 12 }}
        >
          <button
            onClick={() => dispatch(resetAll())}
            style={{
              flex: 1,
              padding: 14,
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
          {(type === "dispute" ||
            (type === "complete" && remainingActive > 0)) && (
            <button
              onClick={() => dispatch(setScreen("dashboard"))}
              style={{
                flex: 1,
                padding: 14,
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

// ── Sub-component ─────────────────────────────────────────────

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
          textTransform: "uppercase" as const,
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
          textAlign: "right" as const,
          maxWidth: "60%",
        }}
      >
        {value}
      </span>
    </div>
  );
}
