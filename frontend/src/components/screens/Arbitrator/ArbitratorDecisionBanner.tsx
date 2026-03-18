"use client";
// ============================================================
// components/screens/Shared/ArbitratorDecisionBanner.tsx
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { getSocket, joinDisputeRoom } from "@/lib/socket";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL;

interface ArbitratorDecision {
  outcome: "release_to_receiver" | "refund_to_payer" | "split";
  followed_ai: boolean;
  override_reason?: string;
  decided_at: string;
  arbitrator_address: string;
}

interface DisputeData {
  status: string;
  arbitrator_decision?: ArbitratorDecision;
}

interface Props {
  agreementId: string;
  milestoneIndex: number;
  viewerRole: "A" | "B";
}

function truncateAddr(addr: string): string {
  if (!addr || addr === "TBD") return addr;
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-5)}`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ArbitratorDecisionBanner({
  agreementId,
  milestoneIndex,
  viewerRole,
}: Props) {
  const [dispute, setDispute] = useState<DisputeData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDispute = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/arbitrate/${agreementId}/${milestoneIndex}`,
      );
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const json = await res.json();
      setDispute(json.dispute ?? null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [agreementId, milestoneIndex]);

  useEffect(() => {
    fetchDispute();
  }, [fetchDispute]);

  useEffect(() => {
    joinDisputeRoom(agreementId, milestoneIndex);
    const socket = getSocket();
    function onDisputeUpdated(payload: any) {
      if (
        payload.agreement_id === agreementId &&
        payload.milestone_index === milestoneIndex
      ) {
        setDispute(payload);
      }
    }
    socket.on("dispute:updated", onDisputeUpdated);
    return () => {
      socket.off("dispute:updated", onDisputeUpdated);
    };
  }, [agreementId, milestoneIndex]);

  if (loading || !dispute) return null;

  const dec = dispute.arbitrator_decision;
  if (!dec || dispute.status !== "resolved") return null;

  const isRelease = dec.outcome === "release_to_receiver";
  const accentColor = isRelease ? "#c8ff3e" : "#f5c518";

  const outcomeLabel = isRelease
    ? "Funds Released to Receiver (Party B)"
    : "Funds Refunded to Payer (Party A)";

  const isBeneficiary =
    (viewerRole === "B" && isRelease) || (viewerRole === "A" && !isRelease);

  const personalMsg = isRelease
    ? viewerRole === "B"
      ? "The arbitrator ruled in your favour. Funds have been released to your wallet."
      : "The arbitrator ruled in favour of the Receiver. Funds have been released to Party B."
    : viewerRole === "A"
      ? "The arbitrator ruled in your favour. Funds have been returned to your wallet."
      : "The arbitrator ruled in favour of the Payer. Funds have been refunded to Party A.";

  return (
    <>
      <style>{`
        .arb-banner {
          border: 1px solid;
          border-radius: 6px;
          overflow: hidden;
          font-family: 'DM Sans', sans-serif;
          margin-top: 8px;
          animation: arbBannerIn 0.35s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes arbBannerIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .arb-banner-head {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px; border-bottom: 1px solid;
        }
        .arb-banner-icon {
          width: 26px; height: 26px; border-radius: 5px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px;
        }
        .arb-banner-eyebrow {
          font-size: 9px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.10em; font-family: 'DM Mono', monospace;
          margin-bottom: 3px;
        }
        .arb-banner-outcome {
          font-size: 13px; font-weight: 700; letter-spacing: -0.02em;
        }
        .arb-banner-body {
          padding: 12px 14px;
          display: flex; flex-direction: column; gap: 10px;
        }

        /* ── Main message — BRIGHT WHITE ── */
        .arb-banner-msg {
          font-size: 13px;
          line-height: 1.65;
          color: #ffffff;              /* was rgba(255,255,255,0.50) */
          font-weight: 500;
        }

        /* ── Note block ── */
        .arb-banner-note-block {
          border-radius: 5px; padding: 10px 12px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
        }
        .arb-banner-note-label {
          font-size: 9px; font-family: 'DM Mono', monospace; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.12em;
          color: rgb(255, 255, 255);  /* was 0.25 */
          margin-bottom: 6px;
        }
        .arb-banner-note-text {
          font-size: 12px; line-height: 1.65;
          color: rgb(255, 255, 255);  /* was 0.55 */
          font-style: italic;
        }

        /* ── Meta row ── */
        .arb-banner-meta {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
        .arb-banner-meta-item {
          font-size: 9px; font-family: 'DM Mono', monospace;
          color: rgb(254, 254, 254);  /* was 0.25 */
        }
        .arb-banner-meta-sep {
          color: rgb(255, 255, 255);  /* was 0.12 */
          font-size: 10px;
        }

        /* ── AI tag ── */
        .arb-banner-ai-tag {
          font-size: 8px; font-family: 'DM Mono', monospace; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.08em;
          border-radius: 3px; padding: 2px 7px; border: 1px solid;
        }
        .arb-banner-ai-tag--followed {
          color: #c8ff3e;
          border-color: rgba(200,255,62,0.35);
          background: rgba(200,255,62,0.10);
        }
        .arb-banner-ai-tag--overrode {
          color: #f5c518;
          border-color: rgba(245,197,24,0.35);
          background: rgba(245,197,24,0.10);
        }

        /* ── You badge ── */
        .arb-banner-you {
          font-size: 9px; font-family: 'DM Mono', monospace; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.08em;
          border-radius: 3px; padding: 2px 9px; border: 1px solid;
          flex-shrink: 0;
        }
      `}</style>

      <div
        className="arb-banner"
        style={{
          borderColor: accentColor + "35",
          background: accentColor + "06",
        }}
      >
        {/* ── Header ── */}
        <div
          className="arb-banner-head"
          style={{
            background: accentColor + "0a",
            borderBottomColor: accentColor + "22",
          }}
        >
          <div
            className="arb-banner-icon"
            style={{
              background: accentColor + "15",
              border: `1px solid ${accentColor}30`,
              color: accentColor,
            }}
          >
            ⚖
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="arb-banner-eyebrow" style={{ color: accentColor }}>
              Arbitrator Decision
            </div>
            <div className="arb-banner-outcome" style={{ color: accentColor }}>
              {outcomeLabel}
            </div>
          </div>
          {isBeneficiary && (
            <div
              className="arb-banner-you"
              style={{
                color: accentColor,
                background: accentColor + "15",
                borderColor: accentColor + "35",
              }}
            >
              You
            </div>
          )}
        </div>

        {/* ── Body ── */}
        <div className="arb-banner-body">
          {/* Main message — full white */}
          <div className="arb-banner-msg">{personalMsg}</div>

          {/* Arbitrator's note */}
          {dec.override_reason && (
            <div className="arb-banner-note-block">
              <div className="arb-banner-note-label">Arbitrator's Note</div>
              <div className="arb-banner-note-text">
                "{dec.override_reason}"
              </div>
            </div>
          )}

          {/* Meta row */}
          <div className="arb-banner-meta">
            <span className="arb-banner-meta-item">
              By {truncateAddr(dec.arbitrator_address)}
            </span>
            <span className="arb-banner-meta-sep">·</span>
            <span className="arb-banner-meta-item">
              {fmtDate(dec.decided_at)}
            </span>
            <span className="arb-banner-meta-sep">·</span>
            <span
              className={`arb-banner-ai-tag ${
                dec.followed_ai
                  ? "arb-banner-ai-tag--followed"
                  : "arb-banner-ai-tag--overrode"
              }`}
            >
              {dec.followed_ai ? "✓ Followed AI" : "↺ Overrode AI"}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
