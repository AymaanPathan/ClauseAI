"use client";
import { useState, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setScreen,
  generateShareLink,
  setCounterpartyConnected,
} from "../../store/slices/agreementSlice";

export default function ScreenShareLink() {
  const dispatch = useAppDispatch();
  const { shareLink, agreementId, walletAddress, editedTerms } = useAppSelector(
    (s) => s.agreement,
  );
  const [copied, setCopied] = useState(false);
  const [mockWaiting, setMockWaiting] = useState(false);
  const [counterpartyJoined, setCounterpartyJoined] = useState(false);

  useEffect(() => {
    if (!shareLink) dispatch(generateShareLink());
  }, []);

  function handleCopy() {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function simulateCounterparty() {
    setMockWaiting(true);
    setTimeout(() => {
      const mockAddr =
        "SP" + Math.random().toString(36).substring(2, 10).toUpperCase();
      dispatch(setCounterpartyConnected(mockAddr));
      setCounterpartyJoined(true);
      setMockWaiting(false);
    }, 2000);
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
      <div style={{ maxWidth: 520, width: "100%" }}>
        <div className="animate-fade-up" style={{ marginBottom: 36 }}>
          <button
            onClick={() => dispatch(setScreen("connect-wallet"))}
            style={{
              background: "none",
              border: "none",
              color: "var(--grey-1)",
              fontSize: 13,
              cursor: "pointer",
              marginBottom: 20,
            }}
          >
            ← Back
          </button>
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
            Step 5 of 6
          </span>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-1px",
              marginBottom: 8,
            }}
          >
            Share with {editedTerms?.partyB || "the other party"}
          </h2>
          <p style={{ color: "var(--grey-1)", fontSize: 14 }}>
            Send this link to {editedTerms?.partyB || "them"}. They&apos;ll
            review the terms and connect their wallet.
          </p>
        </div>

        {/* Agreement ID badge */}
        {agreementId && (
          <div
            className="animate-fade-up delay-1"
            style={{
              background: "var(--black-2)",
              border: "1px solid var(--black-4)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--grey-1)",
              }}
            >
              Agreement ID
            </span>
            <span
              style={{
                fontSize: 14,
                fontFamily: "var(--font-mono)",
                color: "var(--yellow)",
                fontWeight: 600,
              }}
            >
              #{agreementId}
            </span>
          </div>
        )}

        {/* Link box */}
        <div
          className="animate-fade-up delay-2"
          style={{
            background: "var(--black-2)",
            border: "1px solid var(--black-4)",
            borderRadius: "var(--radius)",
            padding: 4,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              flex: 1,
              padding: "12px 14px",
              fontSize: 13,
              fontFamily: "var(--font-mono)",
              color: "var(--grey-1)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {shareLink ?? "Generating..."}
          </div>
          <button
            onClick={handleCopy}
            style={{
              background: copied ? "#22c55e20" : "var(--yellow-dim)",
              border: `1px solid ${copied ? "#22c55e" : "var(--yellow)"}`,
              color: copied ? "#22c55e" : "var(--yellow)",
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              whiteSpace: "nowrap",
              transition: "all var(--transition)",
            }}
          >
            {copied ? "✓ Copied" : "Copy Link"}
          </button>
        </div>

        {/* Status panels */}
        <div
          className="animate-fade-up delay-3"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginBottom: 28,
          }}
        >
          {/* Party A status */}
          <div
            style={{
              background: "var(--black-2)",
              border: "1px solid #22c55e40",
              borderRadius: "var(--radius-sm)",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#22c55e",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#22c55e" }}>
                ✅ You&apos;re connected
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--grey-1)",
                  marginTop: 2,
                }}
              >
                {walletAddress}
              </div>
            </div>
          </div>

          {/* Party B status */}
          <div
            style={{
              background: "var(--black-2)",
              border: `1px solid ${counterpartyJoined ? "#22c55e40" : "var(--black-4)"}`,
              borderRadius: "var(--radius-sm)",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: counterpartyJoined ? "#22c55e" : "var(--grey-2)",
                display: "inline-block",
                flexShrink: 0,
                ...(mockWaiting
                  ? { animation: "pulse-yellow 1s infinite" }
                  : {}),
              }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: counterpartyJoined ? "#22c55e" : "var(--grey-1)",
                }}
              >
                {counterpartyJoined
                  ? `✅ ${editedTerms?.partyB || "Counterparty"} connected`
                  : mockWaiting
                    ? "Waiting for counterparty..."
                    : `Waiting for ${editedTerms?.partyB || "counterparty"}...`}
              </div>
              {!counterpartyJoined && !mockWaiting && (
                <div
                  style={{ fontSize: 11, color: "var(--grey-2)", marginTop: 2 }}
                >
                  Share the link above
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Simulate for demo */}
        {!counterpartyJoined && (
          <button
            onClick={simulateCounterparty}
            disabled={mockWaiting}
            style={{
              width: "100%",
              padding: "13px",
              background: "transparent",
              color: "var(--grey-1)",
              border: "1px dashed var(--black-5)",
              borderRadius: "var(--radius)",
              fontSize: 13,
              cursor: "pointer",
              marginBottom: 12,
              fontFamily: "var(--font-mono)",
              transition: "all var(--transition)",
            }}
          >
            {mockWaiting
              ? "⏳ Waiting..."
              : "🧪 Simulate counterparty joining (demo)"}
          </button>
        )}

        {counterpartyJoined && (
          <button
            onClick={() => dispatch(setScreen("lock-funds"))}
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
              animation: "fadeUp 0.4s ease",
            }}
          >
            Both Connected → Lock Funds →
          </button>
        )}
      </div>
    </div>
  );
}
