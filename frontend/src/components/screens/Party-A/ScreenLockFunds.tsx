"use client";
import { useState, useEffect } from "react";

import {
  setScreen,
  setMilestoneInputs,
  createAgreementThunk,
  depositThunk,
} from "@/store/slices/partyASlice";
import { MilestoneInput } from "@/lib/contractCalls";
import { isV2, ParsedAgreementV2 } from "@/api/parseApi";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/store";

const BLOCK_PER_DAY = 144;
const FALLBACK_ARBITRATOR = "ST000000000000000000002AMW42H";

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
function msColor(idx: number) {
  return `hsl(${(idx * 47 + 140) % 360}, 65%, 58%)`;
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
  return rows.filter(Boolean).map((r) => ({
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

export default function ScreenLockFunds() {
  const dispatch = useDispatch<AppDispatch>();
  const {
    editedTerms,
    walletAddress,
    counterpartyWallet,
    agreementId,
    txCreate,
    txDeposit,
    blockHeight,
  } = useSelector((s: RootState) => s.partyA);

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
    const arbitrator = resolveArbitrator();
    const inputs = rowsToInputs(rows, blockHeight ?? 0);
    dispatch(setMilestoneInputs(inputs));
    setStep("deploying");
    await dispatch(
      createAgreementThunk({
        agreementId,
        partyA: walletAddress,
        partyB: counterpartyWallet ?? "",
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

  // ── Funds Locked Success ───────────────────────────────────
  if (depositDone) {
    return (
      <div className="page">
        <style>{css}</style>
        <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 28px",
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--green)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              marginBottom: 8,
            }}
          >
            Funds Locked 🎉
          </h2>
          <p
            style={{
              color: "var(--text-2)",
              fontSize: 13,
              lineHeight: 1.7,
              marginBottom: 28,
            }}
          >
            <strong style={{ color: "var(--text-1)" }}>${amountUsd} USD</strong>{" "}
            is now secured on Stacks.{" "}
            <strong style={{ color: "var(--text-1)" }}>{receiverName}</strong>{" "}
            has been notified and can track milestones on the dashboard.
          </p>
          <div
            style={{
              background: "var(--bg-1)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r)",
              padding: "16px 18px",
              marginBottom: 24,
              textAlign: "left",
            }}
          >
            <div className="label" style={{ marginBottom: 12 }}>
              Both parties are notified
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
              >
                <div
                  className="notif-dot"
                  style={{ background: "var(--amber)" }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-2)",
                    lineHeight: 1.5,
                  }}
                >
                  <strong style={{ color: "var(--text-1)" }}>
                    You (Payer):
                  </strong>{" "}
                  Redirected to the dashboard to track milestones and release
                  payments.
                </span>
              </div>
              <div
                style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
              >
                <div
                  className="notif-dot"
                  style={{ background: "var(--green)" }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-2)",
                    lineHeight: 1.5,
                  }}
                >
                  <strong style={{ color: "var(--text-1)" }}>
                    {receiverName}:
                  </strong>{" "}
                  Their waiting screen automatically redirects to the dashboard.
                </span>
              </div>
            </div>
          </div>
          {txDeposit.txId && (
            <div
              style={{
                marginBottom: 24,
                padding: "10px 14px",
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                textAlign: "center",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: "var(--text-4)",
                }}
              >
                TX:{" "}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: "var(--text-2)",
                }}
              >
                {txDeposit.txId.slice(0, 12)}…{txDeposit.txId.slice(-8)}
              </span>
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

  // ── Main Lock Funds Screen ─────────────────────────────────
  return (
    <div className="page" style={{ alignItems: "flex-start", paddingTop: 64 }}>
      <style>{css}</style>
      <div style={{ maxWidth: 600, width: "100%" }}>
        {/* Header */}
        <div className="fade-up" style={{ marginBottom: 32 }}>
          <button
            onClick={() => dispatch(setScreen("approve-agreement"))}
            className="back-btn"
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
              fontSize: "clamp(24px, 3.5vw, 40px)",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              marginBottom: 8,
            }}
          >
            Lock funds in escrow
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
            Confirm milestones and deploy the escrow contract. Both parties have
            already approved.
          </p>
        </div>

        {/* Summary */}
        <div
          className="fade-up d1"
          style={{
            background: "var(--bg-1)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            padding: "14px 16px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div className="label" style={{ marginBottom: 4 }}>
                Locking for
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-1)",
                }}
              >
                {receiverName}
              </div>
              {counterpartyWallet && (
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--mono)",
                    color: "var(--text-4)",
                    marginTop: 2,
                  }}
                >
                  {counterpartyWallet.slice(0, 10)}…
                  {counterpartyWallet.slice(-6)}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="label" style={{ marginBottom: 4 }}>
                Total amount
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--text-1)",
                  letterSpacing: "-0.03em",
                }}
              >
                ${amountUsd}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: "var(--text-4)",
                }}
              >
                USD
              </div>
            </div>
          </div>
        </div>

        {/* Arbitrator warning */}
        {arbitratorIsFallback && (
          <div
            className="fade-up d1"
            style={{
              background: "rgba(245,158,11,0.05)",
              border: "1px solid rgba(245,158,11,0.15)",
              borderRadius: "var(--r-sm)",
              padding: "12px 16px",
              marginBottom: 20,
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--amber)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0, marginTop: 1 }}
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p
              style={{
                fontSize: 11,
                color: "var(--amber)",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              No arbitrator set — using fallback burn address. Disputes won't be
              resolvable on-chain.
            </p>
          </div>
        )}

        {/* Milestones */}
        <div className="fade-up d2" style={{ marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <div className="label">Milestones</div>
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
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
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
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
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

        {/* TX Status */}
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
                            : status === "idle"
                              ? "var(--text-4)"
                              : "var(--text-2)",
                    }}
                  >
                    {status === "idle" ? "waiting" : status}
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

        {txCreate.status === "failed" && (
          <div className="error-box" style={{ marginBottom: 16 }}>
            {txCreate.error ?? "Deployment failed."}
          </div>
        )}
        {txDeposit.status === "failed" && (
          <div className="error-box" style={{ marginBottom: 16 }}>
            {txDeposit.error ?? "Deposit failed."}
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
                  Deploying Contract…
                </>
              ) : (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>{" "}
                  Deploy & Lock ${amountUsd}
                </>
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
                    Depositing…
                  </>
                ) : (
                  <>Deposit ${amountUsd} to Escrow</>
                )}
              </button>
            )}
        </div>
      </div>
    </div>
  );
}

const css = `
.back-btn { background: none; border: none; color: var(--text-3); font-size: 11px; cursor: pointer; margin-bottom: 20px; font-family: var(--mono); letter-spacing: 0.04em; padding: 0; }
.notif-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 3px; }
`;
