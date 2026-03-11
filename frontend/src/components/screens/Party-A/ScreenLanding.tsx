"use client";
// ============================================================
// components/partyA/ScreenLanding.tsx — User Dashboard Landing
//
// Flow:
//   1. User connects wallet
//   2. Fetched past agreements from DB (partyA = walletAddress)
//   3. Dashboard shows agreements, each with milestones + txs
//   4. "Create New Agreement" → clears localStorage → select-type
//   5. "Join Agreement" → paste link or ID → navigates to /agreement/:id
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/store";
import {
  setScreen,
  resetAll,
  connectWalletThunk,
} from "@/store/slices/partyASlice";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────
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

// ── Helpers ──────────────────────────────────────────────────
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
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Agreement Card ───────────────────────────────────────────
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
  const counterparty = isPartyA
    ? (agreement.partyB ?? "Unknown")
    : (agreement.partyA ?? "Unknown");
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
    <div className="agr-card">
      {/* Card Header */}
      <div
        className="agr-header"
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: "pointer" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            flex: 1,
          }}
        >
          <div className="agr-id-badge">#{agreement.agreementId}</div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-1)",
                }}
              >
                {isPartyA ? `→ ${receiverName}` : `← ${payerName}`}
              </span>
              <span
                className="state-pill"
                style={{
                  color: fundStateColor(agreement.fundState),
                  borderColor: fundStateColor(agreement.fundState) + "40",
                  background: fundStateColor(agreement.fundState) + "10",
                }}
              >
                {fundStateLabel(agreement.fundState)}
              </span>
              <span className="role-tag">
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
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          {/* Progress ring */}
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
            <div className="mini-progress">
              <div className="mini-fill" style={{ width: `${progressPct}%` }} />
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
            strokeLinejoin="round"
            style={{
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 0.2s",
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="agr-body fade-in">
          {/* Transaction Info */}
          {(agreement.onChainCreateTxId || agreement.depositTxId) && (
            <div className="tx-section">
              <div className="section-label">Transactions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {agreement.onChainCreateTxId && (
                  <div className="tx-row">
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
                      className="tx-link"
                    >
                      {agreement.onChainCreateTxId.slice(0, 16)}… ↗
                    </a>
                  </div>
                )}
                {agreement.depositTxId && (
                  <div className="tx-row">
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
                      className="tx-link"
                    >
                      {agreement.depositTxId.slice(0, 16)}… ↗
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Milestones */}
          {agreement.milestones.length > 0 && (
            <div>
              <div className="section-label">Milestones</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {agreement.milestones.map((ms) => (
                  <div key={ms.index} className="ms-row">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flex: 1,
                      }}
                    >
                      <div
                        className="ms-dot"
                        style={{
                          background: msStatusColor(ms.status) + "30",
                          border: `1px solid ${msStatusColor(ms.status)}50`,
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
                          className="tx-link"
                          style={{ fontSize: 10 }}
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

          {/* Go to active agreement */}
          {agreement.fundState === "locked" && isPartyA && (
            <div style={{ marginTop: 14 }}>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: "7px 16px" }}
                onClick={() => {
                  // Reload with this agreement pre-loaded — navigate to dashboard
                  if (typeof window !== "undefined") {
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

// ── Join Modal ───────────────────────────────────────────────
function JoinModal({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleJoin() {
    if (!input.trim()) {
      setError("Enter a link or agreement ID");
      return;
    }
    // Extract ID from full URL or use as-is
    const trimmed = input.trim();
    let id = trimmed;
    const match = trimmed.match(/\/agreement\/([A-Z0-9]+)/i);
    if (match) id = match[1].toUpperCase();
    else if (trimmed.length > 0)
      id = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");

    if (!id || id.length < 4) {
      setError("Invalid agreement ID or link");
      return;
    }
    window.location.href = `/agreement/${id}`;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div style={{ marginBottom: 20 }}>
          <h3
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              marginBottom: 6,
            }}
          >
            Join Agreement
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6 }}>
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
        </div>
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

// ── Main Component ───────────────────────────────────────────
export default function ScreenLanding() {
  const dispatch = useDispatch<AppDispatch>();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loadingAgreements, setLoadingAgreements] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // Restore wallet from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("pA_walletAddress");
    if (saved) setWalletAddress(saved);
  }, []);

  // Fetch agreements when wallet is known
  const fetchAgreements = useCallback(async (address: string) => {
    setLoadingAgreements(true);
    try {
      // Try the dedicated list endpoint first
      const res = await fetch(
        `${API_BASE}/api/agreements?partyA=${encodeURIComponent(address)}`,
        { headers: { "Content-Type": "application/json" } },
      );
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.agreements ?? []);
        setAgreements(list);
        setLoadingAgreements(false);
        return;
      }
      // Fallback: if endpoint doesn't exist yet (404/405), try the milestones
      // endpoint for known agreement IDs stored in localStorage
      const storedId = localStorage.getItem("pA_agreementId");
      if (storedId) {
        const r2 = await fetch(
          `${API_BASE}/api/agreement/${storedId}/milestones`,
        );
        if (r2.ok) {
          const d2 = await r2.json();
          if (d2 && d2.agreementId) setAgreements([d2]);
        }
      }
    } catch (err) {
      console.error("[fetchAgreements]", err);
      // Last resort: load from localStorage pA_agreementId
      const storedId = localStorage.getItem("pA_agreementId");
      if (storedId) {
        try {
          const r = await fetch(
            `${API_BASE}/api/agreement/${storedId}/milestones`,
          );
          if (r.ok) {
            const d = await r.json();
            if (d && d.agreementId) setAgreements([d]);
          }
        } catch {
          /* ignore */
        }
      }
    } finally {
      setLoadingAgreements(false);
    }
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
    // Clear all pA_ localStorage keys for a fresh start
    Object.keys(localStorage)
      .filter((k) => k.startsWith("pA_") && k !== "pA_walletAddress")
      .forEach((k) => localStorage.removeItem(k));
    dispatch(resetAll());
    // Re-set wallet so user stays connected
    if (walletAddress) {
      localStorage.setItem("pA_walletAddress", walletAddress);
    }
    dispatch(setScreen("select-type"));
  }

  const completedAgreements = agreements.filter(
    (a) => a.fundState === "released",
  );
  const activeAgreements = agreements.filter((a) => a.fundState === "locked");
  const pendingAgreements = agreements.filter(
    (a) => !["released", "locked"].includes(a.fundState),
  );

  // ── Not connected ──────────────────────────────────────────
  if (!walletAddress) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 24px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <style>{css}</style>

        {/* Background grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
            backgroundImage:
              "repeating-linear-gradient(90deg,transparent,transparent 79px,rgba(242,242,240,0.02) 79px,rgba(242,242,240,0.02) 80px), repeating-linear-gradient(0deg,transparent,transparent 79px,rgba(242,242,240,0.02) 79px,rgba(242,242,240,0.02) 80px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "30%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            width: 600,
            height: 400,
            borderRadius: "50%",
            background:
              "radial-gradient(ellipse, rgba(242,242,240,0.04) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 2,
            textAlign: "center",
            maxWidth: 480,
            width: "100%",
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              marginBottom: 52,
            }}
          >
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-1)",
                letterSpacing: "-0.03em",
              }}
            >
              Clause
            </span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 300,
                color: "var(--text-3)",
                letterSpacing: "-0.03em",
              }}
            >
              Ai
            </span>
          </div>

          {/* Wallet icon */}
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: connecting ? "rgba(34,197,94,0.06)" : "var(--bg-2)",
              border: `1px solid ${connecting ? "rgba(34,197,94,0.2)" : "var(--border-hi)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 28px",
              transition: "all 0.3s",
            }}
          >
            {connecting ? (
              <span className="spinner" style={{ width: 26, height: 26 }} />
            ) : (
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-2)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            )}
          </div>

          <h1
            style={{
              fontSize: "clamp(28px, 5vw, 44px)",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              marginBottom: 12,
            }}
          >
            Connect your wallet
            <br />
            <span
              style={{
                color: "var(--text-3)",
                fontWeight: 300,
                fontStyle: "italic",
              }}
            >
              to get started
            </span>
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-2)",
              lineHeight: 1.7,
              marginBottom: 36,
            }}
          >
            Connect your Leather wallet to view your agreements or create a new
            Bitcoin-enforced escrow.
          </p>

          {connectError && (
            <div
              className="error-box fade-in"
              style={{ marginBottom: 16, textAlign: "left" }}
            >
              ⚠ {connectError}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleConnect}
              disabled={connecting}
              style={{ width: "100%" }}
            >
              {connecting ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14 }} />{" "}
                  Connecting to Leather…
                </>
              ) : (
                "Connect Leather Wallet"
              )}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setShowJoin(true)}
              style={{ width: "100%" }}
            >
              Join an Agreement (as Receiver)
            </button>
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--mono)",
                color: "var(--text-4)",
                textAlign: "center",
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
        </div>

        {showJoin && <JoinModal onClose={() => setShowJoin(false)} />}
      </div>
    );
  }

  // ── Connected — Dashboard ──────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <style>{css}</style>

      {/* Topbar */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          height: 52,
          background: "rgba(10,10,10,0.85)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text-1)",
              letterSpacing: "-0.03em",
            }}
          >
            Clause
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 300,
              color: "var(--text-3)",
              letterSpacing: "-0.03em",
            }}
          >
            Ai
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="wallet-chip">
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--green)",
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

      {/* Main */}
      <div
        style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px 80px" }}
      >
        {/* Header */}
        <div className="fade-up" style={{ marginBottom: 40 }}>
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
                  color: "var(--text-4)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Your Dashboard
              </div>
              <h1
                style={{
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
                style={{ fontSize: 12 }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                Join Agreement
              </button>
              <button
                className="btn btn-primary"
                onClick={handleNewAgreement}
                style={{ fontSize: 12 }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New Agreement
              </button>
            </div>
          </div>
        </div>

        {/* Stats Strip */}
        {agreements.length > 0 && (
          <div className="fade-up d1 stats-strip" style={{ marginBottom: 32 }}>
            {[
              {
                label: "Total Locked",
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
              <div key={label} className="stat-card">
                <div className="stat-label">{label}</div>
                <div className="stat-value">{value}</div>
                <div className="stat-sub">{sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Agreements List */}
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
          <div className="fade-up d2 empty-state">
            <div className="empty-icon">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-4)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
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
              }}
            >
              No agreements yet
            </h3>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-3)",
                lineHeight: 1.6,
                marginBottom: 20,
                maxWidth: 360,
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
            className="fade-up d2"
            style={{ display: "flex", flexDirection: "column", gap: 0 }}
          >
            {/* Active */}
            {activeAgreements.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div className="section-label" style={{ marginBottom: 10 }}>
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
            {/* Pending/Idle */}
            {pendingAgreements.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div className="section-label" style={{ marginBottom: 10 }}>
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
            {/* Complete */}
            {completedAgreements.length > 0 && (
              <div>
                <div className="section-label" style={{ marginBottom: 10 }}>
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

const css = `
/* Spinner */
.spinner { display: inline-block; border: 2px solid var(--bg-3); border-top-color: var(--green); border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Fade animations */
.fade-up { animation: fadeUp 0.4s ease both; }
.fade-in { animation: fadeIn 0.3s ease both; }
.d1 { animation-delay: 0.06s; }
.d2 { animation-delay: 0.12s; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

/* Nav */
.wallet-chip {
  display: flex; align-items: center; gap: 7px;
  background: var(--bg-2); border: 1px solid var(--border);
  border-radius: 20px; padding: 5px 12px;
}

/* Stats */
.stats-strip {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
}
@media (max-width: 640px) { .stats-strip { grid-template-columns: 1fr 1fr; } }
.stat-card {
  background: var(--bg-1); border: 1px solid var(--border);
  border-radius: var(--r-sm); padding: 14px 16px;
}
.stat-label { font-size: 9px; font-family: var(--mono); color: var(--text-4); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px; }
.stat-value { font-size: 20px; font-weight: 800; color: var(--text-1); letter-spacing: -0.04em; margin-bottom: 3px; }
.stat-sub { font-size: 10px; font-family: var(--mono); color: var(--text-4); }

/* Section labels */
.section-label { font-size: 10px; font-family: var(--mono); color: var(--text-4); text-transform: uppercase; letter-spacing: 0.1em; }

/* Agreement card */
.agr-card {
  background: var(--bg-1); border: 1px solid var(--border);
  border-radius: var(--r); overflow: hidden;
  transition: border-color 0.2s;
}
.agr-card:hover { border-color: var(--border-hi); }
.agr-header {
  display: flex; align-items: center; gap: 12;
  padding: 14px 18px;
}
.agr-id-badge {
  font-size: 10px; font-family: var(--mono); color: var(--text-4);
  background: var(--bg-3); border: 1px solid var(--border);
  border-radius: 4px; padding: 3px 8px; flex-shrink: 0;
}
.state-pill {
  font-size: 9px; font-family: var(--mono); font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.06em;
  border: 1px solid; border-radius: 10px; padding: 2px 8px;
}
.role-tag {
  font-size: 9px; font-family: var(--mono); color: var(--text-4);
  background: var(--bg-3); border: 1px solid var(--border);
  border-radius: 4px; padding: 2px 7px;
}
.mini-progress { height: 3px; width: 80px; background: var(--bg-3); border-radius: 2px; overflow: hidden; }
.mini-fill { height: 100%; background: var(--green); border-radius: 2px; min-width: 3px; transition: width 0.4s ease; }

/* Expanded body */
.agr-body {
  border-top: 1px solid var(--border);
  padding: 14px 18px;
  display: flex; flex-direction: column; gap: 14px;
}
.tx-section {}
.tx-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10; padding: 5px 0;
}
.tx-link {
  font-size: 11px; font-family: var(--mono); color: var(--text-3);
  text-decoration: none; letter-spacing: 0.02em;
}
.tx-link:hover { color: var(--text-1); }
.ms-row {
  display: flex; align-items: center; gap: 12;
  padding: 8px 10px; background: var(--bg-2); border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.ms-dot {
  width: 20px; height: 20px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}

/* Empty state */
.empty-state {
  text-align: center; padding: 64px 24px;
  background: var(--bg-1); border: 1px solid var(--border);
  border-radius: var(--r); border-style: dashed;
}
.empty-icon {
  width: 52px; height: 52px; border-radius: 50%;
  background: var(--bg-3); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 16px;
}

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.modal-box {
  background: var(--bg-1); border: 1px solid var(--border-hi);
  border-radius: var(--r); padding: 24px; width: 100%; max-width: 440px;
  animation: fadeUp 0.25s ease both;
}
`;
