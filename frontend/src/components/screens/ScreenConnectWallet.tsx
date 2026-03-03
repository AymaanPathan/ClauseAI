"use client";
import { useState } from "react";
import { useAppDispatch } from "@/store/hooks";
import {
  connectWallet,
  setScreen,
} from "../../../useAppSelector/slices/agreementSlice";

export default function ScreenConnectWallet() {
  const dispatch = useAppDispatch();
  const [connecting, setConnecting] = useState(false);

  function handleConnect() {
    setConnecting(true);
    // Mock wallet connection — replace with Hiro wallet SDK on Day 6
    setTimeout(() => {
      const mockAddr =
        "SP" + Math.random().toString(36).substring(2, 10).toUpperCase();
      dispatch(connectWallet(mockAddr));
      dispatch(setScreen("share-link"));
    }, 1400);
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
        <div className="animate-fade-up" style={{ marginBottom: 40 }}>
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

          {/* Bitcoin icon */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "var(--yellow-dim)",
              border: "1px solid var(--yellow)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              margin: "0 auto 28px",
              animation: "pulse-yellow 2s infinite",
            }}
          >
            ₿
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
            Connect your wallet
          </h2>
          <p style={{ color: "var(--grey-1)", fontSize: 14, lineHeight: 1.7 }}>
            Connect your Hiro Wallet to sign and lock sBTC on the Stacks
            blockchain. Your funds stay in your control until both parties sign.
          </p>
        </div>

        <div
          className="animate-fade-up delay-2"
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <button
            onClick={handleConnect}
            disabled={connecting}
            style={{
              width: "100%",
              padding: "16px",
              background: connecting ? "var(--black-4)" : "var(--yellow)",
              color: connecting ? "var(--grey-2)" : "var(--black)",
              border: "none",
              borderRadius: "var(--radius)",
              fontSize: 15,
              fontWeight: 700,
              cursor: connecting ? "not-allowed" : "pointer",
              transition: "all var(--transition)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            {connecting ? (
              <>
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
                Connecting...
              </>
            ) : (
              "Connect Hiro Wallet"
            )}
          </button>

          <div
            style={{
              fontSize: 12,
              color: "var(--grey-2)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Don&apos;t have Hiro Wallet?{" "}
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

        <div
          className="animate-fade-up delay-3"
          style={{
            marginTop: 40,
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
              Non-custodial
            </div>
            <p
              style={{ fontSize: 12, color: "var(--grey-1)", lineHeight: 1.6 }}
            >
              ClauseAi never holds your keys. Funds go directly into the smart
              contract, enforced by Bitcoin.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
