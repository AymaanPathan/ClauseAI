"use client";
// ============================================================
// components/partyA/ScreenLanding.tsx — ClauseAI 2026
// Unamarshal-style visuals + original wallet/agreement logic
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/store";
import {
  setScreen,
  resetAll,
  connectWalletThunk,
} from "@/store/slices/partyASlice";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL;

// ── Types ─────────────────────────────────────────────────────
interface Milestone {
  index: number;
  title: string;
  percentage: number;
  condition: string;
  amountUsd: string;
  amountSats: number;
  status:
    | "locked"
    | "pending"
    | "complete"
    | "disputed"
    | "refunded"
    | "failed";
  txId?: string;
  completedAt?: string;
}
interface Agreement {
  agreementId: string;
  partyA: string | null;
  partyB: string | null;
  partyBWallet: string | null;
  arbitrator: string | null;
  totalAmountUsd: number;
  totalAmountSats: number;
  fundState: "idle" | "locked" | "released" | "refunded" | "disputed";
  fundsLocked: boolean;
  amountLocked: string | null;
  milestones: Milestone[];
  terms: Record<string, unknown>;
  createdAt: string;
  depositTxId?: string | null;
  onChainCreateTxId?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────
function formatSats(sats: number): string {
  if (!sats || sats === 0) return "—";
  return `${(sats / 100_000_000).toFixed(6)} sBTC`;
}
function fundStateColor(s: string) {
  if (s === "locked") return "var(--amber)";
  if (s === "released") return "var(--green)";
  if (s === "disputed") return "#ef4444";
  if (s === "refunded") return "#94a3b8";
  return "var(--text-4)";
}
function fundStateLabel(s: string) {
  if (s === "locked") return "Funds Locked";
  if (s === "released") return "Complete";
  if (s === "disputed") return "In Dispute";
  if (s === "refunded") return "Refunded";
  return "Pending";
}
function msStatusColor(s: string) {
  if (s === "complete") return "var(--green)";
  if (s === "disputed") return "var(--amber)";
  if (s === "refunded" || s === "failed") return "#ef4444";
  if (s === "pending") return "var(--text-3)";
  return "var(--text-4)";
}
function msStatusLabel(s: string) {
  if (s === "complete") return "Released ✓";
  if (s === "disputed") return "Disputed ⚑";
  if (s === "refunded") return "Refunded ↩";
  if (s === "failed") return "Failed ✕";
  if (s === "pending") return "Confirming…";
  return "Locked";
}
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Floating Particle ─────────────────────────────────────────
function Particle({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: 3,
        height: 3,
        borderRadius: "50%",
        background: "var(--accent)",
        opacity: 0.5,
        animation: "lp-float 3s ease-in-out infinite",
        animationDelay: `${delay}s`,
        pointerEvents: "none",
      }}
    />
  );
}

// ── Hero Visual (right panel) ─────────────────────────────────
function HeroVisual() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage:
            "repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(196,255,70,0.04) 39px,rgba(196,255,70,0.04) 40px),repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(196,255,70,0.04) 39px,rgba(196,255,70,0.04) 40px)",
        }}
      />
      {(
        [
          { t: "8%", l: "8%", s: 44, d: "0s" },
          { t: "12%", r: "10%", s: 38, d: "0.5s" },
          { t: "40%", l: "4%", s: 40, d: "1s" },
          { t: "68%", l: "10%", s: 36, d: "1.4s" },
          { t: "72%", r: "8%", s: 42, d: "0.7s" },
          { t: "22%", r: "4%", s: 34, d: "0.3s" },
          { t: "52%", r: "16%", s: 40, d: "0.9s" },
        ] as any[]
      ).map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: b.t,
            left: b.l ?? "auto",
            right: b.r ?? "auto",
            width: b.s,
            height: b.s,
            borderRadius: 10,
            background: "rgba(22,24,27,0.85)",
            border: "1px solid rgba(196,255,70,0.08)",
            boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
            animation: "lp-block 4s ease-in-out infinite",
            animationDelay: b.d,
          }}
        />
      ))}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
          animation: "lp-block 3s ease-in-out infinite",
        }}
      >
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: 18,
            background: "var(--accent)",
            boxShadow:
              "0 0 55px rgba(196,255,70,0.55), 0 0 110px rgba(196,255,70,0.2)",
            animation: "lp-glow 2.4s ease-in-out infinite",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0b0c0d"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
        <div
          style={{
            background: "rgba(17,18,20,0.96)",
            border: "1px solid rgba(196,255,70,0.18)",
            borderRadius: 14,
            padding: "14px 22px",
            backdropFilter: "blur(20px)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
            minWidth: 220,
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontFamily: "var(--mono)",
              color: "var(--text-4)",
              letterSpacing: "0.14em",
              marginBottom: 5,
            }}
          >
            sBTC ESCROW
          </div>
          <div
            style={{
              fontSize: 19,
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              color: "var(--text-1)",
              letterSpacing: "-0.03em",
            }}
          >
            0.004821{" "}
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--mono)",
                fontWeight: 400,
                color: "var(--text-3)",
                letterSpacing: "0.06em",
              }}
            >
              sBTC
            </span>
          </div>
          <div
            style={{ height: 1, background: "var(--border)", margin: "10px 0" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {[
              ["Payer", "SP2X…A4"],
              ["Receiver", "SP3F…B9"],
            ].map(([label, addr]) => (
              <div key={label}>
                <div
                  style={{
                    fontSize: 9,
                    fontFamily: "var(--mono)",
                    color: "var(--text-4)",
                    marginBottom: 2,
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    color: "var(--text-2)",
                  }}
                >
                  {addr}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: "48%",
          left: "50%",
          transform: "translate(-50%, 0)",
          width: 220,
          height: 160,
          background:
            "radial-gradient(ellipse at top, rgba(196,255,70,0.22) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      {[
        { x: 44, y: 28, d: 0 },
        { x: 56, y: 63, d: 0.5 },
        { x: 34, y: 54, d: 1 },
        { x: 64, y: 44, d: 1.5 },
        { x: 50, y: 18, d: 0.8 },
        { x: 41, y: 72, d: 0.3 },
      ].map((p, i) => (
        <Particle key={i} x={p.x} y={p.y} delay={p.d} />
      ))}
    </div>
  );
}

// ── Agreement Card ─────────────────────────────────────────────
function AgreementCard({
  agreement,
  walletAddress,
}: {
  agreement: Agreement;
  walletAddress: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isPartyA =
    agreement.partyA?.toLowerCase() === walletAddress.toLowerCase();

  const isPartyB =
    agreement.partyBWallet?.toLowerCase() === walletAddress.toLowerCase();

  const completedMs = agreement.milestones.filter((m) =>
    ["complete", "refunded"].includes(m.status),
  ).length;
  const progressPct =
    agreement.milestones.length > 0
      ? Math.round((completedMs / agreement.milestones.length) * 100)
      : 0;
  const receiverName = (agreement.terms?.receiver ??
    agreement.terms?.partyB ??
    agreement.partyB ??
    "Receiver") as string;
  const payerName = (agreement.terms?.payer ??
    agreement.terms?.partyA ??
    agreement.partyA ??
    "Payer") as string;

  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
        transition: "border-color 0.2s",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = "var(--border-hi)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = "var(--border)")
      }
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          cursor: "pointer",
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontFamily: "var(--mono)",
            color: "var(--text-4)",
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            borderRadius: 5,
            padding: "3px 8px",
            flexShrink: 0,
          }}
        >
          #{agreement.agreementId}
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}
            >
              {isPartyA ? `→ ${receiverName}` : `← ${payerName}`}
            </span>
            <span
              style={{
                fontSize: 9,
                fontFamily: "var(--mono)",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                border: "1px solid",
                borderRadius: 10,
                padding: "2px 8px",
                color: fundStateColor(agreement.fundState),
                borderColor: fundStateColor(agreement.fundState) + "40",
                background: fundStateColor(agreement.fundState) + "10",
              }}
            >
              {fundStateLabel(agreement.fundState)}
            </span>
            <span
              style={{
                fontSize: 9,
                fontFamily: "var(--mono)",
                color: "var(--text-4)",
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "2px 7px",
              }}
            >
              {isPartyA ? "You are Payer" : "You are Receiver"}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: "var(--text-3)",
                fontFamily: "var(--mono)",
              }}
            >
              ${agreement.totalAmountUsd} USD
            </span>
            <span
              style={{
                fontSize: 12,
                color: "var(--text-4)",
                fontFamily: "var(--mono)",
              }}
            >
              {formatSats(agreement.totalAmountSats)}
            </span>
            {agreement.createdAt && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-4)",
                  fontFamily: "var(--mono)",
                }}
              >
                {timeAgo(agreement.createdAt)}
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--mono)",
                color: "var(--text-4)",
                marginBottom: 4,
              }}
            >
              {completedMs}/{agreement.milestones.length} done
            </div>
            <div
              style={{
                height: 3,
                width: 80,
                background: "var(--bg-3)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progressPct}%`,
                  background: "var(--accent)",
                  borderRadius: 2,
                  minWidth: 3,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-4)"
            strokeWidth="2"
            strokeLinecap="round"
            style={{
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 0.2s",
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "14px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {(agreement.onChainCreateTxId || agreement.depositTxId) && (
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: "var(--text-4)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 8,
                }}
              >
                Transactions
              </div>
              {agreement.onChainCreateTxId && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "5px 0",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--mono)",
                      color: "var(--text-4)",
                    }}
                  >
                    Contract Deploy
                  </span>
                  <a
                    href={`https://explorer.hiro.so/txid/${agreement.onChainCreateTxId}?chain=testnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--mono)",
                      color: "var(--text-3)",
                      textDecoration: "none",
                    }}
                  >
                    {agreement.onChainCreateTxId.slice(0, 16)}… ↗
                  </a>
                </div>
              )}
              {agreement.depositTxId && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "5px 0",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--mono)",
                      color: "var(--text-4)",
                    }}
                  >
                    sBTC Deposit
                  </span>
                  <a
                    href={`https://explorer.hiro.so/txid/${agreement.depositTxId}?chain=testnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--mono)",
                      color: "var(--text-3)",
                      textDecoration: "none",
                    }}
                  >
                    {agreement.depositTxId.slice(0, 16)}… ↗
                  </a>
                </div>
              )}
            </div>
          )}

          {agreement.milestones.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: "var(--text-4)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 8,
                }}
              >
                Milestones
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {agreement.milestones.map((ms) => (
                  <div
                    key={ms.index}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "8px 10px",
                      background: "var(--bg-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: msStatusColor(ms.status) + "30",
                        border: `1px solid ${msStatusColor(ms.status)}50`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 8,
                          color: msStatusColor(ms.status),
                          fontFamily: "var(--mono)",
                          fontWeight: 700,
                        }}
                      >
                        {ms.index + 1}
                      </span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--text-1)",
                        }}
                      >
                        {ms.title}
                      </div>
                      {ms.condition && (
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--text-4)",
                            fontFamily: "var(--mono)",
                            marginTop: 1,
                          }}
                        >
                          {ms.condition.length > 60
                            ? ms.condition.slice(0, 60) + "…"
                            : ms.condition}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "var(--mono)",
                          color: "var(--text-3)",
                        }}
                      >
                        ${ms.amountUsd} · {ms.percentage}%
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: "var(--mono)",
                          fontWeight: 600,
                          color: msStatusColor(ms.status),
                          background: msStatusColor(ms.status) + "15",
                          border: `1px solid ${msStatusColor(ms.status)}30`,
                          borderRadius: 4,
                          padding: "2px 8px",
                        }}
                      >
                        {msStatusLabel(ms.status)}
                      </span>
                      {ms.txId && (
                        <a
                          href={`https://explorer.hiro.so/txid/${ms.txId}?chain=testnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 10,
                            fontFamily: "var(--mono)",
                            color: "var(--text-3)",
                            textDecoration: "none",
                          }}
                        >
                          tx ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {agreement.fundState === "locked" && (isPartyA || isPartyB) && (
            <div style={{ marginTop: 4 }}>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: "7px 16px" }}
                onClick={() => {
                  if (typeof window !== "undefined") {
                    if (isPartyA) {
                      localStorage.setItem(
                        "pA_agreementId",
                        agreement.agreementId,
                      );
                      localStorage.setItem("pA_screen", "dashboard");
                      if (agreement.terms)
                        localStorage.setItem(
                          "pA_terms",
                          JSON.stringify(agreement.terms),
                        );
                      window.location.reload();
                    } else {
                      // Party B → their /agreement/:id page handles the dashboard
                      window.location.href = `/agreement/${agreement.agreementId}`;
                    }
                  }
                }}
              >
                Open Dashboard →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Join Modal ────────────────────────────────────────────────
function JoinModal({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleJoin() {
    if (!input.trim()) {
      setError("Enter a link or agreement ID");
      return;
    }
    const trimmed = input.trim();
    let id = trimmed;
    const match = trimmed.match(/\/agreement\/([A-Z0-9]+)/i);
    if (match) id = match[1].toUpperCase();
    else id = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!id || id.length < 4) {
      setError("Invalid agreement ID or link");
      return;
    }
    window.location.href = `/agreement/${id}`;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--border-hi)",
          borderRadius: 14,
          padding: 28,
          width: "100%",
          maxWidth: 440,
          animation: "lp-fadeup 0.25s ease both",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: 6,
            fontFamily: "var(--font-display)",
          }}
        >
          Join Agreement
        </h3>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-3)",
            lineHeight: 1.6,
            marginBottom: 20,
          }}
        >
          Paste the full agreement link or just the ID (e.g.{" "}
          <code
            style={{
              fontFamily: "var(--mono)",
              background: "var(--bg-3)",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            7C64F0
          </code>
          )
        </p>
        <input
          className="input"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="https://…/agreement/7C64F0  or  7C64F0"
          autoFocus
          style={{
            fontFamily: "var(--mono)",
            fontSize: 12,
            marginBottom: error ? 8 : 16,
          }}
        />
        {error && (
          <div
            style={{
              fontSize: 11,
              color: "#ef4444",
              fontFamily: "var(--mono)",
              marginBottom: 12,
            }}
          >
            ⚠ {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={handleJoin}
            style={{ flex: 1 }}
          >
            Join as Receiver →
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function ScreenLanding() {
  const dispatch = useDispatch<AppDispatch>();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loadingAgreements, setLoadingAgreements] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("pA_walletAddress");
    if (saved) setWalletAddress(saved);
  }, []);

  const fetchAgreements = useCallback(async (address: string) => {
    setLoadingAgreements(true);
    const seen = new Set<string>();
    const results: Agreement[] = [];

    try {
      const res = await fetch(
        `${API_BASE}/agreement?partyA=${encodeURIComponent(address)}`,
      );
      if (res.ok) {
        const data = await res.json();
        const list: Agreement[] = Array.isArray(data)
          ? data
          : (data.agreements ?? []);
        for (const a of list) {
          if (!seen.has(a.agreementId)) {
            seen.add(a.agreementId);
            results.push(a);
          }
        }
      }
    } catch (err) {
      console.error("[fetchAgreements] partyA fetch failed:", err);
    }

    try {
      const res = await fetch(
        `${API_BASE}/agreement?partyB=${encodeURIComponent(address)}`,
      );
      if (res.ok) {
        const data = await res.json();
        const list: Agreement[] = Array.isArray(data)
          ? data
          : (data.agreements ?? []);
        for (const a of list) {
          if (!seen.has(a.agreementId)) {
            seen.add(a.agreementId);
            results.push(a);
          }
        }
      }
    } catch (err) {
      console.error("[fetchAgreements] partyB fetch failed:", err);
    }

    try {
      const pBIds: string[] = JSON.parse(
        localStorage.getItem("pB_agreements") ?? "[]",
      );
      for (const id of pBIds) {
        if (seen.has(id)) continue;
        try {
          const r = await fetch(`${API_BASE}/agreement/${id}/milestones`);
          if (r.ok) {
            const d = await r.json();
            if (d?.agreementId) {
              seen.add(d.agreementId);
              results.push(d);
            }
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }

    const storedId = localStorage.getItem("pA_agreementId");
    if (storedId && !seen.has(storedId)) {
      try {
        const r = await fetch(
          `${API_BASE}/agreement/${storedId}/milestones`,
        );
        if (r.ok) {
          const d = await r.json();
          if (d?.agreementId) {
            const storedTerms = localStorage.getItem("pA_terms");
            results.push({
              ...d,
              terms: storedTerms ? JSON.parse(storedTerms) : {},
            });
          }
        }
      } catch {
        /* ignore */
      }
    }

    setAgreements(results);
    setLoadingAgreements(false);
  }, []);

  useEffect(() => {
    if (walletAddress) fetchAgreements(walletAddress);
  }, [walletAddress, fetchAgreements]);

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const result = await dispatch(connectWalletThunk());
      if (connectWalletThunk.fulfilled.match(result)) {
        const addr = result.payload as string;
        setWalletAddress(addr);
        localStorage.setItem("pA_walletAddress", addr);
      } else {
        setConnectError((result.payload as string) ?? "Failed to connect");
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  function handleNewAgreement() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("pA_") && k !== "pA_walletAddress")
      .forEach((k) => localStorage.removeItem(k));
    dispatch(resetAll());
    if (walletAddress) localStorage.setItem("pA_walletAddress", walletAddress);
    dispatch(setScreen("select-type"));
  }

  const completedAgreements = agreements.filter(
    (a) => a.fundState === "released",
  );
  const activeAgreements = agreements.filter((a) => a.fundState === "locked");
  const pendingAgreements = agreements.filter(
    (a) => !["released", "locked"].includes(a.fundState),
  );

  // ── NOT CONNECTED — Hero ──────────────────────────────────
  if (!walletAddress) {
    return (
      <div
        style={{
          background: "var(--bg)",
          minHeight: "100vh",
          overflowX: "hidden",
        }}
      >
        <style>{css}</style>

        {/* Topbar */}
        <nav
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            height: 60,
            background: "rgba(11,12,13,0.92)",
            backdropFilter: "blur(20px)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 48px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 15,
                color: "#0b0c0d",
              }}
            >
              ◈
            </div>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 16,
                fontWeight: 800,
                color: "var(--text-1)",
                letterSpacing: "-0.03em",
              }}
            >
              ClauseAI
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 13, padding: "7px 18px" }}
              onClick={() => setShowJoin(true)}
            >
              Join Agreement
            </button>

            <button
              style={{
                fontSize: 13,
                padding: "7px 18px",
                background: "rgba(196,255,70,0.10)",
                border: "1px solid rgba(196,255,70,0.40)",
                borderRadius: 8,
                cursor: "pointer",
                color: "#c4ff46",
                fontFamily: "var(--mono)",
                fontWeight: 600,
                letterSpacing: "0.02em",
              }}
              onClick={() => {
                window.location.href = "/arbitrate";
              }}
            >
              Arbitrator Login
            </button>
            {/* ── END ADD ── */}
            <button
              className="btn btn-primary"
              style={{ fontSize: 13, padding: "7px 18px" }}
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? "Connecting…" : "Connect Wallet →"}
            </button>
          </div>
        </nav>

        {/* Hero — split */}
        <section
          style={{
            minHeight: "100vh",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Left */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "120px 0 80px 72px",
              position: "relative",
              zIndex: 2,
            }}
          >
            <div className="lp-fade-up" style={{ marginBottom: 28 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  background: "rgba(196,255,70,0.07)",
                  border: "1px solid rgba(196,255,70,0.2)",
                  borderRadius: 20,
                  padding: "5px 14px",
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: "var(--accent)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    animation: "pulseDot 2s ease infinite",
                  }}
                />
                Bitcoin-Enforced Escrow
              </span>
            </div>

            <h1
              className="lp-fade-up lp-d1"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(36px, 4.5vw, 60px)",
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.04em",
                color: "var(--text-1)",
                marginBottom: 20,
              }}
            >
              Smart Contracts.
              <br />
              On Bitcoin.
              <br />
              <span style={{ color: "var(--accent)" }}>AI-Powered.</span>
            </h1>

            <p
              className="lp-fade-up lp-d2"
              style={{
                fontSize: 15,
                color: "var(--text-3)",
                lineHeight: 1.75,
                maxWidth: 380,
                marginBottom: 36,
              }}
            >
              ClauseAI creates Bitcoin-enforced milestone escrows. Connect your
              Leather wallet to create or manage sBTC agreements in under 60
              seconds.
            </p>

            {connectError && (
              <div
                className="error-box lp-fade-up"
                style={{ marginBottom: 16, maxWidth: 380 }}
              >
                ⚠ {connectError}
              </div>
            )}

            <div
              className="lp-fade-up lp-d3"
              style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
            >
              <button
                className="btn btn-primary btn-lg"
                onClick={handleConnect}
                disabled={connecting}
                style={{ minWidth: 220 }}
              >
                {connecting ? (
                  <>
                    <span
                      className="spinner"
                      style={{ width: 14, height: 14 }}
                    />{" "}
                    Connecting to Leather…
                  </>
                ) : (
                  "Connect Leather Wallet"
                )}
              </button>
              <button
                className="btn btn-ghost btn-lg"
                onClick={() => setShowJoin(true)}
              >
                Join as Receiver →
              </button>
            </div>

            <div
              style={{
                marginTop: 16,
                fontSize: 11,
                fontFamily: "var(--mono)",
                color: "var(--text-4)",
              }}
            >
              Don't have Leather?{" "}
              <a
                href="https://wallet.hiro.so"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--text-2)", textDecoration: "none" }}
              >
                Install it free →
              </a>
            </div>
          </div>

          {/* Bg glow */}
          <div
            style={{
              position: "absolute",
              top: "20%",
              left: "42%",
              width: 500,
              height: 400,
              borderRadius: "50%",
              background:
                "radial-gradient(ellipse, rgba(196,255,70,0.055) 0%, transparent 65%)",
              pointerEvents: "none",
            }}
          />
        </section>

        {/* Stats strip */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            borderTop: "1px solid var(--border)",
            position: "relative",
          }}
        >
          {[
            { label: "BITCOIN SECURED", value: "sBTC", sub: "Stacks Layer" },
            {
              label: "AGREEMENT TYPES",
              value: "5+",
              sub: "Freelance, Real Estate…",
            },
            {
              label: "SETTLEMENT TIME",
              value: "< 30s",
              sub: "On-chain finality",
            },
          ].map(({ label, value, sub }, i) => (
            <div
              key={i}
              style={{
                padding: "36px 48px",
                borderRight: i < 2 ? "1px solid var(--border)" : "none",
                background: "var(--bg-1)",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--bg-2)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "var(--bg-1)")
              }
            >
              <div
                style={{
                  fontSize: 9,
                  fontFamily: "var(--mono)",
                  color: "var(--text-4)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 36,
                  fontWeight: 800,
                  letterSpacing: "-0.04em",
                  color: "var(--accent)",
                  lineHeight: 1,
                  marginBottom: 6,
                }}
              >
                {value}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  color: "var(--text-4)",
                }}
              >
                {sub}
              </div>
            </div>
          ))}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              backgroundImage:
                "repeating-linear-gradient(90deg,transparent,transparent 79px,rgba(196,255,70,0.015) 79px,rgba(196,255,70,0.015) 80px),repeating-linear-gradient(0deg,transparent,transparent 79px,rgba(196,255,70,0.015) 79px,rgba(196,255,70,0.015) 80px)",
            }}
          />
        </section>

        {/* Marquee */}
        <div className="marquee-wrap">
          <div className="marquee-track">
            {Array(2)
              .fill([
                "FREELANCE",
                "REAL ESTATE",
                "MILESTONE ESCROW",
                "AI PARSING",
                "sBTC",
                "LEATHER WALLET",
                "STACKS BLOCKCHAIN",
                "DISPUTE ARBITRATION",
                "TRUSTLESS",
                "BITCOIN",
              ])
              .flat()
              .map((item, i) => (
                <div key={i} className="marquee-item">
                  {item}
                </div>
              ))}
          </div>
        </div>

        {showJoin && <JoinModal onClose={() => setShowJoin(false)} />}
      </div>
    );
  }

  // ── CONNECTED — Dashboard ─────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <style>{css}</style>

      {/* Topbar */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          height: 56,
          background: "rgba(11,12,13,0.92)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 14,
              color: "#0b0c0d",
            }}
          >
            ◈
          </div>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 15,
              fontWeight: 800,
              color: "var(--text-1)",
              letterSpacing: "-0.03em",
            }}
          >
            ClauseAI
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            style={{
              fontSize: 11,
              padding: "5px 12px",
              background: "rgba(196,255,70,0.10)",
              border: "1px solid rgba(196,255,70,0.40)",
              borderRadius: 8,
              cursor: "pointer",
              color: "#c4ff46",
              fontFamily: "var(--mono)",
              fontWeight: 600,
            }}
            onClick={() => {
              window.location.href = "/arbitrate";
            }}
          >
            Arbitrate
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              padding: "5px 12px",
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--accent)",
                animation: "pulseDot 2s ease infinite",
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                color: "var(--text-2)",
              }}
            >
              {walletAddress.slice(0, 10)}…{walletAddress.slice(-6)}
            </span>
          </div>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: "5px 12px" }}
            onClick={() => {
              localStorage.removeItem("pA_walletAddress");
              setWalletAddress(null);
            }}
          >
            Disconnect
          </button>
        </div>
      </nav>

      {/* Main content */}
      <div
        style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px 80px" }}
      >
        {/* Header */}
        <div className="lp-fade-up" style={{ marginBottom: 40 }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: "var(--accent)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Your Dashboard
              </div>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(28px, 4vw, 44px)",
                  fontWeight: 800,
                  letterSpacing: "-0.04em",
                  lineHeight: 1.05,
                  marginBottom: 6,
                }}
              >
                Agreements
              </h1>
              <p style={{ fontSize: 13, color: "var(--text-3)" }}>
                {agreements.length} total · {activeAgreements.length} active ·{" "}
                {completedAgreements.length} complete
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-ghost"
                onClick={() => setShowJoin(true)}
                style={{ fontSize: 12, gap: 6 }}
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
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                Join Agreement
              </button>
              <button
                className="btn btn-primary"
                onClick={handleNewAgreement}
                style={{ fontSize: 12, gap: 6 }}
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
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New Agreement
              </button>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        {agreements.length > 0 && (
          <div
            className="lp-fade-up lp-d1"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              background: "var(--border)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              overflow: "hidden",
              gap: "1px",
              marginBottom: 32,
            }}
          >
            {[
              {
                label: "Total Value",
                value: `$${agreements.reduce((s, a) => s + (a.totalAmountUsd || 0), 0).toFixed(0)}`,
                sub: "across all escrows",
              },
              {
                label: "Active",
                value: String(activeAgreements.length),
                sub: "funds locked",
              },
              {
                label: "Complete",
                value: String(completedAgreements.length),
                sub: "fully released",
              },
              {
                label: "Milestones",
                value: String(
                  agreements.reduce(
                    (s, a) =>
                      s +
                      a.milestones.filter((m) => m.status === "complete")
                        .length,
                    0,
                  ),
                ),
                sub: "released on-chain",
              },
            ].map(({ label, value, sub }) => (
              <div
                key={label}
                style={{
                  background: "var(--bg-1)",
                  padding: "18px 16px",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--bg-2)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "var(--bg-1)")
                }
              >
                <div
                  style={{
                    fontSize: 9,
                    fontFamily: "var(--mono)",
                    color: "var(--text-4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 7,
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 22,
                    fontWeight: 800,
                    color: "var(--text-1)",
                    letterSpacing: "-0.04em",
                    marginBottom: 4,
                  }}
                >
                  {value}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--mono)",
                    color: "var(--text-4)",
                  }}
                >
                  {sub}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* List */}
        {loadingAgreements ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 0",
              color: "var(--text-3)",
            }}
          >
            <span
              className="spinner"
              style={{
                width: 20,
                height: 20,
                margin: "0 auto 14px",
                display: "block",
              }}
            />
            <span style={{ fontSize: 13, fontFamily: "var(--mono)" }}>
              Loading your agreements…
            </span>
          </div>
        ) : agreements.length === 0 ? (
          <div
            className="lp-fade-up lp-d2"
            style={{
              textAlign: "center",
              padding: "64px 24px",
              background: "var(--bg-1)",
              border: "1px dashed var(--border)",
              borderRadius: 14,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-4)"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-1)",
                marginBottom: 8,
                fontFamily: "var(--font-display)",
              }}
            >
              No agreements yet
            </h3>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-3)",
                lineHeight: 1.6,
                maxWidth: 360,
                margin: "0 auto 20px",
              }}
            >
              Create your first Bitcoin-enforced escrow agreement. Takes under
              60 seconds.
            </p>
            <button className="btn btn-primary" onClick={handleNewAgreement}>
              Create Your First Agreement →
            </button>
          </div>
        ) : (
          <div
            className="lp-fade-up lp-d2"
            style={{ display: "flex", flexDirection: "column", gap: 0 }}
          >
            {activeAgreements.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--mono)",
                    color: "var(--text-4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 10,
                  }}
                >
                  Active · {activeAgreements.length}
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {activeAgreements.map((a) => (
                    <AgreementCard
                      key={a.agreementId}
                      agreement={a}
                      walletAddress={walletAddress}
                    />
                  ))}
                </div>
              </div>
            )}
            {pendingAgreements.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--mono)",
                    color: "var(--text-4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 10,
                  }}
                >
                  Pending · {pendingAgreements.length}
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {pendingAgreements.map((a) => (
                    <AgreementCard
                      key={a.agreementId}
                      agreement={a}
                      walletAddress={walletAddress}
                    />
                  ))}
                </div>
              </div>
            )}
            {completedAgreements.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--mono)",
                    color: "var(--text-4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 10,
                  }}
                >
                  Complete · {completedAgreements.length}
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {completedAgreements.map((a) => (
                    <AgreementCard
                      key={a.agreementId}
                      agreement={a}
                      walletAddress={walletAddress}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showJoin && <JoinModal onClose={() => setShowJoin(false)} />}
    </div>
  );
}

// ── Scoped CSS ────────────────────────────────────────────────
const css = `
@keyframes lp-block {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
}
@keyframes lp-float {
  0%, 100% { opacity: 0.3; transform: translateY(0px) scale(1); }
  50% { opacity: 0.8; transform: translateY(-8px) scale(1.4); }
}
@keyframes lp-glow {
  0%, 100% { box-shadow: 0 0 55px rgba(196,255,70,0.55), 0 0 110px rgba(196,255,70,0.2); }
  50% { box-shadow: 0 0 80px rgba(196,255,70,0.75), 0 0 160px rgba(196,255,70,0.35); }
}
@keyframes lp-fadeup {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
.lp-fade-up { animation: lp-fadeup 0.45s cubic-bezier(0.16,1,0.3,1) both; }
.lp-d1 { animation-delay: 0.07s; }
.lp-d2 { animation-delay: 0.14s; }
.lp-d3 { animation-delay: 0.21s; }
`;
