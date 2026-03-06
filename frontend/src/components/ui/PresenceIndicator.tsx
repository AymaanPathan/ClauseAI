"use client";
// ============================================================
// components/ui/PresenceIndicator.tsx
// Reusable real-time presence widget.
// Shows both parties' online status with live SSE updates.
// ============================================================

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { applyPresenceUpdate } from "@/store/slices/agreementSlice";
import { subscribePresence, timeAgo } from "@/api/PresenceaApi";

interface PresenceIndicatorProps {
  /** Compact single-line mode for embedding in headers */
  compact?: boolean;
}

export default function PresenceIndicator({
  compact = false,
}: PresenceIndicatorProps) {
  const dispatch = useAppDispatch();
  const {
    agreementId,
    walletAddress,
    counterpartyWallet,
    counterpartyConnected,
    presenceRegistered,
    isPartyB,
    editedTerms,
  } = useAppSelector((s) => s.agreement);

  const unsubRef = useRef<(() => void) | null>(null);

  // Subscribe to SSE whenever we have an agreementId
  useEffect(() => {
    if (!agreementId) return;

    unsubRef.current?.();

    const unsub = subscribePresence(agreementId, (presence) =>
      dispatch(applyPresenceUpdate(presence)),
    );
    unsubRef.current = unsub;

    return () => {
      unsub();
      unsubRef.current = null;
    };
  }, [agreementId, dispatch]);

  if (!agreementId) return null;

  const myName = isPartyB
    ? (editedTerms?.partyB ?? "You")
    : (editedTerms?.partyA ?? "You");
  const theirName = isPartyB
    ? (editedTerms?.partyA ?? "Payer")
    : (editedTerms?.partyB ?? "Receiver");
  const myWallet = walletAddress;
  const theirWallet = counterpartyWallet;

  if (compact) {
    return (
      <div style={styles.compactRow}>
        {/* My dot */}
        <Dot connected={!!presenceRegistered} color="var(--yellow)" />
        <span style={styles.compactLabel}>You</span>

        <span style={styles.compactSep}>·</span>

        {/* Their dot */}
        <Dot
          connected={counterpartyConnected}
          pulse={!counterpartyConnected}
          color="#22c55e"
        />
        <span
          style={{
            ...styles.compactLabel,
            color: counterpartyConnected ? "#22c55e" : "var(--grey-2)",
          }}
        >
          {counterpartyConnected
            ? `🟢 ${theirName} online`
            : `⚫ Waiting for ${theirName}…`}
        </span>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.headerLabel}>Live Presence</span>
        <LiveBadge />
      </div>

      <PartyRow
        label={isPartyB ? "🎯 You (Receiver)" : "💸 You (Payer)"}
        name={myName}
        wallet={myWallet}
        connected={!!presenceRegistered}
        color={isPartyB ? "#22c55e" : "var(--yellow)"}
        isMe
      />

      <div style={styles.divider} />

      <PartyRow
        label={isPartyB ? "💸 Payer" : "🎯 Receiver"}
        name={theirName}
        wallet={theirWallet}
        connected={counterpartyConnected}
        color={isPartyB ? "var(--yellow)" : "#22c55e"}
        pulse={!counterpartyConnected}
        waitingText={`Waiting for ${theirName} to connect…`}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function PartyRow({
  label,
  name,
  wallet,
  connected,
  color,
  isMe,
  pulse,
  waitingText,
}: {
  label: string;
  name: string;
  wallet?: string | null;
  connected: boolean;
  color: string;
  isMe?: boolean;
  pulse?: boolean;
  waitingText?: string;
}) {
  return (
    <div style={styles.row}>
      <Dot connected={connected} color={color} pulse={pulse} />
      <div style={styles.rowContent}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--grey-1)",
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
            }}
          >
            {label}
          </span>
          {isMe && (
            <span
              style={{
                fontSize: 9,
                background: `${color}20`,
                color,
                border: `1px solid ${color}40`,
                borderRadius: 4,
                padding: "1px 5px",
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
              }}
            >
              YOU
            </span>
          )}
        </div>
        {connected ? (
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color }}>{name}</span>
            {wallet && (
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  color: "var(--grey-2)",
                  marginLeft: 8,
                }}
              >
                {wallet.slice(0, 8)}…{wallet.slice(-6)}
              </span>
            )}
          </div>
        ) : (
          <span
            style={{
              fontSize: 12,
              color: "var(--grey-2)",
              fontStyle: "italic",
            }}
          >
            {waitingText ?? "Not yet connected"}
          </span>
        )}
      </div>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: connected ? color : "var(--grey-3)",
          flexShrink: 0,
          boxShadow: connected ? `0 0 6px ${color}80` : "none",
          animation:
            pulse && !connected
              ? "presence-pulse 1.5s ease-in-out infinite"
              : "none",
        }}
      />
      <style>{`@keyframes presence-pulse{0%,100%{opacity:1}50%{opacity:0.2}}`}</style>
    </div>
  );
}

function Dot({
  connected,
  color,
  pulse,
}: {
  connected: boolean;
  color: string;
  pulse?: boolean;
}) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: connected ? color : "var(--grey-3)",
        flexShrink: 0,
        display: "inline-block",
        animation:
          pulse && !connected
            ? "presence-pulse 1.5s ease-in-out infinite"
            : "none",
      }}
    />
  );
}

function LiveBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9,
        fontFamily: "var(--font-mono)",
        color: "var(--yellow)",
        letterSpacing: "0.1em",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "var(--yellow)",
          display: "inline-block",
          animation: "presence-pulse 1s ease-in-out infinite",
        }}
      />
      SSE LIVE
    </span>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = {
  card: {
    background: "var(--black-2)",
    border: "1px solid var(--black-4)",
    borderRadius: 12,
    overflow: "hidden" as const,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    borderBottom: "1px solid var(--black-4)",
    background: "var(--black-3)",
  },
  headerLabel: {
    fontSize: 10,
    fontFamily: "var(--font-mono)",
    color: "var(--grey-1)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.12em",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
  },
  rowContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  divider: {
    height: 1,
    background: "var(--black-4)",
    margin: "0 14px",
  },
  compactRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontFamily: "var(--font-mono)",
    padding: "4px 10px",
    background: "var(--black-2)",
    border: "1px solid var(--black-4)",
    borderRadius: 99,
  },
  compactLabel: {
    color: "var(--grey-1)",
  },
  compactSep: {
    color: "var(--grey-3)",
    margin: "0 2px",
  },
};
