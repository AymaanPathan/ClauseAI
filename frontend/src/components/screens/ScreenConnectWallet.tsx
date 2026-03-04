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

  async function handleConnect() {
    setIsConnecting(true);
    setError(null);
    try {
      const result = await dispatch(connectWalletThunk());
      if (connectWalletThunk.fulfilled.match(result)) {
        dispatch(setScreen("share-link"));
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
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        <div className="animate-fade-up">
          <button
            onClick={() => dispatch(setScreen("parsed-terms"))}
            style={{
              background: "none",
              border: "none",
              color: "var(--grey-1)",
              fontSize: 13,
              cursor: "pointer",
              marginBottom: 24,
            }}
          >
            ← Back
          </button>

          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: walletConnected ? "#22c55e15" : "var(--yellow-dim)",
              border: `1px solid ${walletConnected ? "#22c55e" : "var(--yellow)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              margin: "0 auto 28px",
            }}
          >
            {walletConnected ? "✅" : isConnecting ? "⏳" : "₿"}
          </div>

          <span
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--yellow)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              display: "block",
              marginBottom: 12,
            }}
          >
            Step 4 of 6
          </span>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-1px",
              marginBottom: 12,
            }}
          >
            {walletConnected ? "Wallet Connected" : "Connect your wallet"}
          </h2>
          <p
            style={{
              color: "var(--grey-1)",
              fontSize: 14,
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
            style={{
              background: "#7f1d1d20",
              border: "1px solid #7f1d1d",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: "#fca5a5",
              marginBottom: 16,
              textAlign: "left",
            }}
          >
            ❌ {error}
          </div>
        )}

        <div
          className="animate-fade-up delay-2"
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          {walletConnected ? (
            <button
              onClick={() => dispatch(setScreen("share-link"))}
              style={{
                width: "100%",
                padding: "16px",
                background: "var(--yellow)",
                color: "var(--black)",
                border: "none",
                borderRadius: "var(--radius)",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Continue → Invite Receiver
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              style={{
                width: "100%",
                padding: "16px",
                background: isConnecting ? "var(--black-4)" : "var(--yellow)",
                color: isConnecting ? "var(--grey-2)" : "var(--black)",
                border: "none",
                borderRadius: "var(--radius)",
                fontSize: 15,
                fontWeight: 700,
                cursor: isConnecting ? "not-allowed" : "pointer",
                transition: "all var(--transition)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              {isConnecting ? (
                <>
                  <Spinner /> Connecting to Leather...
                </>
              ) : (
                "Connect Leather Wallet"
              )}
            </button>
          )}

          <div
            style={{
              fontSize: 12,
              color: "var(--grey-2)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Don't have Leather?{" "}
            <a
              href="https://wallet.hiro.so"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--yellow)", textDecoration: "none" }}
            >
              Install it free →
            </a>
          </div>
        </div>

        {/* Info boxes */}
        <div
          className="animate-fade-up delay-3"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginTop: 32,
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              background: "var(--black-2)",
              border: "1px solid var(--black-4)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              gap: 12,
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 20 }}>🔒</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Non-custodial escrow
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--grey-1)",
                  lineHeight: 1.6,
                }}
              >
                ClauseAi never holds your keys. Funds go directly into the smart
                contract, enforced by Bitcoin.
              </p>
            </div>
          </div>

          <div
            style={{
              padding: "16px 20px",
              background: "var(--black-2)",
              border: "1px solid var(--black-4)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              gap: 12,
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 20 }}>💸</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Only payers deposit
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--grey-1)",
                  lineHeight: 1.6,
                }}
              >
                The receiver (other party) doesn't need to lock any funds. Only
                you, as the payer, deposit into escrow.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      style={{
        width: 16,
        height: 16,
        border: "2px solid var(--grey-2)",
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        display: "inline-block",
      }}
    />
  );
}
