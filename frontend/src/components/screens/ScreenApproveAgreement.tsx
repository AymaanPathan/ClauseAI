"use client";
// ============================================================
// ScreenApproveAgreement.tsx
// FIXES:
//  1. Party B now sees the Approve button + full terms review
//  2. SSE subscription syncs approval state in real-time for both parties
//  3. Party B no longer redirected to dashboard prematurely
// ============================================================

import { useState, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setScreen } from "@/store/slices/agreementSlice";
import { isV2, ParsedAgreementV2 } from "@/api/parseApi";
import { subscribeApproval } from "@/api/approvalApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface ApprovalState {
  partyAApproved: boolean;
  partyBApproved: boolean;
  partyA: string | null;
  partyB: string | null;
  termsSnapshot: Record<string, unknown> | null;
}

export default function ScreenApproveAgreement() {
  const dispatch = useAppDispatch();
  const {
    editedTerms,
    agreementId,
    walletAddress,
    isPartyB,
    counterpartyWallet,
    counterpartyConnected,
  } = useAppSelector((s) => s.agreement);

  const [approval, setApproval] = useState<ApprovalState>({
    partyAApproved: false,
    partyBApproved: false,
    partyA: null,
    partyB: null,
    termsSnapshot: null,
  });
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsExpanded, setTermsExpanded] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  const role: "partyA" | "partyB" = isPartyB ? "partyB" : "partyA";
  const myApproved = isPartyB
    ? approval.partyBApproved
    : approval.partyAApproved;
  const theirApproved = isPartyB
    ? approval.partyAApproved
    : approval.partyBApproved;
  const bothApproved = approval.partyAApproved && approval.partyBApproved;

  const terms = editedTerms as any;
  const isV2Terms = isV2(editedTerms);
  const v2 = isV2Terms ? (editedTerms as unknown as ParsedAgreementV2) : null;
  const arbitrator = terms?.arbitrator ?? "TBD";
  const payerName = terms?.payer ?? terms?.partyA ?? "Payer";
  const receiverName = terms?.receiver ?? terms?.partyB ?? "Receiver";
  const totalAmount = terms?.total_usd ?? terms?.amount_usd ?? "—";
  const otherPartyName = isPartyB ? payerName : receiverName;
  const milestones = v2?.milestones ?? [];

  // ── Initial fetch ─────────────────────────────────────────
  useEffect(() => {
    fetchApproval();
  }, [agreementId]);

  // ── SSE subscription for real-time sync ───────────────────
  useEffect(() => {
    if (!agreementId || bothApproved) return;

    unsubRef.current?.();
    const unsub = subscribeApproval(
      agreementId,
      (state) => {
        setApproval((prev) => ({
          ...prev,
          partyAApproved: state.partyAApproved ?? prev.partyAApproved,
          partyBApproved: state.partyBApproved ?? prev.partyBApproved,
          partyA: state.partyA ?? prev.partyA,
          partyB: state.partyB ?? prev.partyB,
        }));
      },
      () => {}, // swallow SSE errors
    );
    unsubRef.current = unsub;
    return () => {
      unsub();
      unsubRef.current = null;
    };
  }, [agreementId, bothApproved]);

  // ── Cleanup SSE when both approved ───────────────────────
  useEffect(() => {
    if (bothApproved) {
      unsubRef.current?.();
      unsubRef.current = null;
    }
  }, [bothApproved]);

  async function fetchApproval() {
    if (!agreementId) return;
    try {
      const res = await fetch(`${API_BASE}/api/agreement/${agreementId}`);
      const data = await res.json();
      if (data) {
        setApproval({
          partyAApproved: data.partyAApproved ?? false,
          partyBApproved: data.partyBApproved ?? false,
          partyA: data.partyA,
          partyB: data.partyB,
          termsSnapshot: data.termsSnapshot,
        });
      }
    } catch {
      /* swallow poll errors */
    }
  }

  // ── Approve ───────────────────────────────────────────────
  async function handleApprove() {
    if (!agreementId || !walletAddress) return;
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/agreement/${agreementId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, address: walletAddress }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Approval failed");
      setApproval((prev) => ({
        ...prev,
        partyAApproved: data.partyAApproved ?? prev.partyAApproved,
        partyBApproved: data.partyBApproved ?? prev.partyBApproved,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  }

  // ─────────────────────────────────────────────────────────
  return (
    <div className="page" style={{ alignItems: "flex-start", paddingTop: 64 }}>
      <style>{css}</style>
      <div style={{ maxWidth: 600, width: "100%" }}>
        {/* ── Header ───────────────────────────────────────── */}
        <div className="fade-up" style={{ marginBottom: 32 }}>
          {!isPartyB && (
            <button
              onClick={() => dispatch(setScreen("share-link"))}
              style={backBtnStyle}
            >
              ← Back
            </button>
          )}

          <div
            className="step-counter"
            style={{ display: "block", marginBottom: 12 }}
          >
            {isPartyB ? "Review & Approve" : "Step 5.5 of 6"}
          </div>

          <h2 style={titleStyle}>
            {isPartyB ? "Review & approve terms" : "Waiting for approvals"}
          </h2>
          <p style={subtitleStyle}>
            {isPartyB
              ? `${payerName} has set up this escrow. Review all terms carefully — especially the arbitrator — before approving.`
              : `Both parties must approve before you can lock funds.`}
          </p>
        </div>

        {/* ── Approval status banner ───────────────────────── */}
        <div className="fade-up d1" style={approvalBannerStyle(bothApproved)}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 22,
                animation: bothApproved
                  ? "none"
                  : "arb-pulse 1.4s ease-in-out infinite",
              }}
            >
              {bothApproved ? "✅" : "⏳"}
            </div>
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: bothApproved ? "#22c55e" : "#f2f2f0",
                }}
              >
                {bothApproved
                  ? "Both parties approved — ready to lock funds"
                  : "Waiting for both parties to approve"}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: "rgba(242,242,240,0.35)",
                  marginTop: 2,
                }}
              >
                Agreement #{agreementId}
              </div>
            </div>
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
          >
            <ApprovalPartyCard
              role="Payer"
              name={payerName}
              wallet={
                approval.partyA ??
                (isPartyB ? counterpartyWallet : walletAddress) ??
                null
              }
              approved={approval.partyAApproved}
              isMe={!isPartyB}
              color="#f5c400"
            />
            <ApprovalPartyCard
              role="Receiver"
              name={receiverName}
              wallet={
                approval.partyB ??
                (isPartyB ? walletAddress : counterpartyWallet) ??
                null
              }
              approved={approval.partyBApproved}
              isMe={isPartyB}
              color="#22c55e"
            />
          </div>
        </div>

        {/* ── Agreement terms summary ──────────────────────── */}
        <div className="fade-up d2" style={termsSectionStyle}>
          <button
            onClick={() => setTermsExpanded(!termsExpanded)}
            style={termsToggleStyle}
          >
            <span className="label">Agreement Terms</span>
            <span
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                color: "rgba(242,242,240,0.3)",
              }}
            >
              {termsExpanded ? "hide ↑" : "expand ↓"}
            </span>
          </button>

          <div>
            {[
              { label: "💸 Payer", value: payerName },
              { label: "🎯 Receiver", value: receiverName },
              { label: "💰 Total Amount", value: `$${totalAmount} USD` },
            ].map((r) => (
              <TermsRow key={r.label} label={r.label} value={r.value} />
            ))}

            {/* Arbitrator — highlighted */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                padding: "11px 16px",
                borderBottom: "1px solid rgba(242,242,240,0.05)",
                background: "rgba(245,196,0,0.04)",
                gap: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "#f2f2f0",
                    marginBottom: 2,
                  }}
                >
                  ⚖️ Arbitrator
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "monospace",
                    color: "rgba(242,242,240,0.3)",
                  }}
                >
                  Can resolve disputes on-chain
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: "monospace",
                    fontWeight: 600,
                    color: arbitrator === "TBD" ? "#f59e0b" : "#f5c400",
                  }}
                >
                  {arbitrator === "TBD"
                    ? "⚠️ TBD"
                    : `${arbitrator.slice(0, 10)}…${arbitrator.slice(-6)}`}
                </div>
                {arbitrator === "TBD" && (
                  <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 2 }}>
                    No arbitrator set
                  </div>
                )}
              </div>
            </div>

            {/* Expanded milestones */}
            {termsExpanded && milestones.length > 0 && (
              <div style={{ animation: "arb-slide-down 0.25s ease both" }}>
                <div
                  style={{
                    padding: "8px 16px",
                    background: "rgba(242,242,240,0.02)",
                    borderBottom: "1px solid rgba(242,242,240,0.05)",
                    fontSize: 10,
                    fontFamily: "monospace",
                    color: "rgba(242,242,240,0.3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  {milestones.length} Payment Milestone
                  {milestones.length > 1 ? "s" : ""}
                </div>
                {milestones.map((ms, i) => {
                  const hue = `hsl(${(i * 47 + 140) % 360}, 65%, 58%)`;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 16px",
                        borderBottom:
                          i < milestones.length - 1
                            ? "1px solid rgba(242,242,240,0.04)"
                            : "none",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
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
                        <div>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 500,
                              color: "#f2f2f0",
                            }}
                          >
                            {ms.title}
                          </div>
                          {ms.condition && (
                            <div
                              style={{
                                fontSize: 10,
                                color: "rgba(242,242,240,0.3)",
                                marginTop: 1,
                              }}
                            >
                              {ms.condition}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: hue,
                            fontFamily: "monospace",
                          }}
                        >
                          {ms.percentage}%
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "rgba(242,242,240,0.3)",
                            fontFamily: "monospace",
                          }}
                        >
                          $
                          {(
                            (parseFloat(String(totalAmount)) * ms.percentage) /
                            100
                          ).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {termsExpanded && terms?.condition && (
              <div
                style={{
                  padding: "10px 16px",
                  animation: "arb-slide-down 0.25s ease both",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "monospace",
                    color: "rgba(242,242,240,0.3)",
                    marginBottom: 5,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Release Condition
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "rgba(242,242,240,0.55)",
                    lineHeight: 1.65,
                    margin: 0,
                  }}
                >
                  {terms.condition}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Arbitrator warning ───────────────────────────── */}
        {arbitrator === "TBD" && (
          <div
            className="fade-in"
            style={{
              background: "rgba(245,158,11,0.07)",
              border: "1px solid rgba(245,158,11,0.2)",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 16,
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <span style={{ color: "#f59e0b", flexShrink: 0 }}>⚠️</span>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#f59e0b",
                  marginBottom: 3,
                }}
              >
                No arbitrator set
              </div>
              <p
                style={{
                  fontSize: 11,
                  color: "rgba(245,158,11,0.75)",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                Disputes cannot be resolved on-chain without an arbitrator. You
                can still approve and proceed.
                {!isPartyB && (
                  <>
                    {" "}
                    <button
                      onClick={() =>
                        dispatch(setScreen("set-arbitrator" as never))
                      }
                      style={{
                        background: "none",
                        border: "none",
                        color: "#f5c400",
                        cursor: "pointer",
                        fontSize: 11,
                        textDecoration: "underline",
                        padding: 0,
                      }}
                    >
                      Set one now →
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────── */}
        {error && (
          <div className="error-box fade-in" style={{ marginBottom: 16 }}>
            ⚠ {error}
          </div>
        )}

        {/* ── CTAs ─────────────────────────────────────────── */}
        <div
          className="fade-up d3"
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          {/* ── PARTY B: Approve button (always show if not yet approved) ── */}
          {isPartyB && !myApproved && (
            <button
              className="btn btn-primary btn-lg"
              onClick={handleApprove}
              disabled={approving}
              style={{ width: "100%" }}
            >
              {approving ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  Approving…
                </>
              ) : (
                <>
                  ✓ Approve Agreement
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
                </>
              )}
            </button>
          )}

          {/* ── PARTY A: Approve button (always show if not yet approved) ── */}
          {!isPartyB && !myApproved && (
            <button
              className="btn btn-primary btn-lg"
              onClick={handleApprove}
              disabled={approving}
              style={{ width: "100%" }}
            >
              {approving ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  Approving…
                </>
              ) : (
                <>
                  ✓ Approve Agreement
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
                </>
              )}
            </button>
          )}

          {/* ── Approved — waiting for other party ── */}
          {myApproved && !bothApproved && (
            <div style={waitingBoxStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <PulseDot color="#f5c400" />
                <span
                  style={{ fontSize: 13, fontWeight: 600, color: "#f5c400" }}
                >
                  You approved — waiting for {otherPartyName}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(242,242,240,0.3)",
                  marginTop: 6,
                  fontFamily: "monospace",
                }}
              >
                This page updates automatically when they approve.
              </div>
            </div>
          )}

          {/* ── PARTY A: Both approved → lock funds ── */}
          {bothApproved && !isPartyB && (
            <button
              className="btn btn-primary btn-lg fade-in"
              onClick={() => dispatch(setScreen("lock-funds"))}
              style={{
                width: "100%",
                background: "#22c55e",
                borderColor: "#22c55e",
                color: "#0a0a0a",
              }}
            >
              Both Approved — Lock Funds
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
          )}

          {/* ── PARTY B: Both approved → go to dashboard ── */}
          {bothApproved && isPartyB && (
            <div>
              <div
                className="fade-in"
                style={{
                  background: "rgba(34,197,94,0.08)",
                  border: "1px solid rgba(34,197,94,0.2)",
                  borderRadius: 10,
                  padding: "14px 18px",
                  textAlign: "center",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#22c55e",
                    marginBottom: 4,
                  }}
                >
                  ✅ Agreement fully approved
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(242,242,240,0.45)",
                    lineHeight: 1.6,
                  }}
                >
                  {payerName} will now lock funds on-chain.
                </div>
              </div>
              <button
                className="btn btn-primary btn-lg fade-in"
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
          )}

          {/* ── PARTY A: back to arbitrator ── */}
          {!isPartyB && !myApproved && (
            <button
              className="btn btn-ghost"
              onClick={() => dispatch(setScreen("set-arbitrator" as never))}
              style={{ width: "100%" }}
            >
              ← Change Arbitrator
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function ApprovalPartyCard({
  role,
  name,
  wallet,
  approved,
  isMe,
  color,
}: {
  role: string;
  name: string;
  wallet: string | null;
  approved: boolean;
  isMe: boolean;
  color: string;
}) {
  return (
    <div
      style={{
        background: approved ? `${color}08` : "rgba(242,242,240,0.03)",
        border: `1px solid ${approved ? `${color}30` : "rgba(242,242,240,0.08)"}`,
        borderRadius: 10,
        padding: "12px 14px",
        transition: "all 0.3s",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontFamily: "monospace",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color,
          }}
        >
          {role}
          {isMe && (
            <span
              style={{
                marginLeft: 5,
                background: `${color}20`,
                color,
                borderRadius: 4,
                padding: "1px 5px",
                fontSize: 8,
              }}
            >
              YOU
            </span>
          )}
        </span>
        <span
          style={{
            fontSize: 14,
            transition: "transform 0.3s",
            transform: approved ? "scale(1)" : "scale(0.85)",
          }}
        >
          {approved ? "✅" : "⏳"}
        </span>
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#f2f2f0",
          marginBottom: 3,
        }}
      >
        {name}
      </div>
      {wallet && (
        <div
          style={{
            fontSize: 9,
            fontFamily: "monospace",
            color: "rgba(242,242,240,0.25)",
          }}
        >
          {wallet.slice(0, 8)}…{wallet.slice(-6)}
        </div>
      )}
      <div
        style={{
          marginTop: 6,
          fontSize: 10,
          fontFamily: "monospace",
          color: approved ? color : "rgba(242,242,240,0.3)",
          fontWeight: approved ? 700 : 400,
        }}
      >
        {approved ? "Approved ✓" : "Pending…"}
      </div>
    </div>
  );
}

function TermsRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        padding: "11px 16px",
        borderBottom: "1px solid rgba(242,242,240,0.05)",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 500, color: "#f2f2f0" }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "rgba(242,242,240,0.7)",
          textAlign: "right",
          lineHeight: 1.4,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function PulseDot({ color = "#f5c400" }: { color?: string }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        animation: "arb-pulse 1.4s ease-in-out infinite",
        flexShrink: 0,
      }}
    />
  );
}

// ── Styles ────────────────────────────────────────────────────

const backBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "rgba(242,242,240,0.35)",
  fontSize: 11,
  cursor: "pointer",
  marginBottom: 20,
  fontFamily: "monospace",
  letterSpacing: "0.04em",
  padding: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: "clamp(24px, 3.5vw, 36px)",
  fontWeight: 700,
  letterSpacing: "-0.04em",
  lineHeight: 1.1,
  marginBottom: 10,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: "rgba(242,242,240,0.5)",
  lineHeight: 1.7,
};

function approvalBannerStyle(bothApproved: boolean): React.CSSProperties {
  return {
    background: bothApproved
      ? "rgba(34,197,94,0.06)"
      : "rgba(242,242,240,0.03)",
    border: `1px solid ${bothApproved ? "rgba(34,197,94,0.2)" : "rgba(242,242,240,0.08)"}`,
    borderRadius: 14,
    padding: "18px 20px",
    marginBottom: 16,
    transition: "all 0.4s",
  };
}

const termsSectionStyle: React.CSSProperties = {
  background: "#0f0f0f",
  border: "1px solid rgba(242,242,240,0.07)",
  borderRadius: 12,
  overflow: "hidden",
  marginBottom: 16,
};

const termsToggleStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 16px",
  width: "100%",
  background: "none",
  border: "none",
  borderBottom: "1px solid rgba(242,242,240,0.05)" as any,
  cursor: "pointer",
  textAlign: "left",
};

const waitingBoxStyle: React.CSSProperties = {
  background: "rgba(245,196,0,0.05)",
  border: "1px solid rgba(245,196,0,0.15)",
  borderRadius: 10,
  padding: "14px 18px",
};

const css = `
@keyframes arb-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
@keyframes arb-slide-down {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;
