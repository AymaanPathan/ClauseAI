"use client";
// ============================================================
// components/screens/Shared/ArbitratorDecisionBanner.tsx
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { getSocket, joinDisputeRoom } from "@/lib/socket";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
        `${API_BASE}/api/arbitrate/${agreementId}/${milestoneIndex}`,
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

  // Both outcomes use yellow — release is bright yellow, refund is dim yellow
  const outcomeColor = isRelease ? "#f5c518" : "rgba(245,197,24,0.55)";
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
          font-size: 12px;
        }
        .arb-banner-eyebrow {
          font-size: 9px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.10em; font-family: 'DM Mono', monospace;
          margin-bottom: 2px;
        }
        .arb-banner-outcome {
          font-size: 12px; font-weight: 700; letter-spacing: -0.02em;
        }
        .arb-banner-body {
          padding: 11px 14px;
          display: flex; flex-direction: column; gap: 9px;
        }
        .arb-banner-msg { font-size: 12px; line-height: 1.65; }
        .arb-banner-note-block {
          border-radius: 5px; padding: 9px 11px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
        }
        .arb-banner-note-label {
          font-size: 9px; font-family: 'DM Mono', monospace; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.10em;
          color: rgba(255,255,255,0.25); margin-bottom: 5px;
        }
        .arb-banner-note-text {
          font-size: 12px; line-height: 1.65; color: rgba(255,255,255,0.55);
          font-style: italic;
        }
        .arb-banner-meta {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
        .arb-banner-meta-item {
          font-size: 9px; font-family: 'DM Mono', monospace;
          color: rgba(255,255,255,0.25);
        }
        .arb-banner-meta-sep { color: rgba(255,255,255,0.12); font-size: 10px; }
        .arb-banner-ai-tag {
          font-size: 8px; font-family: 'DM Mono', monospace; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.08em;
          border-radius: 3px; padding: 2px 6px; border: 1px solid;
        }
        .arb-banner-ai-tag--followed {
          color: #f5c518; border-color: rgba(245,197,24,0.25);
          background: rgba(245,197,24,0.07);
        }
        .arb-banner-ai-tag--overrode {
          color: rgba(245,197,24,0.55); border-color: rgba(245,197,24,0.18);
          background: rgba(245,197,24,0.04);
        }
      `}</style>

      <div
        className="arb-banner"
        style={{
          borderColor: outcomeColor + "30",
          background: outcomeColor + "05",
        }}
      >
        {/* Header */}
        <div
          className="arb-banner-head"
          style={{
            background: outcomeColor + "08",
            borderBottomColor: outcomeColor + "18",
          }}
        >
          <div
            className="arb-banner-icon"
            style={{
              background: outcomeColor + "12",
              border: `1px solid ${outcomeColor}28`,
              color: outcomeColor,
            }}
          >
            ⚖
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="arb-banner-eyebrow" style={{ color: outcomeColor }}>
              Arbitrator Decision
            </div>
            <div className="arb-banner-outcome" style={{ color: outcomeColor }}>
              {outcomeLabel}
            </div>
          </div>
          {isBeneficiary && (
            <div
              style={{
                fontSize: 9,
                fontFamily: "'DM Mono', monospace",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: outcomeColor,
                background: outcomeColor + "12",
                border: `1px solid ${outcomeColor}28`,
                borderRadius: 3,
                padding: "2px 8px",
                flexShrink: 0,
              }}
            >
              You
            </div>
          )}
        </div>

        {/* Body */}
        <div className="arb-banner-body">
          <div
            className="arb-banner-msg"
            style={{ color: "rgba(255,255,255,0.50)" }}
          >
            {personalMsg}
          </div>

          {dec.override_reason && (
            <div className="arb-banner-note-block">
              <div className="arb-banner-note-label">Arbitrator's Note</div>
              <div className="arb-banner-note-text">
                "{dec.override_reason}"
              </div>
            </div>
          )}

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
