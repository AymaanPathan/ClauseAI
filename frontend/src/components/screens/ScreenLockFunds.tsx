"use client";
import { useState, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setScreen,
  setMilestoneInputs,
} from "../../store/slices/agreementSlice";
import {
  createAgreementThunk,
  depositThunk,
} from "../../store/slices/agreementSlice";
import { MilestoneInput } from "@/lib/contractCalls";

// ─── helpers ────────────────────────────────────────────────
const BLOCK_PER_DAY = 144; // ~10 min blocks on Stacks

function daysToBlocks(days: number, currentBlock: number): number {
  if (days === 0) return 0;
  return currentBlock + Math.round(days * BLOCK_PER_DAY);
}

function totalPct(inputs: MilestoneInput[]) {
  return inputs.reduce((s, m) => s + m.percentage, 0);
}

// ─── types ───────────────────────────────────────────────────
interface MilestoneRow {
  id: string;
  label: string;
  percentage: number; // 0–100 display
  deadlineDays: number; // 0 = no deadline
}

function rowsToInputs(
  rows: MilestoneRow[],
  blockHeight: number,
): MilestoneInput[] {
  return rows.map((r) => ({
    percentage: Math.round(r.percentage * 100), // → basis points
    deadlineBlock: daysToBlocks(r.deadlineDays, blockHeight),
  }));
}

const DEFAULT_ROWS: MilestoneRow[] = [
  { id: "ms-0", label: "Wireframes", percentage: 30, deadlineDays: 7 },
  { id: "ms-1", label: "Development", percentage: 50, deadlineDays: 21 },
  { id: "ms-2", label: "Launch", percentage: 20, deadlineDays: 30 },
];

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

  const [rows, setRows] = useState<MilestoneRow[]>(DEFAULT_ROWS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [phase, setPhase] = useState<"configure" | "deploying" | "depositing">(
    "configure",
  );

  const amount = parseFloat(editedTerms?.amount_usd ?? "100");
  const pct = totalPct(rows as any);
  const pctOk = pct === 100;
  const canDeploy =
    pctOk &&
    walletAddress &&
    counterpartyWallet &&
    agreementId &&
    txCreate.status === "idle";

  // watch tx states to advance phase
  useEffect(() => {
    if (txCreate.status === "confirming") setPhase("deploying");
    if (txDeposit.status === "confirming") setPhase("depositing");
    if (txDeposit.status === "confirmed") dispatch(setScreen("dashboard"));
  }, [txCreate.status, txDeposit.status]);

  // ── row mutations ─────────────────────────────────────────
  function addRow() {
    if (rows.length >= 10) return;
    setRows((r) => [
      ...r,
      {
        id: `ms-${Date.now()}`,
        label: `Milestone ${r.length + 1}`,
        percentage: 0,
        deadlineDays: 14,
      },
    ]);
  }

  function removeRow(id: string) {
    if (rows.length <= 1) return;
    setRows((r) => r.filter((x) => x.id !== id));
  }

  function updateRow(id: string, patch: Partial<MilestoneRow>) {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  // auto-distribute remaining % evenly
  function autoBalance() {
    const total = 100;
    const each = Math.floor(total / rows.length);
    const rem = total - each * rows.length;
    setRows((r) =>
      r.map((x, i) => ({ ...x, percentage: each + (i === 0 ? rem : 0) })),
    );
  }

  // ── deploy + deposit ──────────────────────────────────────
  async function handleDeploy() {
    if (!canDeploy) return;
    const inputs = rowsToInputs(rows, blockHeight);
    dispatch(setMilestoneInputs(inputs));
    await dispatch(
      createAgreementThunk({
        agreementId: agreementId!,
        partyA: walletAddress!,
        partyB: counterpartyWallet!,
        arbitrator: editedTerms?.arbitrator ?? walletAddress!,
        amountUsd: amount,
        milestones: inputs,
      }),
    );
  }

  async function handleDeposit() {
    if (!walletAddress || !agreementId) return;
    await dispatch(
      depositThunk({
        agreementId: agreementId!,
        amountUsd: amount,
        senderAddress: walletAddress!,
      }),
    );
  }

  // ── pill color ────────────────────────────────────────────
  const pctColor =
    pct === 100 ? "#22c55e" : pct > 100 ? "#ef4444" : "var(--yellow)";

  const PHASE_COLORS = ["var(--yellow)", "#22c55e", "#60a5fa"] as const;

  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "60px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 640, width: "100%" }}>
        {/* ── Header ─────────────────────────────────────── */}
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
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ← Back
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                color: "var(--yellow)",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
              }}
            >
              Step 5 of 6
            </span>
            <span
              style={{
                fontSize: 12,
                background: "var(--black-3)",
                border: "1px solid var(--black-4)",
                borderRadius: 99,
                padding: "2px 12px",
                color: "var(--grey-1)",
                fontFamily: "var(--font-mono)",
              }}
            >
              ${amount.toFixed(0)} total
            </span>
          </div>

          <h2
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-1px",
              marginBottom: 8,
            }}
          >
            Configure Milestones
          </h2>
          <p style={{ color: "var(--grey-1)", fontSize: 14, lineHeight: 1.6 }}>
            Split payment into tranches. Each milestone releases independently —
            disputes only lock that tranche.
          </p>
        </div>

        {/* ── Percentage meter ────────────────────────────── */}
        <div
          className="animate-fade-up delay-1"
          style={{
            background: "var(--black-2)",
            border: `1px solid ${pctColor}40`,
            borderRadius: "var(--radius-sm)",
            padding: "14px 16px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          {/* stacked bar */}
          <div
            style={{
              flex: 1,
              height: 6,
              background: "var(--black-5)",
              borderRadius: 3,
              overflow: "hidden",
              display: "flex",
            }}
          >
            {rows.map((r, i) => (
              <div
                key={r.id}
                style={{
                  height: "100%",
                  width: `${Math.min(r.percentage, 100)}%`,
                  background: `hsl(${(i * 47 + 140) % 360}, 70%, 55%)`,
                  transition: "width 0.25s",
                }}
              />
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: pctColor,
                fontFamily: "var(--font-mono)",
                minWidth: 48,
                textAlign: "right",
              }}
            >
              {pct}%
            </span>
            {!pctOk && (
              <button
                onClick={autoBalance}
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--yellow)",
                  background: "var(--yellow-dim)",
                  border: "1px solid var(--yellow)",
                  borderRadius: 99,
                  padding: "3px 10px",
                  cursor: "pointer",
                }}
              >
                Auto-balance
              </button>
            )}
            {pctOk && <span style={{ fontSize: 16 }}>✅</span>}
          </div>
        </div>

        {/* ── Milestone rows ───────────────────────────────── */}
        <div
          className="animate-fade-up delay-2"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginBottom: 16,
          }}
        >
          {rows.map((row, idx) => {
            const milestoneAmount = (amount * row.percentage) / 100;
            const hue = (idx * 47 + 140) % 360;
            const color = `hsl(${hue}, 70%, 55%)`;
            const isEditing = editingId === row.id;

            return (
              <div
                key={row.id}
                style={{
                  background:
                    dragOver === row.id ? "var(--black-3)" : "var(--black-2)",
                  border: `1px solid ${isEditing ? color : "var(--black-4)"}`,
                  borderRadius: "var(--radius-sm)",
                  padding: "16px",
                  transition: "all var(--transition)",
                  cursor: "pointer",
                }}
                onClick={() => setEditingId(isEditing ? null : row.id)}
              >
                {/* Row header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  {/* index badge */}
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: `${color}20`,
                      border: `1px solid ${color}60`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color,
                      flexShrink: 0,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {idx + 1}
                  </div>

                  {/* label */}
                  {isEditing ? (
                    <input
                      autoFocus
                      value={row.label}
                      onChange={(e) =>
                        updateRow(row.id, { label: e.target.value })
                      }
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => setEditingId(null)}
                      onKeyDown={(e) => e.key === "Enter" && setEditingId(null)}
                      style={{
                        flex: 1,
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        color: "var(--white)",
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: "var(--font-display)",
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        flex: 1,
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      {row.label}
                    </span>
                  )}

                  {/* amount chip */}
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                      color,
                      background: `${color}15`,
                      border: `1px solid ${color}30`,
                      borderRadius: 99,
                      padding: "2px 10px",
                    }}
                  >
                    ${milestoneAmount.toFixed(2)}
                  </span>

                  {/* delete */}
                  {rows.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRow(row.id);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--grey-2)",
                        fontSize: 16,
                        cursor: "pointer",
                        lineHeight: 1,
                        padding: "0 4px",
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Expanded controls */}
                {isEditing && (
                  <div
                    style={{
                      marginTop: 16,
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* percentage */}
                    <div>
                      <label
                        style={{
                          fontSize: 10,
                          fontFamily: "var(--font-mono)",
                          color: "var(--grey-1)",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          display: "block",
                          marginBottom: 6,
                        }}
                      >
                        % of total
                      </label>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <input
                          type="range"
                          min={1}
                          max={99}
                          value={row.percentage}
                          onChange={(e) =>
                            updateRow(row.id, {
                              percentage: Number(e.target.value),
                            })
                          }
                          style={{
                            flex: 1,
                            accentColor: color,
                            cursor: "pointer",
                          }}
                        />
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 13,
                            fontWeight: 700,
                            color,
                            minWidth: 36,
                            textAlign: "right",
                          }}
                        >
                          {row.percentage}%
                        </span>
                      </div>
                    </div>

                    {/* deadline */}
                    <div>
                      <label
                        style={{
                          fontSize: 10,
                          fontFamily: "var(--font-mono)",
                          color: "var(--grey-1)",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          display: "block",
                          marginBottom: 6,
                        }}
                      >
                        Deadline (days)
                      </label>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <input
                          type="number"
                          min={0}
                          max={365}
                          value={row.deadlineDays}
                          onChange={(e) =>
                            updateRow(row.id, {
                              deadlineDays: Number(e.target.value),
                            })
                          }
                          style={{
                            flex: 1,
                            background: "var(--black-4)",
                            border: "1px solid var(--black-5)",
                            borderRadius: "var(--radius-sm)",
                            color: "var(--white)",
                            padding: "8px 10px",
                            fontSize: 13,
                            fontFamily: "var(--font-mono)",
                            outline: "none",
                          }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--grey-2)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {row.deadlineDays === 0
                            ? "none"
                            : `~${Math.round(row.deadlineDays * BLOCK_PER_DAY)} blk`}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add milestone */}
        {rows.length < 10 && (
          <button
            className="animate-fade-up delay-3"
            onClick={addRow}
            style={{
              width: "100%",
              padding: "12px",
              background: "transparent",
              border: "1px dashed var(--black-5)",
              borderRadius: "var(--radius-sm)",
              color: "var(--grey-2)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 28,
              transition: "all var(--transition)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor =
                "var(--grey-3)";
              (e.currentTarget as HTMLElement).style.color = "var(--white)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor =
                "var(--black-5)";
              (e.currentTarget as HTMLElement).style.color = "var(--grey-2)";
            }}
          >
            + Add milestone ({rows.length}/10)
          </button>
        )}

        {/* ── Summary card ─────────────────────────────────── */}
        <div
          className="animate-fade-up delay-3"
          style={{
            background: "var(--black-2)",
            border: "1px solid var(--black-4)",
            borderRadius: "var(--radius)",
            overflow: "hidden",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid var(--black-4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--grey-1)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Escrow Summary
            </span>
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--grey-2)",
              }}
            >
              #{agreementId}
            </span>
          </div>
          <div style={{ padding: "16px 20px" }}>
            {[
              {
                label: "💸 Payer (you)",
                value: walletAddress
                  ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}`
                  : "—",
              },
              {
                label: "🎯 Receiver",
                value: counterpartyWallet
                  ? `${counterpartyWallet.slice(0, 8)}...${counterpartyWallet.slice(-4)}`
                  : "waiting...",
              },
              { label: "💵 Total", value: `$${amount.toFixed(2)}` },
              { label: "🧩 Milestones", value: `${rows.length} tranches` },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--black-4)",
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    color: "var(--grey-1)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </span>
                <span style={{ fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Phase buttons ─────────────────────────────────── */}
        <div
          className="animate-fade-up delay-4"
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          {/* Step 1: Deploy */}
          {(txCreate.status === "idle" || txCreate.status === "failed") && (
            <button
              onClick={handleDeploy}
              disabled={!canDeploy}
              style={{
                width: "100%",
                padding: "16px",
                background: canDeploy ? "var(--yellow)" : "var(--black-4)",
                color: canDeploy ? "var(--black)" : "var(--grey-2)",
                border: "none",
                borderRadius: "var(--radius)",
                fontSize: 15,
                fontWeight: 700,
                cursor: canDeploy ? "pointer" : "not-allowed",
                transition: "all var(--transition)",
              }}
              onMouseEnter={(e) =>
                canDeploy &&
                ((e.currentTarget as HTMLElement).style.background =
                  "var(--yellow-hover)")
              }
              onMouseLeave={(e) =>
                canDeploy &&
                ((e.currentTarget as HTMLElement).style.background =
                  "var(--yellow)")
              }
            >
              🚀 Deploy Agreement On-Chain
            </button>
          )}

          {/* Deploying spinner */}
          {(txCreate.status === "pending" ||
            txCreate.status === "confirming") && (
            <div
              style={{
                padding: "16px",
                background: "var(--black-3)",
                border: "1px solid var(--yellow)",
                borderRadius: "var(--radius)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 14,
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  border: "2px solid var(--yellow)",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 0.7s linear infinite",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              <div>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>
                  {txCreate.status === "pending"
                    ? "Waiting for signature..."
                    : "Confirming on-chain..."}
                </div>
                {txCreate.txUrl && (
                  <a
                    href={txCreate.txUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 11,
                      color: "var(--yellow)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    View tx ↗
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Deposit — shown after create confirms */}
          {txCreate.status === "confirming" && txDeposit.status === "idle" && (
            <button
              onClick={handleDeposit}
              style={{
                width: "100%",
                padding: "16px",
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
              🔒 Lock ${amount.toFixed(2)} in Escrow
            </button>
          )}

          {/* Depositing spinner */}
          {(txDeposit.status === "pending" ||
            txDeposit.status === "confirming") && (
            <div
              style={{
                padding: "16px",
                background: "var(--black-3)",
                border: "1px solid #22c55e",
                borderRadius: "var(--radius)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 14,
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  border: "2px solid #22c55e",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 0.7s linear infinite",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              <div>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>
                  {txDeposit.status === "pending"
                    ? "Approve transfer in wallet..."
                    : "Funds locking..."}
                </div>
                {txDeposit.txUrl && (
                  <a
                    href={txDeposit.txUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 11,
                      color: "#22c55e",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    View tx ↗
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Errors */}
          {txCreate.error && (
            <div
              style={{
                padding: "12px 16px",
                background: "#ef444415",
                border: "1px solid #ef444440",
                borderRadius: "var(--radius-sm)",
                fontSize: 13,
                color: "#ef4444",
              }}
            >
              ❌ {txCreate.error}
            </div>
          )}
          {txDeposit.error && (
            <div
              style={{
                padding: "12px 16px",
                background: "#ef444415",
                border: "1px solid #ef444440",
                borderRadius: "var(--radius-sm)",
                fontSize: 13,
                color: "#ef4444",
              }}
            >
              ❌ {txDeposit.error}
            </div>
          )}

          {/* validation hint */}
          {!pctOk && (
            <p
              style={{
                textAlign: "center",
                fontSize: 12,
                color: pct > 100 ? "#ef4444" : "var(--grey-2)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {pct > 100
                ? `Over by ${pct - 100}% — reduce a milestone`
                : `${100 - pct}% unallocated — add to a milestone or auto-balance`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
