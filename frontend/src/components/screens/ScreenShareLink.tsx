"use client";
import { useState, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setScreen,
  generateShareLink,
  registerPresenceThunk,
  applyPresenceUpdate,
} from "@/store/slices/agreementSlice";
import { hashTerms, subscribePresence } from "../../api/PresenceaApi";

export default function ScreenShareLink() {
  const dispatch = useAppDispatch();
  const {
    shareLink,
    agreementId,
    walletAddress,
    editedTerms,
    counterpartyConnected,
    counterpartyWallet,
    presenceRegistered,
    isPartyB,
  } = useAppSelector((s) => s.agreement);

  const [copied, setCopied] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const receiverName = editedTerms?.partyB || "the receiver";

  useEffect(() => {
    if (!shareLink) dispatch(generateShareLink());
  }, []);

  useEffect(() => {
    if (!agreementId || !walletAddress || presenceRegistered || isPartyB)
      return;
    const termsHash = editedTerms
      ? hashTerms(editedTerms as unknown as Record<string, unknown>)
      : undefined;
    dispatch(
      registerPresenceThunk({
        agreementId,
        role: "partyA",
        address: walletAddress,
        termsHash,
        termsSnapshot: editedTerms
          ? (editedTerms as unknown as Record<string, unknown>)
          : undefined,
      }),
    ).then((result) => {
      if (!registerPresenceThunk.fulfilled.match(result))
        setRegError("Failed to register. Please refresh.");
    });
  }, [
    agreementId,
    walletAddress,
    presenceRegistered,
    isPartyB,
    editedTerms,
    dispatch,
  ]);

  useEffect(() => {
    if (!agreementId || counterpartyConnected) return;
    unsubRef.current?.();
    const unsub = subscribePresence(
      agreementId,
      (p) => dispatch(applyPresenceUpdate(p)),
      () => {},
    );
    unsubRef.current = unsub;
    return () => {
      unsub();
    };
  }, [agreementId, counterpartyConnected, dispatch]);

  useEffect(() => {
    if (counterpartyConnected) {
      unsubRef.current?.();
      unsubRef.current = null;
    }
  }, [counterpartyConnected]);

  function handleCopy() {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="page">
      <div style={{ maxWidth: 520, width: "100%" }}>
        {/* Header */}
        <div className="fade-up" style={{ marginBottom: 36 }}>
          <button
            onClick={() => dispatch(setScreen("set-arbitrator"))}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-3)",
              fontSize: 11,
              cursor: "pointer",
              marginBottom: 20,
              fontFamily: "var(--mono)",
              letterSpacing: "0.04em",
              padding: 0,
            }}
          >
            ← Back
          </button>

          <div
            className="step-counter"
            style={{ marginBottom: 12, display: "block" }}
          >
            Step 5 of 6
          </div>

          <h2
            style={{
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
              marginBottom: 8,
            }}
          >
            Invite {receiverName}
          </h2>
          <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.7 }}>
            Send this link to{" "}
            <strong style={{ color: "var(--text-1)", fontWeight: 500 }}>
              {receiverName}
            </strong>
            . They'll review the terms and connect their wallet.{" "}
            <strong style={{ color: "var(--text-1)", fontWeight: 500 }}>
              They don't need to deposit anything
            </strong>{" "}
            — only you lock funds as the payer.
          </p>
        </div>

        {regError && (
          <div className="error-box fade-in" style={{ marginBottom: 14 }}>
            ⚠ {regError}
          </div>
        )}

        {/* Agreement ID */}
        {agreementId && (
          <div
            className="fade-up d1"
            style={{
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                color: "var(--text-3)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Escrow ID
            </span>
            <span
              style={{
                fontSize: 12,
                fontFamily: "var(--mono)",
                color: "var(--text-1)",
                fontWeight: 500,
              }}
            >
              #{agreementId}
            </span>
          </div>
        )}

        {/* Link box */}
        <div
          className="fade-up d2"
          style={{
            background: "var(--bg-1)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            padding: 4,
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <div
            style={{
              flex: 1,
              padding: "10px 12px",
              fontSize: 12,
              fontFamily: "var(--mono)",
              color: "var(--text-2)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {shareLink ?? "Generating..."}
          </div>
          <button
            onClick={handleCopy}
            className="btn btn-ghost"
            style={{
              fontSize: 11,
              fontFamily: "var(--mono)",
              padding: "8px 14px",
              letterSpacing: "0.04em",
              background: copied ? "rgba(34,197,94,0.06)" : undefined,
              borderColor: copied ? "rgba(34,197,94,0.2)" : undefined,
              color: copied ? "var(--green)" : undefined,
            }}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>

        {/* Roles */}
        <div
          className="fade-up d2"
          style={{
            background: "var(--bg-1)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            padding: "14px 16px",
            marginBottom: 16,
          }}
        >
          <div className="label" style={{ marginBottom: 10 }}>
            Who does what
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {[
              {
                role: "You (Payer)",
                action: "Lock funds in escrow",
                color: "var(--text-1)",
              },
              {
                role: receiverName,
                action: "Connect wallet, review terms",
                color: "var(--text-2)",
              },
              {
                role: "Arbitrator",
                action: "Resolves disputes if needed",
                color: "var(--text-3)",
              },
            ].map(({ role, action, color }) => (
              <div key={role} style={{ display: "flex", gap: 8, fontSize: 12 }}>
                <span
                  style={{
                    color,
                    fontWeight: 500,
                    flexShrink: 0,
                    minWidth: 130,
                  }}
                >
                  {role}
                </span>
                <span style={{ color: "var(--text-3)" }}>— {action}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Status cards */}
        <div
          className="fade-up d3"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 24,
          }}
        >
          <StatusCard
            connected={presenceRegistered}
            label={
              presenceRegistered
                ? "You're registered (Payer)"
                : "Registering..."
            }
            address={walletAddress}
            pulsing={false}
          />
          <StatusCard
            connected={counterpartyConnected}
            label={
              counterpartyConnected
                ? `${receiverName} connected`
                : `Waiting for ${receiverName} to join...`
            }
            address={counterpartyConnected ? counterpartyWallet : null}
            pulsing={!counterpartyConnected}
            subtext={
              !counterpartyConnected ? "Live updates via SSE" : undefined
            }
          />
        </div>

        {/* CTA — now goes to approve-agreement instead of lock-funds */}
        {counterpartyConnected ? (
          <button
            className="btn btn-primary btn-lg fade-in"
            onClick={() => dispatch(setScreen("approve-agreement"))}
            style={{ width: "100%" }}
          >
            {receiverName} Connected — Review &amp; Approve
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
          <div
            style={{
              width: "100%",
              padding: "14px",
              background: "var(--bg-2)",
              border: "1px dashed var(--border)",
              borderRadius: "var(--r)",
              fontSize: 13,
              color: "var(--text-3)",
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <span
              className="dot"
              style={{
                background: "var(--text-4)",
                animation: "pulse-dot 1.5s ease-in-out infinite",
              }}
            />
            Waiting for {receiverName} to connect...
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                color: "var(--text-4)",
                marginLeft: 4,
              }}
            >
              LIVE
            </span>
          </div>
        )}

        <p
          style={{
            marginTop: 16,
            fontSize: 11,
            fontFamily: "var(--mono)",
            color: "var(--text-4)",
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          When {receiverName} opens the link and connects their wallet, this
          page updates automatically.
        </p>
      </div>
    </div>
  );
}

function StatusCard({
  connected,
  label,
  address,
  pulsing,
  subtext,
}: {
  connected: boolean;
  label: string;
  address: string | null;
  pulsing: boolean;
  subtext?: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: `1px solid ${connected ? "rgba(34,197,94,0.15)" : "var(--border)"}`,
        borderRadius: "var(--r-sm)",
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        className="dot"
        style={{
          background: connected ? "var(--green)" : "var(--bg-5)",
          animation: pulsing ? "pulse-dot 1.5s ease-in-out infinite" : "none",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: connected ? "var(--green)" : "var(--text-2)",
            letterSpacing: "-0.01em",
          }}
        >
          {connected ? "✓ " : ""}
          {label}
        </div>
        {address ? (
          <div
            style={{
              fontSize: 10,
              fontFamily: "var(--mono)",
              color: "var(--text-4)",
              marginTop: 2,
            }}
          >
            {address.slice(0, 8)}...{address.slice(-6)}
          </div>
        ) : subtext ? (
          <div
            style={{
              fontSize: 10,
              fontFamily: "var(--mono)",
              color: "var(--text-4)",
              marginTop: 2,
            }}
          >
            {subtext}
          </div>
        ) : null}
      </div>
    </div>
  );
}
