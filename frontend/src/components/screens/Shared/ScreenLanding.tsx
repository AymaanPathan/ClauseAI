"use client";
// ============================================================
// components/partyA/ScreenLanding.tsx — ClauseAI 2026
// FULLY RESPONSIVE — mobile-first, all breakpoints covered
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
    <div className="ag-card">
      <div className="ag-card-header" onClick={() => setExpanded(!expanded)}>
        {/* ID badge */}
        <div className="ag-id-badge">#{agreement.agreementId}</div>

        {/* Middle info */}
        <div className="ag-card-info">
          <div className="ag-card-top-row">
            <span className="ag-card-name">
              {isPartyA ? `→ ${receiverName}` : `← ${payerName}`}
            </span>
            <span
              className="ag-fund-badge"
              style={{
                color: fundStateColor(agreement.fundState),
                borderColor: fundStateColor(agreement.fundState) + "40",
                background: fundStateColor(agreement.fundState) + "10",
              }}
            >
              {fundStateLabel(agreement.fundState)}
            </span>
            <span className="ag-role-badge">
              {isPartyA ? "You are Payer" : "You are Receiver"}
            </span>
          </div>
          <div className="ag-card-meta-row">
            <span className="ag-meta-val">${agreement.totalAmountUsd} USD</span>
            <span className="ag-meta-sub">
              {formatSats(agreement.totalAmountSats)}
            </span>
            {agreement.createdAt && (
              <span className="ag-meta-time">
                {timeAgo(agreement.createdAt)}
              </span>
            )}
          </div>
        </div>

        {/* Right: progress + chevron */}
        <div className="ag-card-right">
          <div className="ag-progress-wrap">
            <div className="ag-progress-label">
              {completedMs}/{agreement.milestones.length} done
            </div>
            <div className="ag-progress-track">
              <div
                className="ag-progress-fill"
                style={{ width: `${progressPct}%` }}
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
              flexShrink: 0,
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="ag-card-expanded">
          {/* Transactions */}
          {(agreement.onChainCreateTxId || agreement.depositTxId) && (
            <div className="ag-expanded-section">
              <div className="ag-expanded-label">Transactions</div>
              {agreement.onChainCreateTxId && (
                <div className="ag-tx-row">
                  <span className="ag-tx-type">Contract Deploy</span>
                  <a
                    href={`https://explorer.hiro.so/txid/${agreement.onChainCreateTxId}?chain=testnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ag-tx-link"
                  >
                    {agreement.onChainCreateTxId.slice(0, 14)}… ↗
                  </a>
                </div>
              )}
              {agreement.depositTxId && (
                <div className="ag-tx-row">
                  <span className="ag-tx-type">sBTC Deposit</span>
                  <a
                    href={`https://explorer.hiro.so/txid/${agreement.depositTxId}?chain=testnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ag-tx-link"
                  >
                    {agreement.depositTxId.slice(0, 14)}… ↗
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Milestones */}
          {agreement.milestones.length > 0 && (
            <div className="ag-expanded-section">
              <div className="ag-expanded-label">Milestones</div>
              <div className="ag-ms-list">
                {agreement.milestones.map((ms) => (
                  <div key={ms.index} className="ag-ms-item">
                    <div
                      className="ag-ms-dot"
                      style={{
                        background: msStatusColor(ms.status) + "30",
                        borderColor: msStatusColor(ms.status) + "50",
                        color: msStatusColor(ms.status),
                      }}
                    >
                      {ms.index + 1}
                    </div>
                    <div className="ag-ms-body">
                      <div className="ag-ms-title">{ms.title}</div>
                      {ms.condition && (
                        <div className="ag-ms-cond">
                          {ms.condition.length > 60
                            ? ms.condition.slice(0, 60) + "…"
                            : ms.condition}
                        </div>
                      )}
                    </div>
                    <div className="ag-ms-right">
                      <span className="ag-ms-amount">
                        ${ms.amountUsd} · {ms.percentage}%
                      </span>
                      <span
                        className="ag-ms-status"
                        style={{
                          color: msStatusColor(ms.status),
                          background: msStatusColor(ms.status) + "15",
                          borderColor: msStatusColor(ms.status) + "30",
                        }}
                      >
                        {msStatusLabel(ms.status)}
                      </span>
                      {ms.txId && (
                        <a
                          href={`https://explorer.hiro.so/txid/${ms.txId}?chain=testnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ag-ms-tx"
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

          {/* Open dashboard CTA */}
          {agreement.fundState === "locked" && (isPartyA || isPartyB) && (
            <div style={{ marginTop: 4 }}>
              <button
                className="btn btn-ghost ag-open-btn"
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Join Agreement</h3>
        <p className="modal-body">
          Paste the full agreement link or just the ID (e.g.{" "}
          <code className="modal-code">7C64F0</code>)
        </p>
        <input
          className="input modal-input"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="https://…/agreement/7C64F0  or  7C64F0"
          autoFocus
        />
        {error && <div className="modal-error">⚠ {error}</div>}
        <div className="modal-actions">
          <button
            className="btn btn-primary modal-join-btn"
            onClick={handleJoin}
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    } catch {}
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
    } catch {}
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
        } catch {}
      }
    } catch {}
    const storedId = localStorage.getItem("pA_agreementId");
    if (storedId && !seen.has(storedId)) {
      try {
        const r = await fetch(`${API_BASE}/agreement/${storedId}/milestones`);
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
      } catch {}
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
    setMobileMenuOpen(false);
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
      <div className="lp-root">
        <style>{css}</style>

        {/* Topbar */}
        <nav className="lp-nav">
          <div className="lp-nav-brand">
            <div className="lp-brand-mark">◈</div>
            <span className="lp-brand-name">ClauseAI</span>
          </div>

          {/* Desktop nav actions */}
          <div className="lp-nav-actions lp-nav-desktop">
            <button
              className="btn btn-ghost lp-nav-btn"
              onClick={() => setShowJoin(true)}
            >
              Join Agreement
            </button>
            <button
              className="lp-arb-btn"
              onClick={() => {
                window.location.href = "/arbitrate";
              }}
            >
              Arbitrator Login
            </button>
            <button
              className="btn btn-primary lp-nav-btn"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? "Connecting…" : "Connect Wallet →"}
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="lp-hamburger"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            <span
              className={`lp-ham-line ${mobileMenuOpen ? "lp-ham-open" : ""}`}
            />
            <span
              className={`lp-ham-line ${mobileMenuOpen ? "lp-ham-open" : ""}`}
            />
            <span
              className={`lp-ham-line ${mobileMenuOpen ? "lp-ham-open" : ""}`}
            />
          </button>
        </nav>

        {/* Mobile menu drawer */}
        {mobileMenuOpen && (
          <div className="lp-mobile-menu">
            <button
              className="btn btn-ghost lp-mobile-menu-btn"
              onClick={() => {
                setShowJoin(true);
                setMobileMenuOpen(false);
              }}
            >
              Join as Receiver
            </button>
            <button
              className="lp-arb-btn lp-mobile-menu-btn"
              onClick={() => {
                window.location.href = "/arbitrate";
              }}
            >
              Arbitrator Login
            </button>
            <button
              className="btn btn-primary lp-mobile-menu-btn"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14 }} />{" "}
                  Connecting…
                </>
              ) : (
                "Connect Leather Wallet"
              )}
            </button>
          </div>
        )}

        {/* Hero section */}
        <section className="lp-hero">
          {/* Left: copy */}
          <div className="lp-hero-left">
            <div className="lp-fade-up lp-badge-wrap">
              <span className="lp-badge">
                <span className="lp-badge-dot" />
                Bitcoin-Enforced Escrow
              </span>
            </div>

            <h1 className="lp-fade-up lp-d1 lp-headline">
              Smart Contracts.
              <br />
              On Bitcoin.
              <br />
              <span className="lp-headline-accent">AI-Powered.</span>
            </h1>

            <p className="lp-fade-up lp-d2 lp-subhead">
              ClauseAI creates Bitcoin-enforced milestone escrows. Connect your
              Leather wallet to create or manage sBTC agreements in under 60
              seconds.
            </p>

            {connectError && (
              <div className="error-box lp-fade-up lp-error">
                ⚠ {connectError}
              </div>
            )}

            <div className="lp-fade-up lp-d3 lp-hero-ctas">
              <button
                className="btn btn-primary btn-lg lp-cta-primary"
                onClick={handleConnect}
                disabled={connecting}
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
                className="btn btn-ghost btn-lg lp-cta-secondary"
                onClick={() => setShowJoin(true)}
              >
                Join as Receiver →
              </button>
            </div>

            <div className="lp-fade-up lp-leather-hint">
              Don't have Leather?{" "}
              <a
                href="https://wallet.hiro.so"
                target="_blank"
                rel="noopener noreferrer"
                className="lp-leather-link"
              >
                Install it free →
              </a>
            </div>
          </div>

          {/* Right: hero visual (hidden on small mobile) */}
          <div className="lp-hero-right lp-hero-visual-wrap">
            {/* Grid texture */}
            <div className="lp-grid-texture" />

            {/* Floating blocks */}
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
                className="lp-float-block"
                style={{
                  top: b.t,
                  left: b.l ?? "auto",
                  right: b.r ?? "auto",
                  width: b.s,
                  height: b.s,
                  animationDelay: b.d,
                }}
              />
            ))}

            {/* Card */}
            <div className="lp-hero-card-wrap">
              <div className="lp-glow-icon">
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
              <div className="lp-escrow-card">
                <div className="lp-escrow-label">sBTC ESCROW</div>
                <div className="lp-escrow-amount">
                  0.004821 <span className="lp-escrow-unit">sBTC</span>
                </div>
                <div className="lp-escrow-divider" />
                <div className="lp-escrow-parties">
                  {[
                    ["Payer", "SP2X…A4"],
                    ["Receiver", "SP3F…B9"],
                  ].map(([label, addr]) => (
                    <div key={label}>
                      <div className="lp-escrow-party-label">{label}</div>
                      <div className="lp-escrow-party-addr">{addr}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Glow */}
            <div className="lp-hero-glow" />
          </div>
        </section>

        {/* Stats strip */}
        <section className="lp-stats-strip">
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
            <div key={i} className="lp-stat-cell">
              <div className="lp-stat-label">{label}</div>
              <div className="lp-stat-value">{value}</div>
              <div className="lp-stat-sub">{sub}</div>
            </div>
          ))}
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
    <div className="dash-root">
      <style>{css}</style>

      {/* Topbar */}
      <nav className="dash-nav">
        <div className="lp-nav-brand">
          <div className="lp-brand-mark lp-brand-mark--sm">◈</div>
          <span className="lp-brand-name">ClauseAI</span>
        </div>
        <div className="dash-nav-right">
          <button
            className="lp-arb-btn lp-arb-btn--sm"
            onClick={() => {
              window.location.href = "/arbitrate";
            }}
          >
            Arbitrate
          </button>
          <div className="dash-wallet-pill">
            <div className="dash-wallet-dot" />
            <span className="dash-wallet-addr">
              {walletAddress.slice(0, 8)}…{walletAddress.slice(-5)}
            </span>
          </div>
          <button
            className="btn btn-ghost dash-disconnect-btn"
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
      <div className="dash-content">
        {/* Header */}
        <div className="lp-fade-up dash-header">
          <div className="dash-header-left">
            <div className="dash-eyebrow">Your Dashboard</div>
            <h1 className="dash-title">Agreements</h1>
            <p className="dash-subtitle">
              {agreements.length} total · {activeAgreements.length} active ·{" "}
              {completedAgreements.length} complete
            </p>
          </div>
          <div className="dash-header-actions">
            <button
              className="btn btn-ghost dash-action-btn"
              onClick={() => setShowJoin(true)}
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
              <span className="dash-action-label">Join</span>
            </button>
            <button
              className="btn btn-primary dash-action-btn"
              onClick={handleNewAgreement}
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
              <span className="dash-action-label">New Agreement</span>
            </button>
          </div>
        </div>

        {/* Stats grid */}
        {agreements.length > 0 && (
          <div className="lp-fade-up lp-d1 dash-stats-grid">
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
              <div key={label} className="dash-stat-cell">
                <div className="dash-stat-label">{label}</div>
                <div className="dash-stat-value">{value}</div>
                <div className="dash-stat-sub">{sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Agreement list */}
        {loadingAgreements ? (
          <div className="dash-loading">
            <span
              className="spinner"
              style={{
                width: 20,
                height: 20,
                display: "block",
                margin: "0 auto 14px",
              }}
            />
            <span className="dash-loading-text">Loading your agreements…</span>
          </div>
        ) : agreements.length === 0 ? (
          <div className="lp-fade-up lp-d2 dash-empty">
            <div className="dash-empty-icon">
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
            <h3 className="dash-empty-title">No agreements yet</h3>
            <p className="dash-empty-body">
              Create your first Bitcoin-enforced escrow agreement. Takes under
              60 seconds.
            </p>
            <button className="btn btn-primary" onClick={handleNewAgreement}>
              Create Your First Agreement →
            </button>
          </div>
        ) : (
          <div className="lp-fade-up lp-d2 dash-list">
            {activeAgreements.length > 0 && (
              <div className="dash-group">
                <div className="dash-group-label">
                  Active · {activeAgreements.length}
                </div>
                <div className="dash-group-list">
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
              <div className="dash-group">
                <div className="dash-group-label">
                  Pending · {pendingAgreements.length}
                </div>
                <div className="dash-group-list">
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
              <div className="dash-group">
                <div className="dash-group-label">
                  Complete · {completedAgreements.length}
                </div>
                <div className="dash-group-list">
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

// ─────────────────────────────────────────────────────────────
// CSS — all responsive rules in one place
// ─────────────────────────────────────────────────────────────
const css = `

/* ── Animations ────────────────────────────────────────────── */
@keyframes lp-block {
  0%,100% { transform:translateY(0); }
  50% { transform:translateY(-10px); }
}
@keyframes lp-float {
  0%,100% { opacity:0.3;transform:translateY(0) scale(1); }
  50% { opacity:0.8;transform:translateY(-8px) scale(1.4); }
}
@keyframes lp-glow {
  0%,100% { box-shadow:0 0 55px rgba(196,255,70,0.55),0 0 110px rgba(196,255,70,0.2); }
  50% { box-shadow:0 0 80px rgba(196,255,70,0.75),0 0 160px rgba(196,255,70,0.35); }
}
@keyframes lp-fadeup {
  from { opacity:0;transform:translateY(14px); }
  to   { opacity:1;transform:translateY(0); }
}
@keyframes ham-top-open {
  to { transform:translateY(7px) rotate(45deg); }
}
@keyframes ham-mid-open {
  to { opacity:0;transform:scaleX(0); }
}
@keyframes ham-bot-open {
  to { transform:translateY(-7px) rotate(-45deg); }
}

.lp-fade-up { animation:lp-fadeup 0.45s cubic-bezier(0.16,1,0.3,1) both; }
.lp-d1 { animation-delay:0.07s; }
.lp-d2 { animation-delay:0.14s; }
.lp-d3 { animation-delay:0.21s; }

/* ── Landing root ───────────────────────────────────────────── */
.lp-root {
  background:var(--bg);
  min-height:100vh;
  overflow-x:hidden;
}

/* ── Topbar ─────────────────────────────────────────────────── */
.lp-nav {
  position:fixed;
  top:0;left:0;right:0;
  z-index:200;
  height:60px;
  background:rgba(11,12,13,0.92);
  backdrop-filter:blur(20px);
  border-bottom:1px solid var(--border);
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:0 48px;
}
.lp-nav-brand {
  display:flex;
  align-items:center;
  gap:9px;
  flex-shrink:0;
}
.lp-brand-mark {
  width:30px;height:30px;
  border-radius:8px;
  background:var(--accent);
  display:flex;align-items:center;justify-content:center;
  font-family:var(--font-display);
  font-weight:800;font-size:15px;
  color:#0b0c0d;
  flex-shrink:0;
}
.lp-brand-mark--sm { width:28px;height:28px;font-size:14px;border-radius:7px; }
.lp-brand-name {
  font-family:var(--font-display);
  font-size:16px;font-weight:800;
  color:var(--text-1);
  letter-spacing:-0.03em;
}
.lp-nav-actions {
  display:flex;
  align-items:center;
  gap:8px;
}
.lp-nav-desktop { display:flex; }
.lp-nav-btn { font-size:13px;padding:7px 18px; }
.lp-arb-btn {
  font-size:13px;padding:7px 18px;
  background:rgba(196,255,70,0.10);
  border:1px solid rgba(196,255,70,0.40);
  border-radius:8px;
  cursor:pointer;
  color:#c4ff46;
  font-family:var(--mono);
  font-weight:600;
  letter-spacing:0.02em;
  transition:all 0.15s;
  white-space:nowrap;
}
.lp-arb-btn:hover { background:rgba(196,255,70,0.18); }
.lp-arb-btn--sm { font-size:11px;padding:5px 12px; }

/* Hamburger */
.lp-hamburger {
  display:none;
  flex-direction:column;
  justify-content:center;
  gap:5px;
  width:36px;height:36px;
  background:none;
  border:1px solid var(--border);
  border-radius:7px;
  cursor:pointer;
  padding:0 8px;
}
.lp-ham-line {
  display:block;
  height:1.5px;
  background:var(--text-2);
  border-radius:2px;
  transition:all 0.22s;
  transform-origin:center;
}

/* Mobile drawer */
.lp-mobile-menu {
  position:fixed;
  top:60px;left:0;right:0;
  z-index:190;
  background:rgba(11,12,13,0.98);
  backdrop-filter:blur(20px);
  border-bottom:1px solid var(--border);
  display:flex;
  flex-direction:column;
  gap:8px;
  padding:16px;
  animation:lp-fadeup 0.2s ease both;
}
.lp-mobile-menu-btn {
  width:100%;
  justify-content:center;
  font-size:14px;
  padding:13px 20px;
  min-height:48px;
}

/* ── Hero ───────────────────────────────────────────────────── */
.lp-hero {
  min-height:100vh;
  display:grid;
  grid-template-columns:1fr 1fr;
  position:relative;
  overflow:hidden;
  padding-top:60px;
}
.lp-hero-left {
  display:flex;
  flex-direction:column;
  justify-content:center;
  padding:80px 0 80px 72px;
  position:relative;
  z-index:2;
}
.lp-badge-wrap { margin-bottom:28px; }
.lp-badge {
  display:inline-flex;align-items:center;gap:7px;
  background:rgba(196,255,70,0.07);
  border:1px solid rgba(196,255,70,0.2);
  border-radius:20px;
  padding:5px 14px;
  font-size:10px;
  font-family:var(--mono);
  color:var(--accent);
  letter-spacing:0.1em;
  text-transform:uppercase;
}
.lp-badge-dot {
  width:5px;height:5px;
  border-radius:50%;
  background:var(--accent);
  animation:pulseDot 2s ease infinite;
}
.lp-headline {
  font-family:var(--font-display);
  font-size:clamp(36px,4.5vw,60px);
  font-weight:800;
  line-height:1.05;
  letter-spacing:-0.04em;
  color:var(--text-1);
  margin-bottom:20px;
}
.lp-headline-accent { color:var(--accent); }
.lp-subhead {
  font-size:15px;
  color:var(--text-3);
  line-height:1.75;
  max-width:380px;
  margin-bottom:36px;
}
.lp-error { margin-bottom:16px;max-width:380px; }
.lp-hero-ctas {
  display:flex;
  gap:10px;
  flex-wrap:wrap;
  margin-bottom:16px;
}
.lp-cta-primary { min-width:200px; }
.lp-cta-secondary { white-space:nowrap; }
.lp-leather-hint {
  font-size:11px;
  font-family:var(--mono);
  color:var(--text-4);
}
.lp-leather-link {
  color:var(--text-2);
  text-decoration:none;
}

/* Hero right visual */
.lp-hero-right {
  position:relative;
  display:flex;
  align-items:center;
  justify-content:center;
  overflow:hidden;
}
.lp-hero-visual-wrap { /* same as lp-hero-right */ }
.lp-grid-texture {
  position:absolute;inset:0;
  pointer-events:none;
  background-image:
    repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(196,255,70,0.04) 39px,rgba(196,255,70,0.04) 40px),
    repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(196,255,70,0.04) 39px,rgba(196,255,70,0.04) 40px);
}
.lp-float-block {
  position:absolute;
  border-radius:10px;
  background:rgba(22,24,27,0.85);
  border:1px solid rgba(196,255,70,0.08);
  box-shadow:0 8px 28px rgba(0,0,0,0.45);
  animation:lp-block 4s ease-in-out infinite;
}
.lp-hero-card-wrap {
  position:relative;
  z-index:10;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:22px;
  animation:lp-block 3s ease-in-out infinite;
}
.lp-glow-icon {
  width:76px;height:76px;
  border-radius:18px;
  background:var(--accent);
  animation:lp-glow 2.4s ease-in-out infinite;
  display:flex;align-items:center;justify-content:center;
}
.lp-escrow-card {
  background:rgba(17,18,20,0.96);
  border:1px solid rgba(196,255,70,0.18);
  border-radius:14px;
  padding:14px 22px;
  backdrop-filter:blur(20px);
  box-shadow:0 24px 64px rgba(0,0,0,0.55);
  min-width:220px;
  max-width:260px;
  width:100%;
}
.lp-escrow-label {
  font-size:9px;
  font-family:var(--mono);
  color:var(--text-4);
  letter-spacing:0.14em;
  margin-bottom:5px;
}
.lp-escrow-amount {
  font-size:19px;
  font-family:var(--font-display);
  font-weight:800;
  color:var(--text-1);
  letter-spacing:-0.03em;
}
.lp-escrow-unit {
  font-size:11px;
  font-family:var(--mono);
  font-weight:400;
  color:var(--text-3);
  letter-spacing:0.06em;
}
.lp-escrow-divider { height:1px;background:var(--border);margin:10px 0; }
.lp-escrow-parties { display:flex;justify-content:space-between; }
.lp-escrow-party-label { font-size:9px;font-family:var(--mono);color:var(--text-4);margin-bottom:2px; }
.lp-escrow-party-addr { font-size:11px;font-family:var(--mono);color:var(--text-2); }
.lp-hero-glow {
  position:absolute;
  top:48%;left:50%;
  transform:translate(-50%,0);
  width:220px;height:160px;
  background:radial-gradient(ellipse at top,rgba(196,255,70,0.22) 0%,transparent 70%);
  pointer-events:none;
}

/* ── Stats strip ────────────────────────────────────────────── */
.lp-stats-strip {
  display:grid;
  grid-template-columns:repeat(3,1fr);
  border-top:1px solid var(--border);
  position:relative;
}
.lp-stat-cell {
  padding:36px 48px;
  border-right:1px solid var(--border);
  background:var(--bg-1);
  transition:background 0.2s;
}
.lp-stat-cell:last-child { border-right:none; }
.lp-stat-cell:hover { background:var(--bg-2); }
.lp-stat-label {
  font-size:9px;
  font-family:var(--mono);
  color:var(--text-4);
  letter-spacing:0.12em;
  text-transform:uppercase;
  margin-bottom:10px;
}
.lp-stat-value {
  font-family:var(--font-display);
  font-size:36px;
  font-weight:800;
  letter-spacing:-0.04em;
  color:var(--accent);
  line-height:1;
  margin-bottom:6px;
}
.lp-stat-sub {
  font-size:11px;
  font-family:var(--mono);
  color:var(--text-4);
}

/* ── Dashboard root ─────────────────────────────────────────── */
.dash-root { min-height:100vh;background:var(--bg); }
.dash-nav {
  position:sticky;top:0;z-index:100;
  height:56px;
  background:rgba(11,12,13,0.92);
  backdrop-filter:blur(20px);
  border-bottom:1px solid var(--border);
  display:flex;
  align-items:center;
  padding:0 32px;
  justify-content:space-between;
  gap:12px;
}
.dash-nav-right {
  display:flex;
  align-items:center;
  gap:8px;
  flex-shrink:0;
  min-width:0;
}
.dash-wallet-pill {
  display:flex;align-items:center;gap:7px;
  background:var(--bg-2);
  border:1px solid var(--border);
  border-radius:20px;
  padding:5px 12px;
  flex-shrink:0;
}
.dash-wallet-dot { width:6px;height:6px;border-radius:50%;background:var(--accent);animation:pulseDot 2s ease infinite;flex-shrink:0; }
.dash-wallet-addr { font-size:10px;font-family:var(--mono);color:var(--text-2); }
.dash-disconnect-btn { font-size:11px;padding:5px 12px; }

/* Dashboard content */
.dash-content {
  max-width:880px;
  margin:0 auto;
  padding:48px 24px 80px;
}
.dash-header {
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  flex-wrap:wrap;
  gap:16px;
  margin-bottom:40px;
}
.dash-header-left {}
.dash-eyebrow {
  font-size:10px;
  font-family:var(--mono);
  color:var(--accent);
  letter-spacing:0.12em;
  text-transform:uppercase;
  margin-bottom:10px;
}
.dash-title {
  font-family:var(--font-display);
  font-size:clamp(28px,4vw,44px);
  font-weight:800;
  letter-spacing:-0.04em;
  line-height:1.05;
  margin-bottom:6px;
}
.dash-subtitle { font-size:13px;color:var(--text-3); }
.dash-header-actions { display:flex;gap:8px;flex-wrap:wrap; }
.dash-action-btn { font-size:12px;gap:6px; }

/* Stats grid */
.dash-stats-grid {
  display:grid;
  grid-template-columns:repeat(4,1fr);
  background:var(--border);
  border:1px solid var(--border);
  border-radius:12px;
  overflow:hidden;
  gap:1px;
  margin-bottom:32px;
}
.dash-stat-cell {
  background:var(--bg-1);
  padding:18px 16px;
  transition:background 0.2s;
}
.dash-stat-cell:hover { background:var(--bg-2); }
.dash-stat-label { font-size:9px;font-family:var(--mono);color:var(--text-4);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:7px; }
.dash-stat-value { font-family:var(--font-display);font-size:22px;font-weight:800;color:var(--text-1);letter-spacing:-0.04em;margin-bottom:4px; }
.dash-stat-sub { font-size:10px;font-family:var(--mono);color:var(--text-4); }

/* Loading / empty */
.dash-loading { text-align:center;padding:60px 0;color:var(--text-3); }
.dash-loading-text { font-size:13px;font-family:var(--mono); }
.dash-empty {
  text-align:center;
  padding:64px 24px;
  background:var(--bg-1);
  border:1px dashed var(--border);
  border-radius:14px;
}
.dash-empty-icon {
  width:52px;height:52px;border-radius:50%;
  background:var(--bg-3);border:1px solid var(--border);
  display:flex;align-items:center;justify-content:center;
  margin:0 auto 16px;
}
.dash-empty-title { font-size:16px;font-weight:600;color:var(--text-1);margin-bottom:8px;font-family:var(--font-display); }
.dash-empty-body { font-size:13px;color:var(--text-3);line-height:1.6;max-width:360px;margin:0 auto 20px; }

/* Agreement groups */
.dash-list { display:flex;flex-direction:column;gap:0; }
.dash-group { margin-bottom:24px; }
.dash-group-label { font-size:10px;font-family:var(--mono);color:var(--text-4);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px; }
.dash-group-list { display:flex;flex-direction:column;gap:8px; }

/* ── Agreement Card ─────────────────────────────────────────── */
.ag-card {
  background:var(--bg-1);
  border:1px solid var(--border);
  border-radius:12px;
  overflow:hidden;
  transition:border-color 0.2s;
}
.ag-card:hover { border-color:var(--border-hi); }
.ag-card-header {
  cursor:pointer;
  padding:14px 18px;
  display:flex;
  align-items:center;
  gap:12px;
}
.ag-id-badge {
  font-size:10px;font-family:var(--mono);
  color:var(--text-4);
  background:var(--bg-3);
  border:1px solid var(--border);
  border-radius:5px;
  padding:3px 8px;
  flex-shrink:0;
  white-space:nowrap;
}
.ag-card-info { flex:1;min-width:0; }
.ag-card-top-row {
  display:flex;align-items:center;
  gap:8px;margin-bottom:4px;
  flex-wrap:wrap;
}
.ag-card-name { font-size:13px;font-weight:600;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px; }
.ag-fund-badge {
  font-size:9px;font-family:var(--mono);font-weight:700;
  letter-spacing:0.06em;text-transform:uppercase;
  border:1px solid;border-radius:10px;
  padding:2px 8px;white-space:nowrap;flex-shrink:0;
}
.ag-role-badge {
  font-size:9px;font-family:var(--mono);
  color:var(--text-4);background:var(--bg-3);
  border:1px solid var(--border);border-radius:4px;
  padding:2px 7px;white-space:nowrap;flex-shrink:0;
}
.ag-card-meta-row { display:flex;align-items:center;gap:14px;flex-wrap:wrap; }
.ag-meta-val { font-size:12px;color:var(--text-3);font-family:var(--mono); }
.ag-meta-sub { font-size:12px;color:var(--text-4);font-family:var(--mono); }
.ag-meta-time { font-size:11px;color:var(--text-4);font-family:var(--mono); }
.ag-card-right { display:flex;align-items:center;gap:12px;flex-shrink:0; }
.ag-progress-wrap { text-align:right; }
.ag-progress-label { font-size:11px;font-family:var(--mono);color:var(--text-4);margin-bottom:4px; }
.ag-progress-track { height:3px;width:80px;background:var(--bg-3);border-radius:2px;overflow:hidden; }
.ag-progress-fill { height:100%;background:var(--accent);border-radius:2px;min-width:3px;transition:width 0.4s ease; }
.ag-card-expanded {
  border-top:1px solid var(--border);
  padding:14px 18px;
  display:flex;flex-direction:column;gap:14px;
}
.ag-expanded-section {}
.ag-expanded-label { font-size:10px;font-family:var(--mono);color:var(--text-4);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px; }
.ag-tx-row { display:flex;align-items:center;justify-content:space-between;padding:5px 0; }
.ag-tx-type { font-size:10px;font-family:var(--mono);color:var(--text-4); }
.ag-tx-link { font-size:11px;font-family:var(--mono);color:var(--text-3);text-decoration:none; }
.ag-tx-link:hover { color:var(--accent); }
.ag-ms-list { display:flex;flex-direction:column;gap:6px; }
.ag-ms-item {
  display:flex;align-items:center;gap:12px;
  padding:8px 10px;
  background:var(--bg-2);
  border:1px solid var(--border);
  border-radius:8px;
}
.ag-ms-dot {
  width:20px;height:20px;border-radius:50%;flex-shrink:0;
  border:1px solid;
  display:flex;align-items:center;justify-content:center;
  font-size:8px;font-family:var(--mono);font-weight:700;
}
.ag-ms-body { flex:1;min-width:0; }
.ag-ms-title { font-size:12px;font-weight:500;color:var(--text-1); }
.ag-ms-cond { font-size:10px;color:var(--text-4);font-family:var(--mono);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.ag-ms-right { display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end; }
.ag-ms-amount { font-size:11px;font-family:var(--mono);color:var(--text-3);white-space:nowrap; }
.ag-ms-status { font-size:10px;font-family:var(--mono);font-weight:600;border:1px solid;border-radius:4px;padding:2px 8px;white-space:nowrap; }
.ag-ms-tx { font-size:10px;font-family:var(--mono);color:var(--text-3);text-decoration:none; }
.ag-ms-tx:hover { color:var(--accent); }
.ag-open-btn { font-size:12px;padding:7px 16px; }

/* ── Modal ──────────────────────────────────────────────────── */
.modal-backdrop {
  position:fixed;inset:0;z-index:1000;
  background:rgba(0,0,0,0.65);
  backdrop-filter:blur(6px);
  display:flex;align-items:center;justify-content:center;
  padding:16px;
}
.modal-box {
  background:var(--bg-1);
  border:1px solid var(--border-hi);
  border-radius:14px;
  padding:28px;
  width:100%;max-width:440px;
  animation:lp-fadeup 0.25s ease both;
}
.modal-title { font-size:18px;font-weight:700;letter-spacing:-0.03em;margin-bottom:6px;font-family:var(--font-display); }
.modal-body { font-size:12px;color:var(--text-3);line-height:1.6;margin-bottom:20px; }
.modal-code { font-family:var(--mono);background:var(--bg-3);padding:1px 5px;border-radius:3px; }
.modal-input { font-family:var(--mono);font-size:12px;margin-bottom:8px; }
.modal-error { font-size:11px;color:#ef4444;font-family:var(--mono);margin-bottom:12px; }
.modal-actions { display:flex;gap:8px; }
.modal-join-btn { flex:1; }

/* ═══════════════════════════════════════════════════════════════
   RESPONSIVE BREAKPOINTS
   lg: 1024 | md: 768 | sm: 580 | xs: 400
   ═══════════════════════════════════════════════════════════════ */

/* ── 1024px — laptop ────────────────────────────────────────── */
@media (max-width:1024px) {
  .lp-nav { padding:0 28px; }
  .lp-hero-left { padding:80px 0 60px 40px; }
  .lp-stat-cell { padding:28px 32px; }
  .lp-stat-value { font-size:28px; }
  .dash-content { padding:36px 20px 72px; }
  .dash-stats-grid { grid-template-columns:repeat(2,1fr); }
}

/* ── 768px — tablet ─────────────────────────────────────────── */
@media (max-width:768px) {
  /* Nav */
  .lp-nav { padding:0 20px; }
  .lp-nav-desktop { display:none; }
  .lp-hamburger { display:flex; }

  /* Hero: stack to single column */
  .lp-hero {
    grid-template-columns:1fr;
    min-height:auto;
    padding-top:60px;
  }
  .lp-hero-left {
    padding:60px 24px 48px;
    text-align:center;
    align-items:center;
  }
  .lp-subhead { max-width:100%; text-align:center; }
  .lp-hero-ctas { justify-content:center; }
  .lp-hero-right {
    min-height:320px;
    order:0;
  }
  /* Show visual above hero text on tablet */
  .lp-hero { direction:rtl; }
  .lp-hero > * { direction:ltr; }

  /* Stats strip: 1 column */
  .lp-stats-strip { grid-template-columns:1fr; }
  .lp-stat-cell {
    padding:22px 24px;
    border-right:none !important;
    border-bottom:1px solid var(--border);
  }
  .lp-stat-cell:last-child { border-bottom:none; }
  .lp-stat-value { font-size:28px; }

  /* Dashboard */
  .dash-nav { padding:0 16px; }
  .dash-wallet-addr { display:none; }
  .dash-content { padding:28px 16px 64px; }
  .dash-header { margin-bottom:28px; }
  .dash-stats-grid { grid-template-columns:repeat(2,1fr); }

  /* Agreement card: hide progress bar label on tablet */
  .ag-role-badge { display:none; }
}

/* ── 580px — large phone ────────────────────────────────────── */
@media (max-width:580px) {
  /* Nav */
  .lp-nav { padding:0 16px;height:54px; }
  .lp-brand-name { font-size:14px; }

  /* Hero */
  .lp-hero-left { padding:48px 16px 36px; }
  .lp-headline { font-size:clamp(30px,10vw,44px); }
  .lp-subhead { font-size:14px; }
  .lp-cta-primary,.lp-cta-secondary { width:100%;justify-content:center; }
  .lp-hero-ctas { flex-direction:column;width:100%; }
  .lp-hero-right { min-height:260px; }

  /* Escrow card shrinks on small screens */
  .lp-escrow-card { min-width:180px;padding:12px 16px; }
  .lp-escrow-amount { font-size:16px; }
  .lp-glow-icon { width:60px;height:60px;border-radius:14px; }
  .lp-glow-icon svg { width:26px;height:26px; }

  /* Stats */
  .lp-stat-cell { padding:18px 20px; }
  .lp-stat-value { font-size:24px; }

  /* Dashboard topbar */
  .dash-nav { height:50px;padding:0 14px; }
  .dash-disconnect-btn { display:none; }
  .lp-arb-btn--sm { display:none; }
  .dash-wallet-pill { padding:4px 10px; }
  .dash-wallet-dot { display:none; }
  .dash-wallet-addr {
    display:block;
    font-size:9px;
  }

  /* Dashboard content */
  .dash-content { padding:22px 14px 56px; }
  .dash-title { font-size:clamp(24px,7vw,34px); }
  .dash-stats-grid { grid-template-columns:repeat(2,1fr);gap:1px; }
  .dash-stat-cell { padding:14px 12px; }
  .dash-stat-value { font-size:18px; }
  .dash-header-actions { width:100%; }
  .dash-action-btn { flex:1;justify-content:center; }
  .dash-header { align-items:flex-start; }

  /* Agreement card: compact on mobile */
  .ag-card-header { padding:12px 14px;gap:8px; }
  .ag-id-badge { font-size:9px;padding:2px 6px; }
  .ag-card-name { font-size:12px;max-width:140px; }
  .ag-fund-badge { font-size:8px;padding:2px 6px; }
  .ag-meta-sub { display:none; }
  .ag-progress-track { width:60px; }
  .ag-card-expanded { padding:12px 14px; }

  /* Milestone items: stack on mobile */
  .ag-ms-item { flex-direction:column;align-items:flex-start;gap:6px; }
  .ag-ms-item > div:first-child {
    display:flex;align-items:center;gap:8px;width:100%;
  }
  .ag-ms-right {
    width:100%;justify-content:flex-start;
    padding-left:28px;
  }

  /* Modal: bottom sheet on mobile */
  .modal-backdrop { align-items:flex-end;padding:0; }
  .modal-box {
    border-radius:14px 14px 0 0;
    padding:24px 20px;
    max-width:100%;
  }
  .modal-actions { flex-direction:column; }
  .modal-join-btn { width:100%; }
}

/* ── 400px — small phone ────────────────────────────────────── */
@media (max-width:400px) {
  .lp-nav { padding:0 12px; }
  .lp-brand-name { display:none; }

  .lp-hero-left { padding:40px 12px 28px; }
  .lp-headline { font-size:28px; }
  .lp-badge { font-size:9px;padding:4px 10px; }

  .dash-content { padding:18px 12px 56px; }
  .dash-stats-grid { grid-template-columns:1fr; }

  /* Card: hide progress bar completely */
  .ag-card-right { gap:8px; }
  .ag-progress-wrap { display:none; }

  /* Hero visual: hide floating blocks, keep card only */
  .lp-float-block { display:none; }
}

/* ── Touch targets ──────────────────────────────────────────── */
@media (max-width:768px) {
  .btn,.lp-arb-btn,.ag-open-btn {
    min-height:44px;
  }
  .lp-mobile-menu-btn { min-height:48px; }
  .input { min-height:46px;font-size:16px; } /* prevent iOS zoom */
}

/* ── Safe area (iOS notch) ──────────────────────────────────── */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .lp-mobile-menu {
    padding-bottom:calc(16px + env(safe-area-inset-bottom));
  }
  .dash-content,.lp-hero-left {
    padding-bottom:max(80px, calc(env(safe-area-inset-bottom) + 24px));
  }
  .lp-nav,.dash-nav {
    padding-left:max(16px, env(safe-area-inset-left));
    padding-right:max(16px, env(safe-area-inset-right));
  }
}

/* ── Overflow guard ─────────────────────────────────────────── */
.ag-card,.dash-content,.lp-hero-left,.lp-escrow-card {
  min-width:0;
  max-width:100%;
}
`;
