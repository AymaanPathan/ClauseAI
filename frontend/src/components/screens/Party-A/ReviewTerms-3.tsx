"use client";
import { useState } from "react";
import {
  setScreen,
  updateEditedTerms,
  applyApprovalUpdate,
} from "@/store/slices/partyASlice";
import { isV2, ParsedAgreementV2 } from "@/api/parseApi";
import type { Milestone } from "@/api/parseApi";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/store";

function confColor(c?: string) {
  if (c === "high")
    return {
      color: "var(--green)",
      bg: "var(--green-dim)",
      border: "rgba(74,222,128,0.25)",
    };
  if (c === "medium")
    return {
      color: "var(--amber)",
      bg: "var(--amber-dim)",
      border: "rgba(251,191,36,0.25)",
    };
  return {
    color: "var(--red)",
    bg: "var(--red-dim)",
    border: "rgba(248,113,113,0.25)",
  };
}

const FLOW_STEPS = [
  "Select type",
  "Describe deal",
  "Review terms",
  "Set arbitrator",
  "Share link",
  "Lock funds",
];

export default function ReviewTerms() {
  const dispatch = useDispatch<AppDispatch>();
  const { editedTerms, parseError } = useSelector((s: RootState) => s.partyA);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingMsIdx, setEditingMsIdx] = useState<number | null>(null);

  /* ── Error state ── */
  if (parseError) {
    return (
      <div
        className="rv-root"
        style={{
          alignItems: "center",
          justifyContent: "center",
          display: "flex",
        }}
      >
        <style>{css}</style>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "var(--red-dim)",
              border: "1px solid rgba(248,113,113,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--red)"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h3
            style={{
              fontSize: 22,
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              marginBottom: 10,
            }}
          >
            Parse Failed
          </h3>
          <p
            style={{
              color: "var(--text-3)",
              marginBottom: 28,
              fontSize: 13,
              lineHeight: 1.65,
            }}
          >
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
  const conf = confColor(confidence);

  const totalPct = v2?.milestones.reduce((s, m) => s + m.percentage, 0) ?? 0;
  const pctOk = totalPct === 100;

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

  const CORE_FIELDS = [
    {
      key: hasV2 ? "payer" : "partyA",
      label: "Payer",
      hint: "Locks funds",
      dot: "var(--amber)",
    },
    {
      key: hasV2 ? "receiver" : "partyB",
      label: "Receiver",
      hint: "Gets paid",
      dot: "var(--green)",
    },
    {
      key: hasV2 ? "total_usd" : "amount_usd",
      label: "Amount (USD)",
      hint: "Total escrow",
      dot: "var(--accent)",
    },
    {
      key: "deadline",
      label: "Deadline",
      hint: "Completion date",
      dot: "var(--blue)",
    },
  ];

  const milestones = hasV2 ? v2!.milestones : [];
  const MS_COLORS = [
    "#c4ff46",
    "#60a5fa",
    "#4ade80",
    "#fbbf24",
    "#f472b6",
    "#a78bfa",
  ];

  return (
    <div className="rv-root">
      <style>{css}</style>

      {/* ══════════ TOPBAR ══════════ */}
      <header className="rv-topbar">
        <div className="rv-brand">
          <div className="rv-brand-mark">◈</div>
          <span className="rv-brand-name">ClauseAI</span>
        </div>

        <div className="rv-steps">
          {FLOW_STEPS.map((s, i) => {
            const done = i < 2;
            const active = i === 2;
            return (
              <div
                key={i}
                className={`rv-step${done ? " rv-step--done" : active ? " rv-step--active" : ""}`}
              >
                <div className="rv-step-dot">
                  {done ? (
                    <svg
                      width="7"
                      height="7"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className="rv-step-label">{s}</span>
                {i < FLOW_STEPS.length - 1 && <div className="rv-step-line" />}
              </div>
            );
          })}
        </div>

        {/* Confidence badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            fontSize: 10,
            fontFamily: "var(--mono)",
            letterSpacing: "0.06em",
            color: conf.color,
            background: conf.bg,
            border: `1px solid ${conf.border}`,
            borderRadius: 20,
            padding: "3px 11px",
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: conf.color,
              display: "inline-block",
            }}
          />
          {confidence} confidence
        </div>
      </header>

      {/* ══════════ TWO-PANEL BODY ══════════ */}
      <main className="rv-main">
        {/* ── LEFT: heading + flow viz + core fields ── */}
        <section className="rv-left">
          <button
            className="rv-back"
            onClick={() => dispatch(setScreen("describe"))}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back
          </button>

          {/* Heading */}
          <div className="fade-up">
            <div className="rv-eyebrow">Step 3 of 6</div>
            <h1 className="rv-title">
              Review your
              <br />
              <em>terms</em>
            </h1>
            <p className="rv-subtitle">
              AI parsed your agreement. Click any field to edit before
              approving.
            </p>
          </div>

          {/* Escrow flow visualization */}
          <div className="rv-flow fade-up" style={{ animationDelay: "0.06s" }}>
            {/* Payer node */}
            <div className="rv-flow-node">
              <div
                className="rv-flow-avatar"
                style={{
                  background: "rgba(251,191,36,0.12)",
                  border: "1px solid rgba(251,191,36,0.28)",
                  color: "var(--amber)",
                }}
              >
                {payer.slice(0, 2).toUpperCase()}
              </div>
              <div className="rv-flow-node-label">{payer}</div>
              <div className="rv-flow-node-sub">Payer</div>
            </div>

            {/* Arrow + LOCKS */}
            <div className="rv-flow-conn">
              <div className="rv-flow-conn-line rv-flow-conn-line--amber" />
              <div className="rv-flow-conn-tag">LOCKS</div>
            </div>

            {/* Escrow node */}
            <div className="rv-flow-node rv-flow-node--center">
              <div className="rv-flow-avatar rv-flow-avatar--accent">◈</div>
              <div className="rv-flow-node-label rv-flow-node-label--accent">
                ${amount}
              </div>
              <div className="rv-flow-node-sub">
                {milestones.length > 1
                  ? `${milestones.length} milestones`
                  : "Escrow"}
              </div>
            </div>

            {/* Arrow + RELEASES */}
            <div className="rv-flow-conn">
              <div className="rv-flow-conn-line rv-flow-conn-line--green" />
              <div className="rv-flow-conn-tag">RELEASES</div>
            </div>

            {/* Receiver node */}
            <div className="rv-flow-node">
              <div
                className="rv-flow-avatar"
                style={{
                  background: "rgba(74,222,128,0.12)",
                  border: "1px solid rgba(74,222,128,0.28)",
                  color: "var(--green)",
                }}
              >
                {receiver.slice(0, 2).toUpperCase()}
              </div>
              <div className="rv-flow-node-label">{receiver}</div>
              <div className="rv-flow-node-sub">Receiver</div>
            </div>
          </div>

          {/* Core fields */}
          <div className="rv-fields fade-up" style={{ animationDelay: "0.1s" }}>
            {CORE_FIELDS.map(({ key, label, hint, dot }) => {
              const val = String(terms[key] ?? "—");
              const isEditing = editingField === key;
              return (
                <div
                  key={key}
                  className={`rv-field${isEditing ? " rv-field--editing" : ""}`}
                  onClick={() => !isEditing && setEditingField(key)}
                >
                  <div className="rv-field-left">
                    <div className="rv-field-dot" style={{ background: dot }} />
                    <div>
                      <div className="rv-field-label">{label}</div>
                      <div className="rv-field-hint">{hint}</div>
                    </div>
                  </div>
                  <div className="rv-field-right">
                    {isEditing ? (
                      <input
                        autoFocus
                        className="rv-inline-input"
                        value={val === "—" ? "" : val}
                        onChange={(e) => editField(key, e.target.value)}
                        onBlur={() => setEditingField(null)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={`Edit ${label.toLowerCase()}…`}
                      />
                    ) : (
                      <>
                        <span
                          className={`rv-field-val${val === "—" ? " rv-field-val--empty" : ""}`}
                        >
                          {val}
                        </span>
                        <div className="rv-edit-icon">
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── RIGHT: milestones + condition + CTA ── */}
        <section className="rv-right">
          {/* Milestones */}
          {milestones.length > 0 && (
            <div
              className="rv-ms-section fade-up"
              style={{ animationDelay: "0.08s" }}
            >
              <div className="rv-section-head">
                <div className="rv-section-title">
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-4)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 8 12 12 14 14" />
                  </svg>
                  Payment milestones
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 9,
                    fontFamily: "var(--mono)",
                    color: pctOk ? "var(--green)" : "var(--amber)",
                    background: pctOk ? "var(--green-dim)" : "var(--amber-dim)",
                    border: `1px solid ${pctOk ? "rgba(74,222,128,0.25)" : "rgba(251,191,36,0.25)"}`,
                    borderRadius: 20,
                    padding: "2px 8px",
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: pctOk ? "var(--green)" : "var(--amber)",
                      display: "inline-block",
                    }}
                  />
                  {totalPct}% {!pctOk && "— needs 100%"}
                </div>
              </div>

              {/* Stacked bar visualization */}
              <div className="rv-ms-bar-wrap">
                <div className="rv-ms-bar">
                  {milestones.map((ms, i) => (
                    <div
                      key={i}
                      className="rv-ms-bar-seg"
                      style={{
                        width: `${ms.percentage}%`,
                        background: MS_COLORS[i % MS_COLORS.length],
                      }}
                      title={`${ms.title}: ${ms.percentage}%`}
                    />
                  ))}
                </div>
                <div className="rv-ms-bar-labels">
                  {milestones.map((ms, i) => (
                    <div
                      key={i}
                      style={{
                        width: `${ms.percentage}%`,
                        minWidth: 0,
                        display: "flex",
                        justifyContent: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 9,
                          fontFamily: "var(--mono)",
                          color: MS_COLORS[i % MS_COLORS.length],
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: "90%",
                        }}
                      >
                        {ms.percentage}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Milestone rows */}
              <div className="rv-ms-list">
                {milestones.map((ms, i) => {
                  const isEditing = editingMsIdx === i;
                  const msAmt = (
                    (parseFloat(String(amount)) * ms.percentage) /
                    100
                  ).toFixed(0);
                  return (
                    <div
                      key={i}
                      className={`rv-ms-row${isEditing ? " rv-ms-row--editing" : ""}`}
                      onClick={() => !isEditing && setEditingMsIdx(i)}
                    >
                      <div className="rv-ms-row-left">
                        <div
                          className="rv-ms-idx"
                          style={{
                            background: MS_COLORS[i % MS_COLORS.length] + "18",
                            border: `1px solid ${MS_COLORS[i % MS_COLORS.length]}30`,
                            color: MS_COLORS[i % MS_COLORS.length],
                          }}
                        >
                          {i + 1}
                        </div>
                        {isEditing ? (
                          <input
                            autoFocus
                            className="rv-inline-input rv-inline-input--sm"
                            value={ms.title}
                            onChange={(e) =>
                              editMilestone(i, { title: e.target.value })
                            }
                            onBlur={() => setEditingMsIdx(null)}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Milestone title…"
                          />
                        ) : (
                          <span className="rv-ms-title">{ms.title}</span>
                        )}
                      </div>
                      <div className="rv-ms-row-right">
                        <span className="rv-ms-amt">${msAmt}</span>
                        <span
                          className="rv-ms-pct"
                          style={{
                            color: MS_COLORS[i % MS_COLORS.length],
                            background: MS_COLORS[i % MS_COLORS.length] + "12",
                            borderColor: MS_COLORS[i % MS_COLORS.length] + "28",
                          }}
                        >
                          {ms.percentage}%
                        </span>
                        {!isEditing && (
                          <div className="rv-edit-icon rv-edit-icon--sm">
                            <svg
                              width="8"
                              height="8"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            >
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Release condition */}
          {terms["condition"] && (
            <div
              className="rv-condition fade-up"
              style={{ animationDelay: "0.12s" }}
            >
              <div className="rv-section-head" style={{ marginBottom: 10 }}>
                <div className="rv-section-title">
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-4)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <polyline points="22 11.08 22 12 12 22 2 12 2.5 6.5" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                  Release condition
                </div>
              </div>
              <p className="rv-condition-text">{String(terms["condition"])}</p>
            </div>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Arbitrator notice */}
          <div
            className="rv-arb-notice fade-up"
            style={{ animationDelay: "0.14s" }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                flexShrink: 0,
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-3)"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p
              style={{
                fontSize: 11,
                fontFamily: "var(--mono)",
                color: "var(--text-3)",
                margin: 0,
                lineHeight: 1.55,
              }}
            >
              You'll choose an{" "}
              <strong style={{ color: "var(--text-2)", fontWeight: 600 }}>
                arbitrator
              </strong>{" "}
              on the next step. Both parties must approve before funds are
              locked.
            </p>
          </div>

          {/* CTAs */}
          <div className="rv-cta fade-up" style={{ animationDelay: "0.18s" }}>
            {hasV2 && !pctOk && (
              <div
                style={{
                  padding: "9px 14px",
                  borderRadius: 8,
                  marginBottom: 10,
                  background: "var(--amber-dim)",
                  border: "1px solid rgba(251,191,36,0.25)",
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  color: "var(--amber)",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Milestone percentages must total 100% — currently {totalPct}%
              </div>
            )}

            <button
              className={`rv-approve-btn${!(hasV2 && !pctOk) ? " rv-approve-btn--active" : ""}`}
              onClick={() => {
                dispatch(
                  applyApprovalUpdate({
                    partyAApproved: true,
                    partyBApproved: false,
                  }),
                );
                dispatch(setScreen("set-arbitrator"));
              }}
              disabled={hasV2 && !pctOk}
            >
              <span className="rv-btn-shimmer" />
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Approve Terms & Continue
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>

            <button
              className="rv-ghost-btn"
              onClick={() => dispatch(setScreen("describe"))}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Edit description
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════
   CSS — viewport-locked, zero scroll
═══════════════════════════════════════════ */
const css = `
.rv-root {
  display: flex; flex-direction: column;
  height: 100vh; overflow: hidden;
  background: var(--bg); color: var(--text-1);
}

/* ── Topbar ── */
.rv-topbar {
  height: 52px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 28px; gap: 24px;
  background: rgba(11,12,13,0.96); backdrop-filter: blur(24px);
  border-bottom: 1px solid var(--border); z-index: 100;
}
.rv-brand { display: flex; align-items: center; gap: 9px; flex-shrink: 0; }
.rv-brand-mark {
  width: 28px; height: 28px; border-radius: 7px; background: var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display); font-size: 14px; font-weight: 800; color: #0b0c0d;
}
.rv-brand-name { font-family: var(--font-display); font-size: 15px; font-weight: 800; color: var(--text-1); letter-spacing: -0.03em; }

.rv-steps { display: flex; align-items: center; flex: 1; justify-content: center; }
.rv-step  { display: flex; align-items: center; gap: 6px; opacity: 0.25; }
.rv-step--done   { opacity: 0.5; }
.rv-step--active { opacity: 1; }
.rv-step-dot {
  width: 18px; height: 18px; border-radius: 50%;
  border: 1px solid var(--border); background: transparent;
  display: flex; align-items: center; justify-content: center;
  font-size: 8px; font-family: var(--mono); font-weight: 700; color: var(--text-4); flex-shrink: 0;
}
.rv-step--done .rv-step-dot, .rv-step--active .rv-step-dot { background: var(--accent); border-color: var(--accent); color: #0b0c0d; }
.rv-step--active .rv-step-dot { box-shadow: 0 0 10px rgba(196,255,70,0.4); }
.rv-step-label { font-size: 10px; font-family: var(--mono); color: var(--text-4); white-space: nowrap; }
.rv-step--active .rv-step-label { color: var(--text-1); font-weight: 600; }
.rv-step--done  .rv-step-label  { color: var(--text-3); }
.rv-step-line   { width: 20px; height: 1px; background: var(--border); margin: 0 2px; flex-shrink: 0; }

/* ── Two-panel main ── */
.rv-main {
  flex: 1; min-height: 0;
  display: grid; grid-template-columns: 1fr 1fr;
}

/* ── Left panel ── */
.rv-left {
  padding: 30px 44px 30px 48px;
  display: flex; flex-direction: column; gap: 20px;
  border-right: 1px solid var(--border);
  overflow: hidden;
}
.rv-back {
  display: inline-flex; align-items: center; gap: 6px;
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: 11px; font-family: var(--mono); color: var(--text-4);
  letter-spacing: 0.04em; transition: color 0.15s; align-self: flex-start;
}
.rv-back:hover { color: var(--text-2); }

.rv-eyebrow { font-size: 9px; font-family: var(--mono); color: var(--accent); text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 8px; }
.rv-title {
  font-family: var(--font-display);
  font-size: clamp(26px, 2.8vw, 40px);
  font-weight: 800; letter-spacing: -0.05em; line-height: 1.0;
  color: var(--text-1); margin-bottom: 8px;
}
.rv-title em { font-style: normal; color: var(--accent); }
.rv-subtitle { font-size: 13px; color: var(--text-3); line-height: 1.65; max-width: 320px; }

/* Flow visualization */
.rv-flow {
  display: flex; align-items: center;
  padding: 16px 20px;
  background: var(--bg-1); border: 1px solid var(--border); border-radius: 14px;
  gap: 0;
}
.rv-flow-node { display: flex; flex-direction: column; align-items: center; gap: 5px; flex-shrink: 0; }
.rv-flow-node--center { flex: 1; }
.rv-flow-avatar {
  width: 38px; height: 38px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-family: var(--mono); font-weight: 800; letter-spacing: 0.02em;
}
.rv-flow-avatar--accent { background: var(--accent-dim); border: 1px solid rgba(196,255,70,0.3); color: var(--accent); font-size: 18px; font-family: var(--font-display); }
.rv-flow-node-label { font-size: 12px; font-weight: 700; color: var(--text-1); letter-spacing: -0.02em; text-align: center; }
.rv-flow-node-label--accent { color: var(--accent); font-size: 14px; }
.rv-flow-node-sub { font-size: 9px; font-family: var(--mono); color: var(--text-4); text-align: center; }

.rv-flow-conn { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 0 8px; }
.rv-flow-conn-line { height: 1px; width: 100%; background: linear-gradient(90deg, var(--border), var(--border)); position: relative; }
.rv-flow-conn-line::after { content: '▶'; position: absolute; right: -4px; top: -5px; font-size: 8px; color: var(--border-hi); }
.rv-flow-conn-line--amber::after { color: rgba(251,191,36,0.5); }
.rv-flow-conn-line--green::after { color: rgba(74,222,128,0.5); }
.rv-flow-conn-tag { font-size: 8px; font-family: var(--mono); color: var(--text-4); letter-spacing: 0.1em; }

/* Core fields */
.rv-fields {
  display: flex; flex-direction: column; gap: 1px;
  background: var(--border); border: 1px solid var(--border);
  border-radius: 12px; overflow: hidden; flex: 1; min-height: 0;
  overflow-y: auto;
}
.rv-field {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 18px; background: var(--bg-1);
  cursor: pointer; transition: background 0.15s; gap: 12px;
}
.rv-field:hover { background: var(--bg-2); }
.rv-field--editing { background: var(--bg-3); }
.rv-field-left { display: flex; align-items: center; gap: 10px; }
.rv-field-dot  { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.rv-field-label { font-size: 13px; font-weight: 600; color: var(--text-1); letter-spacing: -0.01em; }
.rv-field-hint  { font-size: 10px; font-family: var(--mono); color: var(--text-4); margin-top: 1px; }
.rv-field-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.rv-field-val   { font-size: 13px; font-weight: 500; color: var(--text-1); font-family: var(--mono); letter-spacing: -0.01em; }
.rv-field-val--empty { color: var(--text-4); }

.rv-inline-input {
  background: var(--bg-4); border: 1px solid var(--border-focus);
  border-radius: 6px; padding: 5px 10px; outline: none;
  font-family: var(--mono); font-size: 12px; color: var(--text-1);
  width: 160px; box-shadow: 0 0 0 2px var(--accent-dim);
}
.rv-inline-input--sm { width: 130px; }

.rv-edit-icon {
  width: 22px; height: 22px; border-radius: 5px;
  background: var(--bg-3); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-4); flex-shrink: 0;
  transition: all 0.15s;
}
.rv-field:hover .rv-edit-icon { background: var(--bg-4); border-color: var(--border-hi); color: var(--text-2); }
.rv-edit-icon--sm { width: 18px; height: 18px; border-radius: 4px; }

/* ── Right panel ── */
.rv-right {
  padding: 30px 48px 30px 44px;
  display: flex; flex-direction: column; gap: 16px;
  overflow: hidden;
}

/* Section head */
.rv-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.rv-section-title { display: flex; align-items: center; gap: 6px; font-size: 10px; font-family: var(--mono); color: var(--text-4); text-transform: uppercase; letter-spacing: 0.1em; }

/* Milestones section */
.rv-ms-section { display: flex; flex-direction: column; }

/* Stacked bar */
.rv-ms-bar-wrap { margin-bottom: 10px; }
.rv-ms-bar {
  display: flex; height: 6px; border-radius: 4px;
  overflow: hidden; background: var(--bg-3); margin-bottom: 5px;
}
.rv-ms-bar-seg { height: 100%; transition: width 0.4s ease; }
.rv-ms-bar-labels { display: flex; }

/* Milestone rows */
.rv-ms-list {
  display: flex; flex-direction: column; gap: 1px;
  background: var(--border); border: 1px solid var(--border);
  border-radius: 10px; overflow: hidden; overflow-y: auto; max-height: 200px;
}
.rv-ms-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; background: var(--bg-1);
  cursor: pointer; transition: background 0.15s; gap: 12px;
}
.rv-ms-row:hover { background: var(--bg-2); }
.rv-ms-row--editing { background: var(--bg-3); }
.rv-ms-row-left  { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.rv-ms-row-right { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
.rv-ms-idx {
  width: 20px; height: 20px; border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-family: var(--mono); font-weight: 700; flex-shrink: 0;
}
.rv-ms-title { font-size: 12px; font-weight: 500; color: var(--text-1); letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rv-ms-amt   { font-size: 12px; font-family: var(--mono); color: var(--text-3); }
.rv-ms-pct   { font-size: 9px; font-family: var(--mono); font-weight: 700; border: 1px solid; border-radius: 4px; padding: 1px 7px; }

/* Condition */
.rv-condition {
  padding: 13px 16px;
  background: var(--bg-1); border: 1px solid var(--border); border-radius: 10px;
}
.rv-condition-text { font-size: 12px; color: var(--text-2); line-height: 1.7; margin: 0; }

/* Arbitrator notice */
.rv-arb-notice {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 12px 15px;
  background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px;
}

/* CTAs */
.rv-cta { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }

.rv-approve-btn {
  position: relative; overflow: hidden;
  width: 100%; height: 50px;
  background: var(--bg-3); border: 1px solid var(--border);
  border-radius: 12px; cursor: not-allowed;
  display: flex; align-items: center; justify-content: center; gap: 9px;
  font-family: var(--font-display); font-size: 15px; font-weight: 800;
  color: var(--text-4); letter-spacing: -0.02em;
  transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
}
.rv-approve-btn--active {
  background: var(--accent); border-color: var(--accent);
  color: #0b0c0d; cursor: pointer;
  box-shadow: 0 4px 24px rgba(196,255,70,0.22);
}
.rv-approve-btn--active:hover {
  background: #d4ff60; border-color: #d4ff60;
  box-shadow: 0 8px 40px rgba(196,255,70,0.35);
  transform: translateY(-1px);
}
.rv-approve-btn--active:active { transform: translateY(0); }
.rv-btn-shimmer {
  position: absolute; top: 0; left: -100%; width: 55%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
  transition: left 0.55s ease; pointer-events: none;
}
.rv-approve-btn--active:hover .rv-btn-shimmer { left: 160%; }

.rv-ghost-btn {
  width: 100%; height: 40px;
  background: transparent; border: 1px solid var(--border);
  border-radius: 10px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 7px;
  font-family: var(--font); font-size: 13px; font-weight: 500;
  color: var(--text-3); letter-spacing: -0.01em;
  transition: all 0.15s;
}
.rv-ghost-btn:hover { background: var(--bg-2); border-color: var(--border-hi); color: var(--text-1); }

/* ── Responsive ── */
@media (max-width: 820px) {
  .rv-root { height: auto; overflow: auto; }
  .rv-main { grid-template-columns: 1fr; }
  .rv-left  { border-right: none; border-bottom: 1px solid var(--border); padding: 28px 24px; gap: 16px; }
  .rv-right { padding: 28px 24px; }
  .rv-steps { display: none; }
  .rv-ms-list { max-height: none; overflow: visible; }
}
`;
