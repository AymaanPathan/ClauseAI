"use client";
// ============================================================
// ScreenLockFunds.tsx — MILESTONE UPGRADE
// Shows per-tranche breakdown synced from parsed milestones.
// Pre-populates rows from editedTerms.milestones (V2 schema).
// ============================================================
import { useState, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setScreen,
  setMilestoneInputs,
  createAgreementThunk,
  depositThunk,
} from "../../store/slices/agreementSlice";
import { MilestoneInput } from "@/lib/contractCalls";
import { isV2, ParsedAgreementV2 } from "@/api/parseApi";
import PresenceIndicator from "@/components/ui/PresenceIndicator";

// ── helpers ───────────────────────────────────────────────────
const BLOCK_PER_DAY = 144;

function daysToBlocks(days: number, currentBlock: number): number {
  if (days === 0) return 0;
  return currentBlock + Math.round(days * BLOCK_PER_DAY);
}

function isoToDays(iso: string): number {
  if (!iso) return 0;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function totalPct(inputs: MilestoneRow[]) {
  return inputs.reduce((s, m) => s + m.percentage, 0);
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
  return rows.map((r) => ({
    percentage: Math.round(r.percentage * 100), // → basis points
    deadlineBlock: daysToBlocks(r.deadlineDays, blockHeight),
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
  return `hsl(${(idx * 47 + 140) % 360}, 70%, 55%)`;
}

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

  // ── seed rows from parsed milestones if available ─────────
  function seedRows(): MilestoneRow[] {
    if (editedTerms && isV2(editedTerms)) {
      const v2 = editedTerms as unknown as ParsedAgreementV2;
      if (v2.milestones?.length > 0) {
        return v2.milestones.map((ms, i) => ({
          id: `ms-${i}`,
          label: ms.title || `Milestone ${i + 1}`,
          percentage: ms.percentage,
          deadlineDays: isoToDays(ms.deadline),
          condition: ms.condition || "",
        }));
      }
    }
    return DEFAULT_ROWS;
  }

  const [rows, setRows] = useState<MilestoneRow[]>(seedRows);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"configure" | "deploying" | "depositing">(
    "configure",
  );

  const amount = parseFloat(
    editedTerms?.amount_usd ?? (editedTerms as any)?.amount_usd ?? "100",
  );
  const pct = totalPct(rows);
  const pctOk = pct === 100;
  const canDeploy =
    pctOk &&
    walletAddress &&
    counterpartyWallet &&
    agreementId &&
    txCreate.status === "idle";

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
        condition: "",
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
  function autoBalance() {
    const each = Math.floor(100 / rows.length);
    const rem = 100 - each * rows.length;
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
        arbitrator: (editedTerms as any)?.arbitrator ?? walletAddress!,
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

  const pctColor =
    pct === 100 ? "#22c55e" : pct > 100 ? "#ef4444" : "var(--yellow)";

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
        {/* ── Header ──────────────────────────────────────── */}
        <div className="animate-fade-up" style={{ marginBottom: 28 }}>
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
                textTransform: "uppercase" as const,
              }}
            >
              Step 6 of 6
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
              ${amount.toFixed(0)} total · {rows.length} tranches
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
            Configure & Lock Funds
          </h2>
          <p style={{ color: "var(--grey-1)", fontSize: 14, lineHeight: 1.6 }}>
            Review milestone tranches. Each releases independently — disputes
            only lock that tranche.
          </p>
        </div>

        {/* ── Live presence ────────────────────────────────── */}
        <div className="animate-fade-up delay-1" style={{ marginBottom: 20 }}>
          <PresenceIndicator />
        </div>

        {/* ── Percentage meter ─────────────────────────────── */}
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
                  background: msColor(i),
                  transition: "width 0.25s",
                }}
              />
            ))}
          </div>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: pctColor,
              fontFamily: "var(--font-mono)",
              minWidth: 48,
              textAlign: "right" as const,
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

        {/* ── Milestone breakdown table ─────────────────────── */}
        <div
          className="animate-fade-up delay-2"
          style={{
            background: "var(--black-2)",
            border: "1px solid var(--black-4)",
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          {/* column headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "32px 1fr 64px 96px auto",
              gap: 0,
              padding: "8px 14px",
              borderBottom: "1px solid var(--black-4)",
              background: "var(--black-3)",
            }}
          >
            {["#", "Milestone", "%", "Deadline", "Amount"].map((h) => (
              <span
                key={h}
                style={{
                  fontSize: 9,
                  fontFamily: "var(--font-mono)",
                  color: "var(--grey-2)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.1em",
                }}
              >
                {h}
              </span>
            ))}
          </div>

          {rows.map((row, idx) => {
            const color = msColor(idx);
            const msAmt = ((amount * row.percentage) / 100).toFixed(2);
            const isEditing = editingId === row.id;

            return (
              <div
                key={row.id}
                style={{
                  borderBottom:
                    idx < rows.length - 1 ? "1px solid var(--black-4)" : "none",
                }}
              >
                {/* collapsed row */}
                <div
                  onClick={() => setEditingId(isEditing ? null : row.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "32px 1fr 64px 96px auto",
                    gap: 0,
                    padding: "12px 14px",
                    alignItems: "center",
                    cursor: "pointer",
                    background: isEditing ? "var(--black-3)" : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  {/* badge */}
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: `${color}20`,
                      border: `1px solid ${color}60`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      color,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {idx + 1}
                  </div>
                  {/* label */}
                  <span
                    style={{ fontSize: 13, fontWeight: 700, paddingRight: 8 }}
                  >
                    {row.label}
                  </span>
                  {/* pct */}
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {row.percentage}%
                  </span>
                  {/* deadline */}
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      color:
                        row.deadlineDays > 0
                          ? "var(--grey-1)"
                          : "var(--grey-3)",
                    }}
                  >
                    {row.deadlineDays > 0
                      ? `${row.deadlineDays}d / ~${Math.round(row.deadlineDays * BLOCK_PER_DAY)} blk`
                      : "none"}
                  </span>
                  {/* amount + delete */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontFamily: "var(--font-mono)",
                        color,
                        background: `${color}15`,
                        border: `1px solid ${color}30`,
                        borderRadius: 99,
                        padding: "2px 8px",
                      }}
                    >
                      ${msAmt}
                    </span>
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
                          fontSize: 14,
                          cursor: "pointer",
                          padding: "0 2px",
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                {/* expanded editor */}
                {isEditing && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      padding: "0 14px 14px",
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                      borderTop: "1px solid var(--black-4)",
                    }}
                  >
                    {/* label */}
                    <div>
                      <label style={inputLabel}>Label</label>
                      <input
                        autoFocus
                        value={row.label}
                        onChange={(e) =>
                          updateRow(row.id, { label: e.target.value })
                        }
                        style={inputStyle}
                      />
                    </div>
                    {/* percentage slider */}
                    <div>
                      <label style={inputLabel}>% of total</label>
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
                            textAlign: "right" as const,
                          }}
                        >
                          {row.percentage}%
                        </span>
                      </div>
                    </div>
                    {/* deadline */}
                    <div>
                      <label style={inputLabel}>
                        Deadline (days, 0 = none)
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
                          style={{ ...inputStyle, width: "100%" }}
                        />
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--grey-2)",
                            fontFamily: "var(--font-mono)",
                            whiteSpace: "nowrap" as const,
                          }}
                        >
                          {row.deadlineDays === 0
                            ? "none"
                            : `~${Math.round(row.deadlineDays * BLOCK_PER_DAY)} blk`}
                        </span>
                      </div>
                    </div>
                    {/* condition */}
                    <div>
                      <label style={inputLabel}>Release condition</label>
                      <input
                        value={row.condition}
                        onChange={(e) =>
                          updateRow(row.id, { condition: e.target.value })
                        }
                        placeholder="e.g. Client approves wireframes"
                        style={inputStyle}
                      />
                    </div>
                    <div
                      style={{
                        gridColumn: "1 / -1",
                        display: "flex",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        onClick={() => setEditingId(null)}
                        style={{
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          color: "var(--yellow)",
                          background: "var(--yellow-dim)",
                          border: "1px solid var(--yellow)",
                          borderRadius: 99,
                          padding: "4px 12px",
                          cursor: "pointer",
                        }}
                      >
                        Done ✓
                      </button>
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
              padding: "11px",
              background: "transparent",
              border: "1px dashed var(--black-5)",
              borderRadius: "var(--radius-sm)",
              color: "var(--grey-2)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            + Add milestone ({rows.length}/10)
          </button>
        )}

        {/* ── Escrow summary card ───────────────────────────── */}
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
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--grey-1)",
                textTransform: "uppercase" as const,
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
                  ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-4)}`
                  : "—",
              },
              {
                label: "🎯 Receiver",
                value: counterpartyWallet
                  ? `${counterpartyWallet.slice(0, 8)}…${counterpartyWallet.slice(-4)}`
                  : "Waiting…",
              },
              { label: "💵 Total locked", value: `$${amount.toFixed(2)}` },
              {
                label: "🧩 Milestones",
                value: `${rows.length} independent tranches`,
              },
              {
                label: "⚖️ Arbitrator",
                value: String((editedTerms as any)?.arbitrator ?? "TBD"),
              },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "7px 0",
                  borderBottom: "1px solid var(--black-4)",
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    color: "var(--grey-1)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    textTransform: "uppercase" as const,
                  }}
                >
                  {label}
                </span>
                <span style={{ fontWeight: 600 }}>{value}</span>
              </div>
            ))}
            {/* per-milestone tranche table */}
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 9,
                  fontFamily: "var(--font-mono)",
                  color: "var(--grey-2)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                }}
              >
                Tranche breakdown
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column" as const,
                  gap: 4,
                }}
              >
                {rows.map((r, i) => (
                  <div
                    key={r.id}
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: msColor(i),
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{ fontSize: 11, color: "var(--grey-1)", flex: 1 }}
                    >
                      {r.label}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        color: msColor(i),
                      }}
                    >
                      {r.percentage}%
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        color: "var(--grey-2)",
                      }}
                    >
                      ${((amount * r.percentage) / 100).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Phase buttons ─────────────────────────────────── */}
        <div
          className="animate-fade-up delay-4"
          style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}
        >
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
              }}
            >
              🚀 Deploy Agreement On-Chain
            </button>
          )}
          {(txCreate.status === "pending" ||
            txCreate.status === "confirming") && (
            <TxSpinner
              label={
                txCreate.status === "pending"
                  ? "Waiting for signature…"
                  : "Confirming on-chain…"
              }
              color="var(--yellow)"
              txUrl={txCreate.txUrl}
            />
          )}
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
              }}
            >
              🔒 Lock ${amount.toFixed(2)} in Escrow
            </button>
          )}
          {(txDeposit.status === "pending" ||
            txDeposit.status === "confirming") && (
            <TxSpinner
              label={
                txDeposit.status === "pending"
                  ? "Approve transfer in wallet…"
                  : "Funds locking…"
              }
              color="#22c55e"
              txUrl={txDeposit.txUrl}
            />
          )}
          {txCreate.error && <ErrBox msg={txCreate.error} />}
          {txDeposit.error && <ErrBox msg={txDeposit.error} />}
          {!pctOk && (
            <p
              style={{
                textAlign: "center" as const,
                fontSize: 12,
                color: pct > 100 ? "#ef4444" : "var(--grey-2)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {pct > 100
                ? `Over by ${pct - 100}% — reduce a milestone`
                : `${100 - pct}% unallocated — use auto-balance`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function TxSpinner({
  label,
  color,
  txUrl,
}: {
  label: string;
  color: string;
  txUrl: string | null;
}) {
  return (
    <div
      style={{
        padding: "16px",
        background: "var(--black-3)",
        border: `1px solid ${color}`,
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
          border: `2px solid ${color}`,
          borderTopColor: "transparent",
          borderRadius: "50%",
          animation: "spin 0.7s linear infinite",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>{label}</div>
        {txUrl && (
          <a
            href={txUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 11, color, fontFamily: "var(--font-mono)" }}
          >
            View tx ↗
          </a>
        )}
      </div>
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
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
      ❌ {msg}
    </div>
  );
}

// ── Shared input styles ───────────────────────────────────────
const inputLabel: React.CSSProperties = {
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  color: "var(--grey-1)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  display: "block",
  marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  background: "var(--black-4)",
  border: "1px solid var(--black-5)",
  borderRadius: "var(--radius-sm)",
  color: "var(--white)",
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "var(--font-display)",
  outline: "none",
  boxSizing: "border-box",
  width: "100%",
};
