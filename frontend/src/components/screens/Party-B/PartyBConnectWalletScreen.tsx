"use client";
import { AppDispatch, RootState } from "@/store";
import { useDispatch, useSelector } from "react-redux";
import {
  setScreen,
  connectPartyBWalletThunk,
} from "@/store/slices/partyBSlice";

export default function ScreenPartyBConnectWallet() {
  const dispatch = useDispatch<AppDispatch>();
  const { connecting, connectError, walletConnected, walletAddress } =
    useSelector((s: RootState) => s.partyB);

  async function handleConnect() {
    const result = await dispatch(connectPartyBWalletThunk());
    if (connectPartyBWalletThunk.fulfilled.match(result)) {
      dispatch(setScreen("approve"));
    }
  }

  return (
    <div className="page">
      <style>{css}</style>
      <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
        <div className="fade-up">
          <button
            className="back-btn"
            onClick={() => dispatch(setScreen("review"))}
          >
            ← Back
          </button>

          {/* Icon */}
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
            ) : connecting ? (
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

          <div className="step-badge">Step 2 of 4</div>
          <h2 className="page-title">
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
              ? `Connected: ${walletAddress?.slice(0, 10)}…${walletAddress?.slice(-6)}`
              : "Connect your Leather wallet to approve the agreement."}
          </p>
        </div>

        {connectError && (
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
            {connectError}
          </div>
        )}

        <div
          className="fade-up d2"
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          {walletConnected ? (
            <button
              className="btn btn-primary btn-lg"
              onClick={() => dispatch(setScreen("approve"))}
              style={{ width: "100%" }}
            >
              Continue — Approve Agreement
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
              disabled={connecting}
              style={{ width: "100%" }}
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
      </div>
    </div>
  );
}

const css = `
.back-btn {
  background: none; border: none; color: var(--text-3); font-size: 11px;
  cursor: pointer; margin-bottom: 32px; font-family: var(--mono);
  letter-spacing: 0.04em; display: block;
}
.wallet-icon {
  width: 64px; height: 64px; border-radius: 50%;
  border: 1px solid; display: flex; align-items: center; justify-content: center;
  margin: 0 auto 28px; transition: all 0.3s;
}
.step-badge {
  font-size: 10px; font-family: var(--mono); color: var(--text-4);
  letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 12px; display: block;
}
.page-title {
  font-size: 32px; font-weight: 700; letter-spacing: -0.04em; line-height: 1.1; margin-bottom: 10px;
}
`;
