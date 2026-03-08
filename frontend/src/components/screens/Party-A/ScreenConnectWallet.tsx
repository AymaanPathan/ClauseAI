"use client";

import { useState } from "react";

import { setScreen, connectWalletThunk } from "@/store/slices/partyASlice";
import { AppDispatch, RootState } from "@/store";
import { useDispatch, useSelector } from "react-redux";

export default function ScreenConnectWallet() {
  const dispatch = useDispatch<AppDispatch>();
  const { walletConnected, walletAddress } = useSelector(
    (s: RootState) => s.partyA,
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setIsConnecting(true);
    setError(null);
    try {
      const result = await dispatch(connectWalletThunk());
      if (connectWalletThunk.fulfilled.match(result)) {
        dispatch(setScreen("lock-funds"));
      } else {
        setError((result.payload as string) ?? "Wallet connect failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="page">
      <style>{css}</style>
      <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
        <div className="fade-up">
          <button
            className="back-btn"
            onClick={() => dispatch(setScreen("share-link"))}
          >
            ← Back
          </button>

          <div
            className="wallet-icon"
            style={{
              background: walletConnected
                ? "rgba(34,197,94,0.06)"
                : "var(--bg-3)",
              borderColor: walletConnected
                ? "rgba(34,197,94,0.2)"
                : "var(--border-hi)",
            }}
          >
            {walletConnected ? (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--green)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : isConnecting ? (
              <span className="spinner" style={{ width: 22, height: 22 }} />
            ) : (
              <svg
                width="22"
                height="22"
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

          <div className="step-badge">Step 6 of 6</div>
          <h2 className="page-title">
            {walletConnected ? "Wallet connected" : "Connect your wallet"}
          </h2>
          <p
            style={{
              color: "var(--text-2)",
              fontSize: 13,
              lineHeight: 1.7,
              marginBottom: 28,
            }}
          >
            {walletConnected
              ? `Connected: ${walletAddress?.slice(0, 10)}…${walletAddress?.slice(-6)}`
              : "Connect your Leather wallet to deploy the escrow contract and lock funds on Stacks."}
          </p>
        </div>

        {error && (
          <div
            className="error-box fade-in"
            style={{ marginBottom: 16, textAlign: "left" }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {error}
          </div>
        )}

        <div
          className="fade-up d2"
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          {walletConnected ? (
            <button
              className="btn btn-primary btn-lg"
              onClick={() => dispatch(setScreen("lock-funds"))}
              style={{ width: "100%" }}
            >
              Continue — Lock Funds
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
          ) : (
            <button
              className="btn btn-primary btn-lg"
              onClick={handleConnect}
              disabled={isConnecting}
              style={{ width: "100%" }}
            >
              {isConnecting ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14 }} />{" "}
                  Connecting to Leather…
                </>
              ) : (
                "Connect Leather Wallet"
              )}
            </button>
          )}
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

        {/* Info */}
        <div
          className="fade-up d3"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginTop: 28,
          }}
        >
          {[
            {
              title: "Non-custodial escrow",
              desc: "ClauseAI never holds your keys. Funds go directly into the smart contract, enforced by Bitcoin.",
            },
            {
              title: "Only payers deposit",
              desc: "The receiver doesn't need to lock any funds. Only you, as the payer, deposit into escrow.",
            },
          ].map(({ title, desc }) => (
            <div
              key={title}
              style={{
                padding: "12px 14px",
                background: "var(--bg-1)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                display: "flex",
                gap: 12,
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  flexShrink: 0,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--bg-3)",
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
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-1)",
                    marginBottom: 3,
                  }}
                >
                  {title}
                </div>
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--text-3)",
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const css = `
.back-btn {
  background: none; border: none; color: var(--text-3); font-size: 11px;
  cursor: pointer; margin-bottom: 32px; font-family: var(--mono); letter-spacing: 0.04em; display: block;
}
.wallet-icon {
  width: 64px; height: 64px; border-radius: 50%; border: 1px solid;
  display: flex; align-items: center; justify-content: center; margin: 0 auto 28px; transition: all 0.3s;
}
.step-badge {
  font-size: 10px; font-family: var(--mono); color: var(--text-4);
  letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 12px; display: block;
}
.page-title {
  font-size: 32px; font-weight: 700; letter-spacing: -0.04em; line-height: 1.1; margin-bottom: 10px;
}
`;
