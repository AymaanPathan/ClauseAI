"use client";
// ============================================================
// components/screens/Arbitrator/ArbitratorDashboard.tsx
// ============================================================

import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/store";
import {
  fetchArbitratorDashboardThunk,
  fetchDisputeDetailThunk,
  disconnect,
  Dispute,
  DisputeStatus,
} from "@/store/slices/arbitratorSlice";

// ── Helpers ───────────────────────────────────────────────────

function statusLabel(s: DisputeStatus): string {
  const map: Record<DisputeStatus, string> = {
    awaiting_statements: "Awaiting Statements",
    party_a_submitted: "Party A Submitted",
    party_b_submitted: "Party B Submitted",
    ai_pending: "AI Processing",
    ai_complete: "Needs Decision",
    resolved: "Resolved",
    auto_refunded: "Auto-Refunded",
  };
  return map[s] ?? s;
}

function statusColor(s: DisputeStatus): string {
  if (s === "resolved" || s === "auto_refunded") return "#34d399";
  if (s === "ai_complete") return "#f59e0b";
  if (s === "ai_pending") return "#60a5fa";
  return "#94a3b8";
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Dispute Row ───────────────────────────────────────────────

function DisputeRow({
  dispute,
  onOpen,
}: {
  dispute: Dispute;
  onOpen: () => void;
}) {
  const needsAction = dispute.status === "ai_complete";

  return (
    <div
      className={`dispute-row ${needsAction ? "dispute-row--urgent" : ""}`}
      onClick={onOpen}
    >
      <div className="dr-left">
        <div className="dr-id">
          <span className="dr-agr">{dispute.agreement_id}</span>
          <span className="dr-ms">· MS #{dispute.milestone_index}</span>
        </div>
        <div className="dr-desc">
          {dispute.contract_terms.milestone_description}
        </div>
        <div className="dr-parties">
          <span className="party-tag party-tag--a">
            A: {dispute.contract_terms.payer.slice(0, 8)}…
          </span>
          <span className="party-tag party-tag--b">
            B: {dispute.contract_terms.receiver.slice(0, 8)}…
          </span>
        </div>
      </div>

      <div className="dr-right">
        <div className="dr-amount">
          {dispute.contract_terms.total_amount} sBTC
        </div>
        <span
          className="dr-status"
          style={{
            color: statusColor(dispute.status),
            borderColor: statusColor(dispute.status) + "40",
            background: statusColor(dispute.status) + "12",
          }}
        >
          {needsAction && <span className="urgent-dot" />}
          {statusLabel(dispute.status)}
        </span>
        <div className="dr-time">{timeAgo(dispute.updated_at)}</div>
      </div>

      <div className="dr-arrow">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────

export default function ArbitratorDashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const { walletAddress, disputes, summary, dashboardLoading, dashboardError } =
    useSelector((s: RootState) => s.arbitrator);

  useEffect(() => {
    if (walletAddress) dispatch(fetchArbitratorDashboardThunk(walletAddress));
  }, [walletAddress, dispatch]);

  function openDispute(d: Dispute) {
    dispatch(
      fetchDisputeDetailThunk({
        agreementId: d.agreement_id,
        milestoneIndex: d.milestone_index,
      }),
    );
  }

  const needsAction = disputes.filter((d) => d.status === "ai_complete");
  const pending = disputes.filter((d) =>
    [
      "awaiting_statements",
      "party_a_submitted",
      "party_b_submitted",
      "ai_pending",
    ].includes(d.status),
  );
  const resolved = disputes.filter((d) =>
    ["resolved", "auto_refunded"].includes(d.status),
  );

  return (
    <div className="dash-root">
      <style>{css}</style>

      {/* Topbar */}
      <nav className="dash-nav">
        <div className="nav-brand">
          <span className="nav-logo">Clause</span>
          <span className="nav-logo-thin">Ai</span>
          <span className="nav-pipe">|</span>
          <span className="nav-role">Arbitrator</span>
        </div>
        <div className="nav-right">
          <div className="wallet-chip">
            <div className="wallet-dot" />
            <span className="wallet-addr">
              {walletAddress?.slice(0, 10)}…{walletAddress?.slice(-6)}
            </span>
          </div>
          <button className="btn-ghost" onClick={() => dispatch(disconnect())}>
            Disconnect
          </button>
        </div>
      </nav>

      <div className="dash-body">
        {/* Header */}
        <div className="dash-header fade-up">
          <div>
            <div className="section-eyebrow">Arbitrator Dashboard</div>
            <h1 className="dash-title">Dispute Cases</h1>
          </div>
          <button
            className="btn-refresh"
            onClick={() =>
              walletAddress &&
              dispatch(fetchArbitratorDashboardThunk(walletAddress))
            }
            disabled={dashboardLoading}
          >
            {dashboardLoading ? (
              <span className="spinner sm" />
            ) : (
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            )}
            Refresh
          </button>
        </div>

        {/* Stats */}
        {summary && (
          <div className="stats-row fade-up d1">
            {[
              { label: "Total Cases", value: summary.total, accent: "#94a3b8" },
              {
                label: "Needs Decision",
                value: summary.needs_decision,
                accent: "#f59e0b",
              },
              { label: "Pending", value: summary.pending, accent: "#60a5fa" },
              { label: "Resolved", value: summary.resolved, accent: "#34d399" },
            ].map(({ label, value, accent }) => (
              <div key={label} className="stat-card">
                <div className="stat-label">{label}</div>
                <div className="stat-value" style={{ color: accent }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        )}

        {dashboardError && (
          <div className="error-box fade-in">{dashboardError}</div>
        )}

        {dashboardLoading && !disputes.length ? (
          <div className="loading-state">
            <span className="spinner lg" />
            <span>Loading your cases…</span>
          </div>
        ) : disputes.length === 0 ? (
          <div className="empty-state fade-up d2">
            <div className="empty-icon">⚖</div>
            <h3>No disputes assigned</h3>
            <p>
              Cases will appear here when your wallet address is designated as
              arbitrator for an agreement.
            </p>
          </div>
        ) : (
          <div className="disputes-list fade-up d2">
            {needsAction.length > 0 && (
              <div className="group">
                <div className="group-label">
                  <span className="urgent-dot" />
                  Needs Your Decision · {needsAction.length}
                </div>
                {needsAction.map((d) => (
                  <DisputeRow
                    key={`${d.agreement_id}-${d.milestone_index}`}
                    dispute={d}
                    onOpen={() => openDispute(d)}
                  />
                ))}
              </div>
            )}

            {pending.length > 0 && (
              <div className="group">
                <div className="group-label">
                  Awaiting Parties · {pending.length}
                </div>
                {pending.map((d) => (
                  <DisputeRow
                    key={`${d.agreement_id}-${d.milestone_index}`}
                    dispute={d}
                    onOpen={() => openDispute(d)}
                  />
                ))}
              </div>
            )}

            {resolved.length > 0 && (
              <div className="group">
                <div className="group-label">Resolved · {resolved.length}</div>
                {resolved.map((d) => (
                  <DisputeRow
                    key={`${d.agreement_id}-${d.milestone_index}`}
                    dispute={d}
                    onOpen={() => openDispute(d)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .dash-root {
    min-height: 100vh;
    background: #080c0a;
    font-family: 'DM Sans', sans-serif;
    color: #f0faf5;
  }

  /* Nav */
  .dash-nav {
    position: sticky; top: 0; z-index: 100;
    height: 54px;
    background: rgba(8,12,10,0.9); backdrop-filter: blur(20px);
    border-bottom: 1px solid rgba(52,211,153,0.1);
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 36px;
  }
  .nav-brand { display: flex; align-items: center; gap: 6px; }
  .nav-logo { font-size: 15px; font-weight: 700; color: #f0faf5; letter-spacing: -0.03em; }
  .nav-logo-thin { font-size: 15px; font-weight: 300; color: rgba(240,250,245,0.4); letter-spacing: -0.03em; }
  .nav-pipe { color: rgba(52,211,153,0.3); margin: 0 2px; }
  .nav-role { font-size: 11px; font-family: 'DM Mono', monospace; color: #34d399; letter-spacing: 0.06em; text-transform: uppercase; }
  .nav-right { display: flex; align-items: center; gap: 10px; }
  .wallet-chip {
    display: flex; align-items: center; gap: 8px;
    background: rgba(52,211,153,0.06); border: 1px solid rgba(52,211,153,0.15);
    border-radius: 20px; padding: 5px 14px;
  }
  .wallet-dot { width: 6px; height: 6px; border-radius: 50%; background: #34d399; }
  .wallet-addr { font-size: 11px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.6); }

  /* Body */
  .dash-body { max-width: 900px; margin: 0 auto; padding: 48px 24px 80px; }

  .dash-header {
    display: flex; align-items: flex-end; justify-content: space-between;
    margin-bottom: 32px; flex-wrap: wrap; gap: 14px;
  }
  .section-eyebrow {
    font-family: 'DM Mono', monospace; font-size: 10px;
    color: #34d399; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 8px;
  }
  .dash-title {
    font-family: 'DM Serif Display', serif; font-size: 42px;
    letter-spacing: -0.03em; color: #f0faf5;
  }

  /* Stats */
  .stats-row {
    display: grid; grid-template-columns: repeat(4,1fr); gap: 12px;
    margin-bottom: 36px;
  }
  @media (max-width: 600px) { .stats-row { grid-template-columns: 1fr 1fr; } }
  .stat-card {
    background: rgba(12,18,14,0.8); border: 1px solid rgba(52,211,153,0.1);
    border-radius: 14px; padding: 18px 20px;
  }
  .stat-label { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.35); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
  .stat-value { font-family: 'DM Serif Display', serif; font-size: 32px; letter-spacing: -0.03em; }

  /* Groups */
  .disputes-list { display: flex; flex-direction: column; gap: 28px; }
  .group { display: flex; flex-direction: column; gap: 8px; }
  .group-label {
    display: flex; align-items: center; gap: 8px;
    font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.35);
    text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px;
  }

  /* Dispute Row */
  .dispute-row {
    display: flex; align-items: center; gap: 16px;
    background: rgba(12,18,14,0.7); border: 1px solid rgba(52,211,153,0.1);
    border-radius: 14px; padding: 16px 20px;
    cursor: pointer; transition: border-color 0.2s, background 0.2s;
  }
  .dispute-row:hover { border-color: rgba(52,211,153,0.3); background: rgba(52,211,153,0.03); }
  .dispute-row--urgent { border-color: rgba(245,158,11,0.25); }
  .dispute-row--urgent:hover { border-color: rgba(245,158,11,0.5); background: rgba(245,158,11,0.03); }

  .dr-left { flex: 1; min-width: 0; }
  .dr-id { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .dr-agr { font-family: 'DM Mono', monospace; font-size: 12px; font-weight: 500; color: #f0faf5; }
  .dr-ms { font-family: 'DM Mono', monospace; font-size: 11px; color: rgba(240,250,245,0.35); }
  .dr-desc { font-size: 13px; color: rgba(240,250,245,0.6); margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 380px; }
  .dr-parties { display: flex; gap: 6px; }
  .party-tag {
    font-size: 10px; font-family: 'DM Mono', monospace;
    border-radius: 6px; padding: 2px 8px; border: 1px solid;
  }
  .party-tag--a { color: #60a5fa; border-color: rgba(96,165,250,0.25); background: rgba(96,165,250,0.08); }
  .party-tag--b { color: #f472b6; border-color: rgba(244,114,182,0.25); background: rgba(244,114,182,0.08); }

  .dr-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
  .dr-amount { font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 500; color: #f0faf5; }
  .dr-status {
    font-size: 10px; font-family: 'DM Mono', monospace; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em;
    border: 1px solid; border-radius: 8px; padding: 3px 10px;
    display: flex; align-items: center; gap: 6px;
  }
  .dr-time { font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(240,250,245,0.25); }
  .dr-arrow { color: rgba(240,250,245,0.2); flex-shrink: 0; }

  .urgent-dot { width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; display: inline-block; animation: pulse 1.5s ease infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

  /* Buttons */
  .btn-ghost {
    padding: 6px 14px; background: transparent;
    border: 1px solid rgba(52,211,153,0.2); border-radius: 8px;
    font-family: 'DM Sans', sans-serif; font-size: 12px; color: rgba(240,250,245,0.5);
    cursor: pointer; transition: all 0.2s;
  }
  .btn-ghost:hover { border-color: rgba(52,211,153,0.4); color: rgba(240,250,245,0.8); }

  .btn-refresh {
    display: flex; align-items: center; gap: 7px;
    padding: 8px 16px; background: rgba(52,211,153,0.08);
    border: 1px solid rgba(52,211,153,0.2); border-radius: 10px;
    font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 500; color: #34d399;
    cursor: pointer; transition: all 0.2s;
  }
  .btn-refresh:hover:not(:disabled) { background: rgba(52,211,153,0.14); }
  .btn-refresh:disabled { opacity: 0.5; cursor: not-allowed; }

  /* States */
  .loading-state {
    display: flex; flex-direction: column; align-items: center; gap: 14px;
    padding: 80px 0; color: rgba(240,250,245,0.35);
    font-size: 13px; font-family: 'DM Mono', monospace;
  }
  .empty-state {
    text-align: center; padding: 80px 24px;
    background: rgba(12,18,14,0.5); border: 1px dashed rgba(52,211,153,0.12);
    border-radius: 16px;
  }
  .empty-icon { font-size: 40px; margin-bottom: 16px; }
  .empty-state h3 { font-family: 'DM Serif Display', serif; font-size: 22px; color: #f0faf5; margin-bottom: 10px; }
  .empty-state p { font-size: 13px; color: rgba(240,250,245,0.4); line-height: 1.7; max-width: 360px; margin: 0 auto; }

  .error-box {
    background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
    border-radius: 10px; padding: 12px 16px;
    font-size: 12px; color: #f87171; font-family: 'DM Mono', monospace;
    margin-bottom: 20px;
  }

  /* Spinner */
  .spinner { display: inline-block; border: 2px solid rgba(52,211,153,0.2); border-top-color: #34d399; border-radius: 50%; animation: spin 0.7s linear infinite; }
  .spinner.sm { width: 14px; height: 14px; }
  .spinner.lg { width: 28px; height: 28px; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Anim */
  .fade-up { animation: fadeUp 0.4s ease both; }
  .d1 { animation-delay: 0.06s; }
  .d2 { animation-delay: 0.12s; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
`;
