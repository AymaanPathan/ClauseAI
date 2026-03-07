"use client";
import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setScreen,
  updateEditedTerms,
  approveTerms,
} from "../../store/slices/agreementSlice";
import { isV2, ParsedAgreementV2 } from "@/api/parseApi";
import type { Milestone } from "@/api/parseApi";

function confDot(c?: string) {
  if (c === "high") return "var(--green)";
  if (c === "medium") return "var(--amber)";
  return "var(--red)";
}

export default function ScreenParsedTerms() {
  const dispatch = useAppDispatch();
  const { editedTerms, parseError, agreementType } = useAppSelector(
    (s) => s.agreement,
  );
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingMsIdx, setEditingMsIdx] = useState<number | null>(null);

  if (parseError) {
    return (
      <div className="page">
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "var(--red-dim)",
              border: "1px solid rgba(239,68,68,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--red)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Parse Failed
          </h3>
          <p style={{ color: "var(--text-2)", marginBottom: 24, fontSize: 13 }}>
            {parseError}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => dispatch(setScreen("describe"))}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!editedTerms) return null;

  const terms = editedTerms as any;
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
  const cc = confDot(confidence);

  function editField(key: string, val: string) {
    dispatch(updateEditedTerms({ [key]: val } as never));
  }
  function editMilestone(idx: number, patch: Partial<Milestone>) {
    if (!v2) return;
    const updated = v2.milestones.map((m, i) =>
      i === idx ? { ...m, ...patch } : m,
    );
    dispatch(updateEditedTerms({ milestones: updated } as never));
  }
  const totalPct = v2?.milestones.reduce((s, m) => s + m.percentage, 0) ?? 0;
  const pctOk = totalPct === 100;

  const CORE_FIELDS = [
    { key: hasV2 ? "payer" : "partyA", label: "Payer", hint: "Locks funds" },
    {
      key: hasV2 ? "receiver" : "partyB",
      label: "Receiver",
      hint: "Gets paid",
    },
    {
      key: hasV2 ? "total_usd" : "amount_usd",
      label: "Amount (USD)",
      hint: "Total escrow",
    },
    { key: "deadline", label: "Deadline", hint: "Completion date" },
    { key: "arbitrator", label: "Arbitrator", hint: "Dispute resolver" },
  ];

  return (
    <div className="page" style={{ alignItems: "flex-start", paddingTop: 64 }}>
      <div style={{ maxWidth: 640, width: "100%" }}>
        {/* Header */}
        <div className="fade-up" style={{ marginBottom: 32 }}>
          <button
            onClick={() => dispatch(setScreen("describe"))}
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
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div className="step-counter">Step 3 of 6</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: cc,
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: cc,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.08em",
                }}
              >
                {confidence} confidence
              </span>
            </div>
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
            Review your terms
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
            AI parsed your agreement. Click any field to edit before approving.
          </p>
        </div>

        {/* Flow diagram */}
        <div
          className="fade-up d1"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div className="label" style={{ marginBottom: 5 }}>
              Payer
            </div>
            <div
              style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}
            >
              {payer}
            </div>
          </div>
          <div style={{ color: "var(--text-4)", fontSize: 18 }}>→</div>
          <div style={{ textAlign: "center" }}>
            <div className="label" style={{ marginBottom: 5 }}>
              Escrow
            </div>
            <div
              style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}
            >
              ${amount}
            </div>
            {hasV2 && v2!.milestones.length > 1 && (
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: "var(--text-4)",
                  marginTop: 2,
                }}
              >
                {v2!.milestones.length} milestones
              </div>
            )}
          </div>
          <div style={{ color: "var(--text-4)", fontSize: 18 }}>→</div>
          <div style={{ textAlign: "center" }}>
            <div className="label" style={{ marginBottom: 5 }}>
              Receiver
            </div>
            <div
              style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}
            >
              {receiver}
            </div>
          </div>
        </div>

        <div className="fade-up d2" style={{ marginBottom: 16 }}>
          <div className="table">
            {CORE_FIELDS.map(({ key, label, hint }, i) => {
              const val = String(
                (terms as Record<string, unknown>)[key] ?? "—",
              );
              const isEditing = editingField === key;
              return (
                <div
                  key={i}
                  className="table-row"
                  onClick={() => setEditingField(isEditing ? null : key)}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--text-1)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--mono)",
                        color: "var(--text-4)",
                        marginTop: 2,
                      }}
                    >
                      {hint}
                    </div>
                  </div>
                  {isEditing ? (
                    <input
                      autoFocus
                      className="input"
                      value={val}
                      onChange={(e) => editField(key, e.target.value)}
                      onBlur={() => setEditingField(null)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        maxWidth: 220,
                        padding: "6px 10px",
                        fontSize: 13,
                      }}
                    />
                  ) : (
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color:
                            val === "—" ? "var(--text-4)" : "var(--text-1)",
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {val}
                      </span>
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--text-4)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Milestones */}
        {hasV2 && v2!.milestones.length > 0 && (
          <div className="fade-up d3" style={{ marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <div className="label">Payment milestones</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  className="dot"
                  style={{
                    background: pctOk ? "var(--green)" : "var(--amber)",
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--mono)",
                    color: pctOk ? "var(--green)" : "var(--amber)",
                  }}
                >
                  {totalPct}% {!pctOk && `(needs 100%)`}
                </span>
              </div>
            </div>
            <div className="table">
              {v2!.milestones.map((ms, i) => {
                const hue = `hsl(${(i * 47 + 140) % 360}, 65%, 58%)`;
                const isEditing = editingMsIdx === i;
                return (
                  <div
                    key={i}
                    className="table-row"
                    onClick={() => setEditingMsIdx(isEditing ? null : i)}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: hue,
                          flexShrink: 0,
                          display: "inline-block",
                        }}
                      />
                      {isEditing ? (
                        <input
                          autoFocus
                          className="input"
                          value={ms.title}
                          onChange={(e) =>
                            editMilestone(i, { title: e.target.value })
                          }
                          onBlur={() => setEditingMsIdx(null)}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            padding: "5px 10px",
                            fontSize: 12,
                            maxWidth: 180,
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 500,
                            color: "var(--text-1)",
                          }}
                        >
                          {ms.title}
                        </span>
                      )}
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 12 }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "var(--mono)",
                          color: "var(--text-3)",
                        }}
                      >
                        $
                        {(
                          (parseFloat(String(amount)) * ms.percentage) /
                          100
                        ).toFixed(0)}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: "var(--mono)",
                          background: "var(--bg-3)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--r-xs)",
                          padding: "2px 7px",
                          color: "var(--text-3)",
                        }}
                      >
                        {ms.percentage}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Condition */}
        {terms["condition"] && (
          <div
            className="fade-up d3"
            style={{
              background: "var(--bg-1)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              padding: "14px 16px",
              marginBottom: 20,
            }}
          >
            <div className="label" style={{ marginBottom: 6 }}>
              Release condition
            </div>
            <p
              style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.65 }}
            >
              {String(terms["condition"])}
            </p>
          </div>
        )}

        {/* CTA */}
        <div
          className="fade-up d4"
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <button
            className="btn btn-primary btn-lg"
            onClick={() => {
              dispatch(approveTerms());
              dispatch(setScreen("connect-wallet"));
            }}
            style={{ width: "100%" }}
            disabled={hasV2 && !pctOk}
          >
            Approve & Continue
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

          <button
            className="btn btn-ghost"
            onClick={() => dispatch(setScreen("describe"))}
            style={{ width: "100%" }}
          >
            Edit description
          </button>
        </div>
      </div>
    </div>
  );
}
