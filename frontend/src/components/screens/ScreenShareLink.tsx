"use client";
// ============================================================
// ScreenShareLink.tsx — PRODUCTION UPDATE
// Key changes:
//   • Saves editedTerms as termsSnapshot in presence (so Party B can read them)
//   • Uses SSE subscription for real-time Party B detection
//   • Falls back to polling if SSE unavailable
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setScreen,
  generateShareLink,
  registerPresenceThunk,
  pollPresenceThunk,
  applyPresenceUpdate,
} from "@/store/slices/agreementSlice";
import { hashTerms, subscribePresence } from "../../api/PresenceaApi";

const POLL_INTERVAL_MS = 3_000;

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
  const [registrationError, setRegistrationError] = useState<string | null>(
    null,
  );
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // ── Generate share link on mount ─────────────────────────────
  useEffect(() => {
    if (!shareLink) dispatch(generateShareLink());
  }, []);

  // ── Register Party A's presence (with terms snapshot) ────────
  useEffect(() => {
    if (!agreementId || !walletAddress || presenceRegistered || isPartyB)
      return;

    const termsHash = editedTerms ? hashTerms(editedTerms) : undefined;

    dispatch(
      registerPresenceThunk({
        agreementId,
        role: "partyA",
        address: walletAddress,
        termsHash,
        // ★ KEY: Save terms so Party B can read them when they open the link
        termsSnapshot: editedTerms
          ? (editedTerms as unknown as Record<string, unknown>)
          : undefined,
      }),
    ).then((result) => {
      if (!registerPresenceThunk.fulfilled.match(result)) {
        setRegistrationError("Failed to register. Please refresh.");
      }
    });
  }, [
    agreementId,
    walletAddress,
    presenceRegistered,
    isPartyB,
    editedTerms,
    dispatch,
  ]);

  // ── Subscribe to SSE for real-time Party B detection ─────────
  useEffect(() => {
    if (!agreementId || counterpartyConnected) return;

    // Unsubscribe previous if any
    unsubscribeRef.current?.();

    const unsubscribe = subscribePresence(
      agreementId,
      (presence) => {
        dispatch(applyPresenceUpdate(presence));
      },
      () => {
        // SSE error: fall back to polling (handled inside subscribePresence)
      },
    );

    unsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribe();
    };
  }, [agreementId, counterpartyConnected, dispatch]);

  // ── Stop SSE once counterparty connected ─────────────────────
  useEffect(() => {
    if (counterpartyConnected) {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    }
  }, [counterpartyConnected]);

  function handleCopy() {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        {/* Header */}
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
            Send this link to {editedTerms?.partyB || "them"}. They'll review
            the terms and connect their wallet. This page updates in real-time.
          </p>
        </div>

        {registrationError && (
          <div
            style={{
              background: "#7f1d1d20",
              border: "1px solid #7f1d1d",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: "#fca5a5",
              marginBottom: 16,
            }}
          >
            ⚠️ {registrationError}
          </div>
        )}

        {/* Agreement ID */}
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
          {/* Party A */}
          <StatusCard
            connected={presenceRegistered}
            activeLabel="✅ You're registered (Party A)"
            waitingLabel="⏳ Registering..."
            address={walletAddress}
            showPulse={false}
          />

          {/* Party B */}
          <StatusCard
            connected={counterpartyConnected}
            activeLabel={`✅ ${editedTerms?.partyB || "Counterparty"} connected`}
            waitingLabel={`Waiting for ${editedTerms?.partyB || "counterparty"}...`}
            address={counterpartyConnected ? counterpartyWallet : null}
            showPulse={!counterpartyConnected}
            waitingSubtext={`Share the link above — live updates via SSE`}
          />
        </div>

        {/* What Party B sees info box */}
        {presenceRegistered && !counterpartyConnected && (
          <div
            className="animate-fade-up"
            style={{
              background: "var(--black-2)",
              border: "1px solid var(--black-4)",
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 20,
              display: "flex",
              gap: 10,
              fontSize: 12,
              color: "var(--grey-1)",
              lineHeight: 1.7,
            }}
          >
            <span>💡</span>
            <span>
              When {editedTerms?.partyB || "they"} open the link, they'll see
              the agreement terms and be asked to connect their wallet. The page
              will update here automatically when they join.
            </span>
          </div>
        )}

        {/* Proceed button */}
        {counterpartyConnected ? (
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
        ) : (
          <div
            style={{
              width: "100%",
              padding: "16px",
              background: "var(--black-3)",
              border: "1px dashed var(--black-5)",
              borderRadius: "var(--radius)",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--grey-2)",
              textAlign: "center",
              cursor: "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <LivePulse />
            Waiting for counterparty to join...
          </div>
        )}

        <p
          style={{
            marginTop: 20,
            fontSize: 12,
            color: "var(--grey-2)",
            textAlign: "center",
            fontFamily: "var(--font-mono)",
            lineHeight: 1.6,
          }}
        >
          When {editedTerms?.partyB || "they"} open the link and connect their
          wallet, this page updates automatically.
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function StatusCard({
  connected,
  activeLabel,
  waitingLabel,
  address,
  showPulse,
  waitingSubtext,
}: {
  connected: boolean;
  activeLabel: string;
  waitingLabel: string;
  address: string | null;
  showPulse: boolean;
  waitingSubtext?: string;
}) {
  return (
    <div
      style={{
        background: "var(--black-2)",
        border: `1px solid ${connected ? "#22c55e40" : "var(--black-4)"}`,
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
          background: connected ? "#22c55e" : "var(--grey-3)",
          display: "inline-block",
          flexShrink: 0,
          animation:
            !connected && showPulse
              ? "pulse-yellow 1.5s ease-in-out infinite"
              : "none",
        }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: connected ? "#22c55e" : "var(--grey-1)",
          }}
        >
          {connected ? activeLabel : waitingLabel}
        </div>
        {address ? (
          <div
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              color: "var(--grey-2)",
              marginTop: 2,
            }}
          >
            {address.slice(0, 8)}...{address.slice(-6)}
          </div>
        ) : waitingSubtext ? (
          <div style={{ fontSize: 11, color: "var(--grey-2)", marginTop: 2 }}>
            {waitingSubtext}
          </div>
        ) : null}
      </div>
      {!connected && showPulse && <LivePulse />}
    </div>
  );
}

function LivePulse() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontFamily: "var(--font-mono)",
        color: "var(--yellow)",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--yellow)",
          display: "inline-block",
          animation: "pulse-yellow 1s ease-in-out infinite",
        }}
      />
      LIVE
    </span>
  );
}
