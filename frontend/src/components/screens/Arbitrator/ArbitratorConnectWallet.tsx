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
  .arb-root {
    min-height: 100vh;
    background: #0a0a0a;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    font-family: 'DM Sans', sans-serif;
    position: relative; overflow: hidden;
  }

  .bg-grid {
    position: absolute; inset: 0; pointer-events: none;
    background-image:
      repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(196,255,70,0.03) 59px, rgba(196,255,70,0.03) 60px),
      repeating-linear-gradient(0deg, transparent, transparent 59px, rgba(196,255,70,0.03) 59px, rgba(196,255,70,0.03) 60px);
  }

  .bg-glow {
    position: absolute; top: 20%; left: 50%; transform: translate(-50%,-50%);
    width: 700px; height: 500px; border-radius: 50%;
    background: radial-gradient(ellipse, rgba(196,255,70,0.07) 0%, transparent 65%);
    pointer-events: none;
  }

  .connect-card {
    position: relative; z-index: 2;
    background: rgba(13,13,13,0.95);
    border: 1px solid rgba(196,255,70,0.15);
    border-radius: 20px;
    padding: 48px 44px;
    max-width: 460px; width: 100%;
    backdrop-filter: blur(20px);
    box-shadow: 0 0 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(196,255,70,0.06);
  }

  .badge {
    display: inline-flex; align-items: center; gap: 7px;
    background: rgba(196,255,70,0.07); border: 1px solid rgba(196,255,70,0.22);
    border-radius: 20px; padding: 5px 14px;
    font-family: 'DM Mono', monospace; font-size: 10px; color: #c4ff46;
    letter-spacing: 0.08em; text-transform: uppercase;
    margin-bottom: 32px;
  }
  .badge-dot {
    width: 6px; height: 6px; border-radius: 50%; background: #c4ff46;
    animation: pulse 2s ease infinite;
  }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

  .icon-ring {
    width: 80px; height: 80px; border-radius: 50%;
    background: rgba(196,255,70,0.06); border: 1px solid rgba(196,255,70,0.20);
    display: flex; align-items: center; justify-content: center;
    margin: 0 0 28px;
    color: #c4ff46;
    transition: all 0.3s;
  }
  .icon-ring--active { border-color: rgba(196,255,70,0.50); background: rgba(196,255,70,0.10); }

  .connect-title {
    font-family: 'DM Sans', sans-serif;
    font-size: 40px; line-height: 1.05; letter-spacing: -0.04em; font-weight: 800;
    color: #ffffff; margin-bottom: 14px;
  }
  .connect-subtitle {
    color: rgba(255,255,255,0.35); font-weight: 400; font-size: 36px;
  }
  .connect-desc {
    font-size: 14px; line-height: 1.75; color: rgba(255,255,255,0.45);
    margin-bottom: 28px;
  }

  .feature-list {
    display: flex; flex-direction: column; gap: 8px; margin-bottom: 28px;
  }
  .feature-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 14px;
    background: rgba(196,255,70,0.03); border: 1px solid rgba(196,255,70,0.10);
    border-radius: 8px;
  }
  .feature-icon { font-size: 15px; flex-shrink: 0; }
  .feature-text { font-size: 13px; color: rgba(255,255,255,0.55); }

  .error-box {
    background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25);
    border-radius: 8px; padding: 10px 14px;
    font-size: 12px; color: #f87171; margin-bottom: 16px;
    font-family: 'DM Mono', monospace;
  }

  .btn-connect {
    width: 100%; padding: 14px 24px;
    background: #c4ff46;
    border: none; border-radius: 10px; cursor: pointer;
    font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 700;
    color: #0a0a0a; letter-spacing: -0.02em;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: background 0.15s, transform 0.15s;
    margin-bottom: 14px;
  }
  .btn-connect:hover:not(:disabled) { background: #d4ff60; transform: translateY(-1px); }
  .btn-connect:active:not(:disabled) { transform: translateY(0); }
  .btn-connect:disabled { opacity: 0.4; cursor: not-allowed; }

  .connect-note {
    font-size: 11px; font-family: 'DM Mono', monospace;
    color: rgba(255,255,255,0.20); text-align: center;
  }

  .spinner {
    display: inline-block; width: 18px; height: 18px;
    border: 2px solid rgba(10,10,10,0.25); border-top-color: #0a0a0a;
    border-radius: 50%; animation: spin 0.7s linear infinite;
  }
  .spinner.sm { width: 14px; height: 14px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .fade-up { animation: fadeUp 0.4s ease both; }
  .fade-in { animation: fadeIn 0.3s ease both; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
`;
