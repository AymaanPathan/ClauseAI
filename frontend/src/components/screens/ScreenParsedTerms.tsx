"use client";
// ============================================================
// ScreenParsedTerms.tsx — MILESTONE UPGRADE
// Shows parsed milestones as editable table.
// Falls back gracefully for rental/bet (single-payment, V1 schema).
// ============================================================
import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setScreen,
  updateEditedTerms,
  approveTerms,
} from "../../store/slices/agreementSlice";
import { isV2, ParsedAgreementV2, Milestone } from "@/api/parseApi";

// ── helpers ───────────────────────────────────────────────────
function confColor(c?: string) {
  if (c === "high") return "#22c55e";
  if (c === "medium") return "var(--yellow)";
  return "#ef4444";
}

function milestoneStatusColor(pct: number, total: number) {
  const hue = (total * 47 + 140) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

export default function ScreenParsedTerms() {
  const dispatch = useAppDispatch();
  const { editedTerms, parseMeta, parseError, agreementType } = useAppSelector(
    (s) => s.agreement,
  );
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingMsIdx, setEditingMsIdx] = useState<number | null>(null);

  // ── error state ───────────────────────────────────────────
  if (parseError) {
    return (
      <div style={styles.center}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
          <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Parse Failed
          </h3>
          <p style={{ color: "var(--grey-1)", marginBottom: 24 }}>
            {parseError}
          </p>
          <button
            onClick={() => dispatch(setScreen("describe"))}
            style={styles.yellowBtn}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!editedTerms) return null;

  const terms = editedTerms as unknown as Record<string, unknown>;
  const hasV2 = isV2(editedTerms);
  const v2 = hasV2 ? (editedTerms as unknown as ParsedAgreementV2) : null;

  const payer = hasV2
    ? v2!.payer || "Payer"
    : (terms["partyA"] as string) || "Payer";
  const receiver = hasV2
    ? v2!.receiver || "Receiver"
    : (terms["partyB"] as string) || "Receiver";
  const amount = hasV2 ? v2!.total_usd : (terms["amount_usd"] as string) || "—";
  const confidence = (terms["confidence"] as string) ?? "medium";
  const cc = confColor(confidence);

  // ── field edit helpers ────────────────────────────────────
  function editField(key: string, val: string) {
    dispatch(updateEditedTerms({ [key]: val } as never));
  }

  // ── milestone edit helpers ────────────────────────────────
  function editMilestone(idx: number, patch: Partial<Milestone>) {
    if (!v2) return;
    const updated = v2.milestones.map((m, i) =>
      i === idx ? { ...m, ...patch } : m,
    );
    dispatch(updateEditedTerms({ milestones: updated } as never));
  }

  function msSum() {
    return v2?.milestones.reduce((s, m) => s + m.percentage, 0) ?? 0;
  }

  const totalPct = msSum();
  const pctOk = totalPct === 100;
  const totalAmt = parseFloat(amount || "0");

  return (
    <div style={styles.page}>
      <div style={{ maxWidth: 640, width: "100%" }}>
        {/* ── Header ──────────────────────────────────────── */}
        <div className="animate-fade-up" style={{ marginBottom: 28 }}>
          <button
            onClick={() => dispatch(setScreen("describe"))}
            style={styles.backBtn}
          >
            ← Back
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span style={styles.stepLabel}>Step 3 of 6</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: cc,
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: cc,
                  textTransform: "uppercase" as const,
                }}
              >
                {confidence} confidence
              </span>
            </div>
          </div>
          <h2 style={styles.h2}>Review your terms</h2>
          <p style={{ color: "var(--grey-1)", fontSize: 14 }}>
            AI parsed your agreement. Click any field to edit before approving.
          </p>
        </div>

        {/* ── Escrow flow diagram ──────────────────────────── */}
        <div className="animate-fade-up delay-1" style={styles.flowDiagram}>
          <FlowParty label="Payer" name={payer} color="var(--yellow)" />
          <span style={{ color: "var(--grey-3)", fontSize: 18 }}>→</span>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 10,
                color: "var(--grey-1)",
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase" as const,
                marginBottom: 4,
              }}
            >
              🔒 Escrow
            </div>
            <div style={{ fontWeight: 700, color: "var(--grey-1)" }}>
              ${amount}
            </div>
            {hasV2 && v2!.milestones.length > 1 && (
              <div
                style={{
                  fontSize: 10,
                  color: "var(--grey-2)",
                  fontFamily: "var(--font-mono)",
                  marginTop: 2,
                }}
              >
                {v2!.milestones.length} milestones
              </div>
            )}
          </div>
          <span style={{ color: "var(--grey-3)", fontSize: 18 }}>→</span>
          <FlowParty label="Receiver" name={receiver} color="#22c55e" />
        </div>

        {/* ── Core fields (payer, receiver, amount, arbitrator) ── */}
        <div
          className="animate-fade-up delay-1"
          style={{
            display: "flex",
            flexDirection: "column" as const,
            gap: 8,
            marginBottom: 20,
          }}
        >
          {[
            {
              key: hasV2 ? "payer" : "partyA",
              label: "Payer",
              icon: "💸",
              color: "var(--yellow)",
              hint: "Locks funds in escrow",
            },
            {
              key: hasV2 ? "receiver" : "partyB",
              label: "Receiver",
              icon: "🎯",
              color: "#22c55e",
              hint: "Gets paid on completion",
            },
            {
              key: hasV2 ? "total_usd" : "amount_usd",
              label: "Total Amount (USD)",
              icon: "💵",
              color: "var(--grey-1)",
            },
            {
              key: "arbitrator",
              label: "Arbitrator",
              icon: "⚖️",
              color: "#60a5fa",
              hint: "Resolves disputes",
            },
          ].map(({ key, label, icon, color, hint }) => {
            const val = String(terms[key] ?? "");
            const isEmpty = !val || val === "TBD" || val === "CLIENT";
            const isEd = editingField === key;
            return (
              <div
                key={key}
                onClick={() => setEditingField(key)}
                style={{
                  background: "var(--black-2)",
                  border: `1px solid ${isEd ? color : isEmpty ? "#7f1d1d50" : "var(--black-4)"}`,
                  borderRadius: "var(--radius-sm)",
                  padding: "12px 14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 15, marginTop: 1 }}>{icon}</span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color,
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.1em",
                      marginBottom: 2,
                    }}
                  >
                    {label}{" "}
                    {hint && (
                      <span
                        style={{
                          color: "var(--grey-2)",
                          textTransform: "none" as const,
                        }}
                      >
                        — {hint}
                      </span>
                    )}
                  </div>
                  {isEd ? (
                    <input
                      autoFocus
                      value={val}
                      onChange={(e) => editField(key, e.target.value)}
                      onBlur={() => setEditingField(null)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && setEditingField(null)
                      }
                      style={styles.inlineInput}
                    />
                  ) : (
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: isEmpty ? "var(--grey-2)" : "var(--white)",
                      }}
                    >
                      {isEmpty ? "Click to add..." : val}
                    </div>
                  )}
                </div>
                {!isEd && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--grey-2)",
                      marginTop: 2,
                    }}
                  >
                    ✏️
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* ── MILESTONE TABLE (V2 only) ─────────────────────── */}
        {hasV2 && v2!.milestones.length > 0 && (
          <div className="animate-fade-up delay-2" style={{ marginBottom: 20 }}>
            {/* header row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
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
                🧩 Payment Milestones
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: pctOk ? "#22c55e" : "#ef4444",
                  background: pctOk ? "#22c55e15" : "#ef444415",
                  border: `1px solid ${pctOk ? "#22c55e40" : "#ef444440"}`,
                  borderRadius: 99,
                  padding: "2px 10px",
                }}
              >
                {totalPct}% {pctOk ? "✓" : `— need ${100 - totalPct}% more`}
              </span>
            </div>

            {/* table */}
            <div
              style={{
                background: "var(--black-2)",
                border: "1px solid var(--black-4)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {/* column headers */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 1fr 70px 100px 1fr",
                  gap: 0,
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--black-4)",
                  background: "var(--black-3)",
                }}
              >
                {["#", "Title", "%", "Deadline", "Release Condition"].map(
                  (h) => (
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
                  ),
                )}
              </div>

              {v2!.milestones.map((ms, idx) => {
                const color = milestoneStatusColor(ms.percentage, idx);
                const msAmt = ((totalAmt * ms.percentage) / 100).toFixed(2);
                const isEdMs = editingMsIdx === idx;

                return (
                  <div
                    key={idx}
                    onClick={() => setEditingMsIdx(isEdMs ? null : idx)}
                    style={{
                      borderBottom:
                        idx < v2!.milestones.length - 1
                          ? "1px solid var(--black-4)"
                          : "none",
                      cursor: "pointer",
                      transition: "background 0.15s",
                      background: isEdMs ? "var(--black-3)" : "transparent",
                    }}
                  >
                    {/* collapsed row */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "28px 1fr 70px 100px 1fr",
                        gap: 0,
                        padding: "12px 14px",
                        alignItems: "center",
                      }}
                    >
                      {/* index */}
                      <span
                        style={{
                          width: 20,
                          height: 20,
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
                      </span>
                      {/* title */}
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          paddingRight: 8,
                        }}
                      >
                        {ms.title || "—"}
                      </span>
                      {/* percentage + amount */}
                      <div>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color,
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {ms.percentage}%
                        </span>
                        <div
                          style={{
                            fontSize: 9,
                            color: "var(--grey-2)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          ${msAmt}
                        </div>
                      </div>
                      {/* deadline */}
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          color: ms.deadline
                            ? "var(--grey-1)"
                            : "var(--grey-3)",
                        }}
                      >
                        {ms.deadline || "none"}
                      </span>
                      {/* condition preview */}
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--grey-1)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap" as const,
                        }}
                      >
                        {ms.condition || "—"}
                      </span>
                    </div>

                    {/* expanded inline editor */}
                    {isEdMs && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          padding: "0 14px 14px",
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 10,
                        }}
                      >
                        <div>
                          <label style={styles.msLabel}>Title</label>
                          <input
                            autoFocus
                            value={ms.title}
                            onChange={(e) =>
                              editMilestone(idx, { title: e.target.value })
                            }
                            style={styles.msInput}
                          />
                        </div>
                        <div>
                          <label style={styles.msLabel}>% of total</label>
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
                              value={ms.percentage}
                              onChange={(e) =>
                                editMilestone(idx, {
                                  percentage: Number(e.target.value),
                                })
                              }
                              style={{ flex: 1, accentColor: color }}
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
                              {ms.percentage}%
                            </span>
                          </div>
                        </div>
                        <div>
                          <label style={styles.msLabel}>
                            Deadline (ISO date)
                          </label>
                          <input
                            value={ms.deadline}
                            onChange={(e) =>
                              editMilestone(idx, { deadline: e.target.value })
                            }
                            placeholder="YYYY-MM-DD or blank"
                            style={styles.msInput}
                          />
                        </div>
                        <div>
                          <label style={styles.msLabel}>
                            Release Condition
                          </label>
                          <input
                            value={ms.condition}
                            onChange={(e) =>
                              editMilestone(idx, { condition: e.target.value })
                            }
                            style={styles.msInput}
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
                            onClick={() => setEditingMsIdx(null)}
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

            {!pctOk && (
              <p
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "#ef4444",
                  marginTop: 8,
                  textAlign: "center" as const,
                }}
              >
                Percentages must total 100% before continuing. Click a row to
                edit.
              </p>
            )}
          </div>
        )}

        {/* ── V1 single condition (rental / bet) ──────────── */}
        {!hasV2 && (
          <div className="animate-fade-up delay-2" style={{ marginBottom: 20 }}>
            {[
              { key: "deadline", label: "Deadline", icon: "📅" },
              {
                key: "condition",
                label: "Release Condition",
                icon: "⚡",
                hint: "What must happen to release funds",
              },
            ].map(({ key, label, icon, hint }) => {
              const val = String(terms[key] ?? "");
              const isEd = editingField === key;
              return (
                <div
                  key={key}
                  onClick={() => setEditingField(key)}
                  style={{
                    background: "var(--black-2)",
                    border: `1px solid ${isEd ? "var(--yellow)" : "var(--black-4)"}`,
                    borderRadius: "var(--radius-sm)",
                    padding: "12px 14px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 15, marginTop: 1 }}>{icon}</span>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        color: "var(--grey-1)",
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.1em",
                        marginBottom: 2,
                      }}
                    >
                      {label}{" "}
                      {hint && (
                        <span
                          style={{
                            color: "var(--grey-2)",
                            textTransform: "none" as const,
                          }}
                        >
                          — {hint}
                        </span>
                      )}
                    </div>
                    {isEd ? (
                      <input
                        autoFocus
                        value={val}
                        onChange={(e) => editField(key, e.target.value)}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && setEditingField(null)
                        }
                        style={styles.inlineInput}
                      />
                    ) : (
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {val || "Click to add..."}
                      </div>
                    )}
                  </div>
                  {!isEd && (
                    <span style={{ fontSize: 11, color: "var(--grey-2)" }}>
                      ✏️
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── AI Notes ────────────────────────────────────── */}
        {editedTerms.notes && (
          <div
            className="animate-fade-up delay-2"
            style={{
              background: "var(--black-3)",
              border: "1px solid var(--black-4)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 16px",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--grey-1)",
                textTransform: "uppercase" as const,
                letterSpacing: "0.1em",
                marginBottom: 4,
              }}
            >
              🤖 AI Notes
            </div>
            <p
              style={{ fontSize: 13, color: "var(--grey-1)", lineHeight: 1.6 }}
            >
              {editedTerms.notes}
            </p>
          </div>
        )}

        {/* ── Meta ────────────────────────────────────────── */}
        {parseMeta && (
          <div
            className="animate-fade-up delay-2"
            style={{
              display: "flex",
              gap: 16,
              marginBottom: 24,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--grey-2)",
            }}
          >
            <span>⚡ {parseMeta.latency_ms}ms</span>
            <span>
              {parseMeta.provider} / {parseMeta.model}
            </span>
            {hasV2 && <span>🧩 {v2!.milestones.length} milestones</span>}
          </div>
        )}

        {/* ── Actions ─────────────────────────────────────── */}
        <div
          className="animate-fade-up delay-3"
          style={{ display: "flex", gap: 12 }}
        >
          <button
            onClick={() => dispatch(setScreen("describe"))}
            style={styles.ghostBtn}
          >
            Edit Input
          </button>
          <button
            disabled={hasV2 && !pctOk}
            onClick={() => {
              dispatch(approveTerms());
              dispatch(setScreen("connect-wallet"));
            }}
            style={{
              ...styles.yellowBtn,
              flex: 2,
              opacity: hasV2 && !pctOk ? 0.5 : 1,
              cursor: hasV2 && !pctOk ? "not-allowed" : "pointer",
            }}
          >
            {hasV2 && !pctOk
              ? `Fix milestones (${totalPct}%)`
              : "Approve Terms → Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function FlowParty({
  label,
  name,
  color,
}: {
  label: string;
  name: string;
  color: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontSize: 10,
          color,
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase" as const,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontWeight: 700, color }}>{name}</div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "calc(100vh - 56px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 24px",
  } as React.CSSProperties,
  center: {
    minHeight: "calc(100vh - 56px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  } as React.CSSProperties,
  h2: {
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: "-1px",
    marginBottom: 8,
  } as React.CSSProperties,
  stepLabel: {
    fontSize: 12,
    fontFamily: "var(--font-mono)",
    color: "var(--yellow)",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
  } as React.CSSProperties,
  backBtn: {
    background: "none",
    border: "none",
    color: "var(--grey-1)",
    fontSize: 13,
    cursor: "pointer",
    marginBottom: 20,
  } as React.CSSProperties,
  yellowBtn: {
    flex: 1,
    padding: "14px",
    background: "var(--yellow)",
    color: "var(--black)",
    border: "none",
    borderRadius: "var(--radius)",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  } as React.CSSProperties,
  ghostBtn: {
    flex: 1,
    padding: "14px",
    background: "transparent",
    color: "var(--white)",
    border: "1px solid var(--black-4)",
    borderRadius: "var(--radius)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
  flowDiagram: {
    background: "var(--black-2)",
    border: "1px solid var(--black-4)",
    borderRadius: 12,
    padding: "14px 20px",
    marginBottom: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    fontSize: 13,
  } as React.CSSProperties,
  inlineInput: {
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--white)",
    fontSize: 14,
    fontWeight: 600,
    width: "100%",
    fontFamily: "var(--font-display)",
  } as React.CSSProperties,
  msLabel: {
    fontSize: 10,
    fontFamily: "var(--font-mono)",
    color: "var(--grey-1)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
    display: "block",
    marginBottom: 4,
  } as React.CSSProperties,
  msInput: {
    width: "100%",
    background: "var(--black-4)",
    border: "1px solid var(--black-5)",
    borderRadius: "var(--radius-sm)",
    color: "var(--white)",
    padding: "8px 10px",
    fontSize: 13,
    fontFamily: "var(--font-display)",
    outline: "none",
    boxSizing: "border-box",
  } as React.CSSProperties,
};
