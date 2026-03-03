"use client";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setScreen } from "@/store/slices/agreementSlice";
import { connectWalletThunk } from "@/store/slices/agreementSlice";

export default function ScreenConnectWallet() {
  const dispatch = useAppDispatch();
  const { walletConnected, walletAddress } = useAppSelector((s) => s.agreement);
  const connecting = useAppSelector(
    (s) => s.agreement.walletAddress === null && false, // use thunk loading state below
  );

  // Track thunk loading via local state driven by dispatch
  async function handleConnect() {
    const result = await dispatch(connectWalletThunk());
    if (connectWalletThunk.fulfilled.match(result)) {
      dispatch(setScreen("share-link"));
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
              animation: "pulse-yellow 2s infinite",
            }}
          >
            {walletConnected ? "✅" : "₿"}
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
              ? `Connected as ${walletAddress}`
              : "Connect your Hiro Wallet to sign and lock sBTC on the Stacks blockchain."}
          </p>
        </div>

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
              Continue →
            </button>
          ) : (
            <button
              onClick={handleConnect}
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
                transition: "all var(--transition)",
              }}
            >
              Connect Hiro Wallet
            </button>
          )}

          <div
            style={{
              fontSize: 12,
              color: "var(--grey-2)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Don't have Hiro Wallet?{" "}
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
