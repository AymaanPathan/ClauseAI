"use client";
// ============================================================
// components/screens/Arbitrator/ArbitratorConnectWallet.tsx
// ============================================================

import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/store";
import { connectArbitratorWalletThunk } from "@/store/slices/arbitratorSlice";

export default function ArbitratorConnectWallet() {
  const dispatch = useDispatch<AppDispatch>();
  const { connecting, connectError } = useSelector(
    (s: RootState) => s.arbitrator,
  );

  return (
    <div className="arb-root">
      <style>{css}</style>

      <div className="bg-grid" />
      <div className="bg-glow" />

      <div className="connect-card fade-up">
        {/* Badge */}
        <div className="badge">
          <span className="badge-dot" />
          Arbitration Portal
        </div>

        {/* Gavel icon */}
        <div className={`icon-ring ${connecting ? "icon-ring--active" : ""}`}>
          {connecting ? (
            <span className="spinner" />
          ) : (
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m14.5 12.5-8 8a2.119 2.119 0 0 1-3-3l8-8" />
              <path d="m16 16 6-6" />
              <path d="m8 8 6-6" />
              <path d="m9 7 8 8" />
              <path d="m21 11-8-8" />
            </svg>
          )}
        </div>

        <h1 className="connect-title">
          Arbitrator
          <br />
          <span className="connect-subtitle">Access Portal</span>
        </h1>

        <p className="connect-desc">
          Connect your Leather wallet to review assigned disputes, examine
          evidence from both parties, and deliver binding verdicts on the Stacks
          blockchain.
        </p>

        <div className="feature-list">
          {[
            { icon: "⚖", text: "Review AI-generated verdicts" },
            { icon: "📄", text: "Examine evidence from both parties" },
            { icon: "🔐", text: "Deliver binding on-chain decisions" },
          ].map(({ icon, text }) => (
            <div key={text} className="feature-row">
              <span className="feature-icon">{icon}</span>
              <span className="feature-text">{text}</span>
            </div>
          ))}
        </div>

        {connectError && (
          <div className="error-box fade-in">⚠ {connectError}</div>
        )}

        <button
          className="btn-connect"
          onClick={() => dispatch(connectArbitratorWalletThunk())}
          disabled={connecting}
        >
          {connecting ? (
            <>
              <span className="spinner sm" /> Connecting to Leather…
            </>
          ) : (
            "Connect Leather Wallet →"
          )}
        </button>

        <p className="connect-note">
          Only wallets designated as arbitrator for a dispute will see cases.
        </p>
      </div>
    </div>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap');

  .arb-root {
    min-height: 100vh;
    background: #080c0a;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    font-family: 'DM Sans', sans-serif;
    position: relative; overflow: hidden;
  }

  .bg-grid {
    position: absolute; inset: 0; pointer-events: none;
    background-image:
      repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(52,211,153,0.03) 59px, rgba(52,211,153,0.03) 60px),
      repeating-linear-gradient(0deg, transparent, transparent 59px, rgba(52,211,153,0.03) 59px, rgba(52,211,153,0.03) 60px);
  }

  .bg-glow {
    position: absolute; top: 20%; left: 50%; transform: translate(-50%,-50%);
    width: 700px; height: 500px; border-radius: 50%;
    background: radial-gradient(ellipse, rgba(52,211,153,0.06) 0%, transparent 65%);
    pointer-events: none;
  }

  .connect-card {
    position: relative; z-index: 2;
    background: rgba(12,18,14,0.9);
    border: 1px solid rgba(52,211,153,0.15);
    border-radius: 20px;
    padding: 48px 44px;
    max-width: 460px; width: 100%;
    backdrop-filter: blur(20px);
    box-shadow: 0 0 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(52,211,153,0.08);
  }

  .badge {
    display: inline-flex; align-items: center; gap: 7px;
    background: rgba(52,211,153,0.08); border: 1px solid rgba(52,211,153,0.2);
    border-radius: 20px; padding: 5px 14px;
    font-family: 'DM Mono', monospace; font-size: 10px; color: #34d399;
    letter-spacing: 0.08em; text-transform: uppercase;
    margin-bottom: 32px;
  }
  .badge-dot {
    width: 6px; height: 6px; border-radius: 50%; background: #34d399;
    animation: pulse 2s ease infinite;
  }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

  .icon-ring {
    width: 80px; height: 80px; border-radius: 50%;
    background: rgba(52,211,153,0.06); border: 1px solid rgba(52,211,153,0.2);
    display: flex; align-items: center; justify-content: center;
    margin: 0 0 28px;
    color: #34d399;
    transition: all 0.3s;
  }
  .icon-ring--active { border-color: rgba(52,211,153,0.5); background: rgba(52,211,153,0.1); }

  .connect-title {
    font-family: 'DM Serif Display', serif;
    font-size: 40px; line-height: 1.05; letter-spacing: -0.02em;
    color: #f0faf5; margin-bottom: 14px;
  }
  .connect-subtitle {
    font-style: italic; color: rgba(240,250,245,0.45); font-weight: 400;
  }
  .connect-desc {
    font-size: 14px; line-height: 1.75; color: rgba(240,250,245,0.55);
    margin-bottom: 28px;
  }

  .feature-list {
    display: flex; flex-direction: column; gap: 10px; margin-bottom: 28px;
  }
  .feature-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 14px;
    background: rgba(52,211,153,0.04); border: 1px solid rgba(52,211,153,0.1);
    border-radius: 10px;
  }
  .feature-icon { font-size: 16px; flex-shrink: 0; }
  .feature-text { font-size: 13px; color: rgba(240,250,245,0.7); }

  .error-box {
    background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25);
    border-radius: 10px; padding: 10px 14px;
    font-size: 12px; color: #f87171; margin-bottom: 16px;
    font-family: 'DM Mono', monospace;
  }

  .btn-connect {
    width: 100%; padding: 14px 24px;
    background: linear-gradient(135deg, #34d399, #059669);
    border: none; border-radius: 12px; cursor: pointer;
    font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 600;
    color: #080c0a; letter-spacing: -0.01em;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: opacity 0.2s, transform 0.15s;
    margin-bottom: 14px;
  }
  .btn-connect:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
  .btn-connect:active:not(:disabled) { transform: translateY(0); }
  .btn-connect:disabled { opacity: 0.5; cursor: not-allowed; }

  .connect-note {
    font-size: 11px; font-family: 'DM Mono', monospace;
    color: rgba(240,250,245,0.25); text-align: center;
  }

  /* Shared */
  .spinner {
    display: inline-block; width: 18px; height: 18px;
    border: 2px solid rgba(8,12,10,0.3); border-top-color: #080c0a;
    border-radius: 50%; animation: spin 0.7s linear infinite;
  }
  .spinner.sm { width: 14px; height: 14px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .fade-up { animation: fadeUp 0.4s ease both; }
  .fade-in { animation: fadeIn 0.3s ease both; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
`;
