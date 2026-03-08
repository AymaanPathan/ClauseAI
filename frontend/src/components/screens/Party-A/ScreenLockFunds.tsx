"use client";
import { useState, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setScreen,
  setMilestoneInputs,
  createAgreementThunk,
  depositThunk,
} from "../../../store/slices/agreementSlice";
import { MilestoneInput } from "@/lib/contractCalls";
import { isV2, ParsedAgreementV2 } from "@/api/parseApi";
import PresenceIndicator from "@/components/ui/PresenceIndicator";

const BLOCK_PER_DAY = 144;
function daysToBlocks(days: number, currentBlock: number): number {
  if (days === 0) return 0;
  return (currentBlock ?? 0) + Math.round(days * BLOCK_PER_DAY);
}
function isoToDays(iso: string): number {
  if (!iso) return 0;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
function totalPct(inputs: MilestoneRow[]) {
  return inputs.reduce((s, m) => s + (m?.percentage ?? 0), 0);
}

interface MilestoneRow {
  id: string;
  label: string;
  percentage: number;
  deadlineDays: number;
  condition: string;
}

function rowsToInputs(
  rows: MilestoneRow[],
  blockHeight: number,
): MilestoneInput[] {
  return rows
    .filter((r) => r !== undefined && r !== null)
    .map((r) => ({
      percentage: Math.round((r.percentage ?? 0) * 100),
      deadlineBlock: daysToBlocks(r.deadlineDays ?? 0, blockHeight ?? 0),
    }));
}

const DEFAULT_ROWS: MilestoneRow[] = [
  {
    id: "ms-0",
    label: "Wireframes",
    percentage: 30,
    deadlineDays: 7,
    condition: "",
  },
  {
    id: "ms-1",
    label: "Development",
    percentage: 50,
    deadlineDays: 21,
    condition: "",
  },
  {
    id: "ms-2",
    label: "Launch",
    percentage: 20,
    deadlineDays: 30,
    condition: "",
  },
];

function msColor(idx: number) {
  return `hsl(${(idx * 47 + 140) % 360}, 65%, 58%)`;
}

// Fallback arbitrator — a valid burn address for testnet
const FALLBACK_ARBITRATOR = "ST000000000000000000002AMW42H";

export default function ScreenLockFunds() {
  const dispatch = useAppDispatch();
  const {
    editedTerms,
    walletAddress,
    counterpartyWallet,
    agreementId,
    txCreate,
    txDeposit,
    blockHeight,
  } = useAppSelector((s) => s.agreement);

  function seedRows(): MilestoneRow[] {
    if (editedTerms && isV2(editedTerms)) {
      const v2 = editedTerms as unknown as ParsedAgreementV2;
      if (v2.milestones?.length > 0) {
        return v2.milestones.map((m, i) => ({
          id: `ms-${i}`,
          label: m.title || `Milestone ${i + 1}`,
          percentage: m.percentage ?? 0,
          deadlineDays: m.deadline ? isoToDays(m.deadline) : (i + 1) * 7,
          condition: m.condition || "",
        }));
      }
    }
    return DEFAULT_ROWS;
  }

  const [rows, setRows] = useState<MilestoneRow[]>(seedRows);
  const [step, setStep] = useState<"setup" | "deploying" | "depositing">(
    "setup",
  );

  const terms = editedTerms as unknown as Record<string, unknown>;
  const amountUsd = parseFloat(
    String(terms?.amount_usd ?? terms?.total_usd ?? "0"),
  );
  const pct = totalPct(rows);
  const pctOk = pct === 100;
  const receiverName = String(terms?.partyB ?? terms?.receiver ?? "Receiver");

  // Resolve a safe arbitrator address — "TBD" / "" / missing all crash principalCV
  function resolveArbitrator(): string {
    const raw = String(terms?.arbitrator ?? "").trim();
    if (!raw || raw === "TBD" || raw.length < 10) return FALLBACK_ARBITRATOR;
    return raw;
  }

  const arbitratorRaw = String(terms?.arbitrator ?? "").trim();
  const arbitratorIsFallback =
    !arbitratorRaw || arbitratorRaw === "TBD" || arbitratorRaw.length < 10;

  useEffect(() => {
    if (
      (txCreate.status === "confirming" || txCreate.status === "confirmed") &&
      step === "deploying"
    ) {
      setStep("depositing");
    }
  }, [txCreate.status, step]);

  async function handleDeploy() {
    if (!agreementId || !walletAddress) return;

    const partyBAddress = counterpartyWallet ?? "";
    if (!partyBAddress) {
      console.warn(
        "counterpartyWallet is empty — Party B may not have connected",
      );
    }

    const arbitrator = resolveArbitrator();
    const inputs = rowsToInputs(rows, blockHeight ?? 0);

    dispatch(setMilestoneInputs(inputs));
    setStep("deploying");
    await dispatch(
      createAgreementThunk({
        agreementId,
        partyA: walletAddress,
        partyB: partyBAddress,
        arbitrator,
        amountUsd,
        milestones: inputs,
      }),
    );
  }

  async function handleDeposit() {
    if (!agreementId || !walletAddress) return;
    await dispatch(
      depositThunk({ agreementId, amountUsd, senderAddress: walletAddress }),
    );
  }

  function updateRow(id: string, patch: Partial<MilestoneRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const isDeploying =
    txCreate.status === "pending" || txCreate.status === "confirming";
  const isDepositing =
    txDeposit.status === "pending" || txDeposit.status === "confirming";
  const depositDone = txDeposit.status === "confirmed";

  if (depositDone) {
    return (
      <div className="page">
        <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "rgba(34,197,94,0.06)",
              border: "1px solid rgba(34,197,94,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 28px",
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--green)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              marginBottom: 10,
            }}
          >
            Funds Locked
          </h2>
          <p
            style={{
              color: "var(--text-2)",
              fontSize: 13,
              lineHeight: 1.7,
              marginBottom: 28,
            }}
          >
            ${amountUsd} USD locked on Stacks. {receiverName} will be notified
            and can track milestones on the dashboard.
          </p>
          {txDeposit.txId && (
            <div
              className="code-block"
              style={{
                marginBottom: 24,
                textAlign: "center",
                padding: "10px 14px",
              }}
            >
              TX: {txDeposit.txId.slice(0, 12)}...{txDeposit.txId.slice(-8)}
            </div>
          )}
          <button
            className="btn btn-primary btn-lg"
            onClick={() => dispatch(setScreen("dashboard" as never))}
            style={{ width: "100%" }}
          >
            Go to Dashboard
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ alignItems: "flex-start", paddingTop: 64 }}>
      <div style={{ maxWidth: 620, width: "100%" }}>
        {/* Header */}
        <div className="fade-up" style={{ marginBottom: 36 }}>
          <button
            onClick={() => dispatch(setScreen("share-link"))}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-3)",
              fontSize: 11,
              cursor: "pointer",
              marginBottom: 20,
              fontFamily: "var(--mono)",
              letterSpacing: "0.04em",
              padding: 0,
            }}
          >
            ← Back
          </button>
          <div
            className="step-counter"
            style={{ display: "block", marginBottom: 12 }}
          >
            Step 6 of 6
          </div>
          <h2
            style={{
              fontSize: "clamp(24px, 3.5vw, 38px)",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
              marginBottom: 8,
            }}
          >
            Lock funds in escrow
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
            Review milestone breakdown and deploy the contract. Funds will be
            locked on-chain.
          </p>
        </div>

        {/* Summary row */}
        <div
          className="fade-up d1"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            overflow: "hidden",
            marginBottom: 20,
          }}
        >
          {[
            { label: "Total Amount", value: `$${amountUsd}` },
            { label: "Milestones", value: String(rows.length) },
            { label: "Receiver", value: receiverName },
          ].map(({ label, value }, i) => (
            <div
              key={label}
              style={{
                padding: "16px 18px",
                borderRight: i < 2 ? "1px solid var(--border)" : "none",
              }}
            >
              <div className="label" style={{ marginBottom: 6 }}>
                {label}
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-1)",
                  letterSpacing: "-0.02em",
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Arbitrator fallback warning */}
        {arbitratorIsFallback && (
          <div
            className="fade-in"
            style={{
              background: "rgba(245,158,11,0.07)",
              border: "1px solid rgba(245,158,11,0.25)",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 14,
              fontSize: 12,
              color: "#f59e0b",
              display: "flex",
              gap: 8,
            }}
          >
            <span>⚠️</span>
            <span>
              No arbitrator set — disputes cannot be resolved on-chain.{" "}
              <button
                onClick={() => dispatch(setScreen("set-arbitrator" as never))}
                style={{
                  background: "none",
                  border: "none",
                  color: "#f5c400",
                  cursor: "pointer",
                  fontSize: 12,
                  textDecoration: "underline",
                  padding: 0,
                }}
              >
                Set one now →
              </button>
            </span>
          </div>
        )}

        {/* Party status */}
        <div className="fade-up d1" style={{ marginBottom: 16 }}>
          <PresenceIndicator compact />
        </div>

        {/* Milestones table */}
        <div className="fade-up d2" style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <div className="label">Milestone breakdown</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                className="dot"
                style={{ background: pctOk ? "var(--green)" : "var(--amber)" }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: pctOk ? "var(--green)" : "var(--amber)",
                }}
              >
                {pct}% {!pctOk && "— must total 100%"}
              </span>
            </div>
          </div>
          <div className="table">
            {rows.map((row, i) => (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto auto",
                  gap: 12,
                  padding: "12px 16px",
                  borderBottom:
                    i < rows.length - 1 ? "1px solid var(--border)" : "none",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: msColor(i),
                      flexShrink: 0,
                      display: "inline-block",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--text-1)",
                    }}
                  >
                    {row.label}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--mono)",
                      color: "var(--text-3)",
                    }}
                  >
                    %
                  </span>
                  <input
                    type="number"
                    className="input"
                    value={row.percentage}
                    onChange={(e) =>
                      updateRow(row.id, { percentage: Number(e.target.value) })
                    }
                    style={{
                      width: 60,
                      padding: "5px 8px",
                      fontSize: 12,
                      textAlign: "center",
                    }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--mono)",
                      color: "var(--text-3)",
                    }}
                  >
                    days
                  </span>
                  <input
                    type="number"
                    className="input"
                    value={row.deadlineDays}
                    onChange={(e) =>
                      updateRow(row.id, {
                        deadlineDays: Number(e.target.value),
                      })
                    }
                    style={{
                      width: 60,
                      padding: "5px 8px",
                      fontSize: 12,
                      textAlign: "center",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-1)",
                    minWidth: 52,
                    textAlign: "right",
                  }}
                >
                  ${((amountUsd * row.percentage) / 100).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* TX status */}
        {(txCreate.status !== "idle" || txDeposit.status !== "idle") && (
          <div
            className="fade-in"
            style={{
              background: "var(--bg-1)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r)",
              padding: "14px 16px",
              marginBottom: 16,
            }}
          >
            <div className="label" style={{ marginBottom: 10 }}>
              Transaction status
            </div>
            {[
              {
                label: "Deploy contract",
                status: txCreate.status,
                tx: txCreate.txId,
                url: txCreate.txUrl,
              },
              {
                label: "Deposit funds",
                status: txDeposit.status,
                tx: txDeposit.txId,
                url: txDeposit.txUrl,
              },
            ].map(({ label, status, tx, url }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "var(--text-2)" }}>{label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {(status === "pending" || status === "confirming") && (
                    <span
                      className="spinner"
                      style={{ width: 12, height: 12 }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--mono)",
                      color:
                        status === "confirmed"
                          ? "var(--green)"
                          : status === "failed"
                            ? "var(--red)"
                            : status === "pending" || status === "confirming"
                              ? "var(--text-2)"
                              : "var(--text-4)",
                    }}
                  >
                    {status === "idle" ? "pending" : status}
                  </span>
                  {tx && url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--mono)",
                        color: "var(--text-3)",
                        textDecoration: "none",
                      }}
                    >
                      {tx.slice(0, 8)}…
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTAs */}
        <div
          className="fade-up d4"
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          {step === "setup" && (
            <button
              className="btn btn-primary btn-lg"
              onClick={handleDeploy}
              disabled={!pctOk || isDeploying}
              style={{ width: "100%" }}
            >
              {isDeploying ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14 }} />{" "}
                  Deploying Contract...
                </>
              ) : (
                <>Deploy & Lock ${amountUsd}</>
              )}
            </button>
          )}

          {step === "depositing" &&
            (txCreate.status === "confirming" ||
              txCreate.status === "confirmed") && (
              <button
                className="btn btn-primary btn-lg"
                onClick={handleDeposit}
                disabled={isDepositing}
                style={{ width: "100%" }}
              >
                {isDepositing ? (
                  <>
                    <span
                      className="spinner"
                      style={{ width: 14, height: 14 }}
                    />{" "}
                    Depositing...
                  </>
                ) : (
                  <>Deposit ${amountUsd} to Escrow</>
                )}
              </button>
            )}

          {txCreate.status === "failed" && (
            <div className="error-box">
              {txCreate.error ?? "Deployment failed. Please try again."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
