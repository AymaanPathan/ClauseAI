"use client";
import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setScreen, connectWalletThunk } from "@/store/slices/agreementSlice";

export default function ScreenConnectWallet() {
  const dispatch = useAppDispatch();
  const { walletConnected, walletAddress, isPartyB } = useAppSelector(
    (s) => s.agreement,
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Party A → set-arbitrator, Party B → approve-agreement (skips arbitrator step)
  function nextScreen() {
    dispatch(setScreen(isPartyB ? "approve-agreement" : "set-arbitrator"));
  }

  async function handleConnect() {
    setIsConnecting(true);
    setError(null);
    try {
      const result = await dispatch(connectWalletThunk());
      if (connectWalletThunk.fulfilled.match(result)) {
        nextScreen();
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
      <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
        <div className="fade-up">
          <button
            onClick={() => dispatch(setScreen("parsed-terms"))}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-3)",
              fontSize: 11,
              cursor: "pointer",
              marginBottom: 32,
              fontFamily: "var(--mono)",
              letterSpacing: "0.04em",
            }}
          >
            ← Back
          </button>

          {/* Status icon */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: walletConnected
                ? "rgba(34,197,94,0.06)"
                : "var(--bg-3)",
              border: `1px solid ${walletConnected ? "rgba(34,197,94,0.2)" : "var(--border-hi)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 28px",
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
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            )}
          </div>

          <div
            className="step-counter"
            style={{ marginBottom: 12, display: "block" }}
          >
            Step 4 of 6
          </div>

          <h2
            style={{
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
              marginBottom: 10,
            }}
          >
            {walletConnected ? "Wallet Connected" : "Connect your wallet"}
          </h2>

          <p
            style={{
              color: "var(--text-2)",
              fontSize: 13,
              lineHeight: 1.7,
              marginBottom: 32,
            }}
          >
            {walletConnected
              ? `Connected: ${walletAddress?.slice(0, 10)}...${walletAddress?.slice(-6)}`
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
              style={{ flexShrink: 0, marginTop: 1 }}
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
              onClick={nextScreen}
              style={{ width: "100%" }}
            >
              Continue — {isPartyB ? "Review Agreement" : "Choose Arbitrator"}
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
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  Connecting to Leather...
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

        {/* Info cards */}
        <div
          className="fade-up d3"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginTop: 32,
          }}
        >
          {[
            {
              title: "Non-custodial escrow",
              desc: "ClauseAi never holds your keys. Funds go directly into the smart contract, enforced by Bitcoin.",
            },
            {
              title: "Only payers deposit",
              desc: "The receiver doesn't need to lock any funds. Only you, as the payer, deposit into escrow.",
            },
          ].map(({ title, desc }) => (
            <div
              key={title}
              style={{
                padding: "14px 16px",
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
