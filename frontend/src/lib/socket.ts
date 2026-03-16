// ============================================================
// lib/socket.ts — Socket.io client singleton
// Production-grade: reconnect sync, typed events, ack callbacks
// ============================================================

import { io, Socket } from "socket.io-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Typed event payloads ──────────────────────────────────────

export interface MilestoneUpdatedPayload {
  agreementId: string;
  milestoneIndex: number;
  action: "complete" | "dispute" | "timeout";
  txId: string;
  txUrl?: string;
  status: "complete" | "disputed" | "refunded" | "failed" | "pending";
  txVerified: "success" | "pending" | "failed";
  blockHeight?: number;
  blockTime?: number;
  allComplete: boolean;
  milestones: Array<{
    index: number;
    title: string;
    percentage: number;
    condition: string;
    deadline?: string;
    amountUsd: string;
    amountSats: number;
    status: string;
    txId?: string;
    txUrl?: string;
    completedAt?: string;
    disputedAt?: string;
  }>;
}

export interface FundsLockedPayload {
  agreementId: string;
  amountLocked: string;
  txId: string;
  milestones?: MilestoneUpdatedPayload["milestones"];
}

export interface DisputeUpdatedPayload {
  agreement_id: string;
  milestone_index: number;
  status: string;
  party_a_statement?: string;
  party_a_evidence?: string[];
  party_a_submitted_at?: string;
  party_b_statement?: string;
  party_b_evidence?: string[];
  party_b_submitted_at?: string;
  ai_verdict?: {
    verdict: "release_to_receiver" | "refund_to_payer" | "split";
    confidence: number;
    reasoning: string;
    key_factors: string[];
    warnings: string[];
    split_percentage?: number;
    generated_at: string;
  };
  arbitrator_decision?: {
    outcome: "release_to_receiver" | "refund_to_payer" | "split";
    followed_ai: boolean;
    override_reason?: string;
    decided_at: string;
    arbitrator_address: string;
  };
}

// Full state snapshot — emitted by server on join:agreement ack
export interface AgreementStatePayload {
  agreementId: string;
  milestones: MilestoneUpdatedPayload["milestones"];
  fundState: string;
  fundsLocked: boolean;
  amountLocked: string | null;
  partyA: string | null;
  partyB: string | null;
  partyAApproved: boolean;
  partyBApproved: boolean;
}

// ── Room tracking (client-side) ───────────────────────────────
// Tracks which rooms we've joined so we can re-join after reconnect

const joinedAgreementRooms = new Set<string>();
const joinedDisputeRooms = new Set<string>(); // key: `${agreementId}:${milestoneIndex}`

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 10_000,
    });

    socket.on("connect", () => {
      console.log("[socket.io] connected:", socket?.id);
      // Re-join all rooms we were in before disconnect
      _rejoinAllRooms();
    });

    socket.on("disconnect", (reason) => {
      console.log("[socket.io] disconnected:", reason);
    });

    socket.on("connect_error", (err) => {
      console.warn("[socket.io] error:", err.message);
    });
  }
  return socket;
}

function _rejoinAllRooms() {
  const s = socket;
  if (!s) return;
  joinedAgreementRooms.forEach((id) => {
    s.emit("join:agreement", id);
  });
  joinedDisputeRooms.forEach((key) => {
    const [agreementId, milestoneIndex] = key.split(":");
    s.emit("join:dispute", {
      agreementId,
      milestoneIndex: parseInt(milestoneIndex),
    });
  });
}

/**
 * Join an agreement room.
 *
 * @param onState - optional callback called with the server's current full
 *   state snapshot immediately on join (and after every reconnect). Use this
 *   to hydrate UI without a separate REST call.
 */
export function joinAgreementRoom(
  agreementId: string,
  onState?: (state: AgreementStatePayload) => void,
) {
  const s = getSocket();
  joinedAgreementRooms.add(agreementId);

  // Emit with ack — server returns current state immediately
  s.emit(
    "join:agreement",
    agreementId,
    (state: AgreementStatePayload | null) => {
      if (state && onState) onState(state);
    },
  );
}

/**
 * Join a dispute-specific room for real-time statement/evidence updates.
 * Room key on server: "dispute:{agreementId}:{milestoneIndex}"
 */
export function joinDisputeRoom(
  agreementId: string,
  milestoneIndex: number,
  onState?: (state: DisputeUpdatedPayload | null) => void,
) {
  const s = getSocket();
  const key = `${agreementId}:${milestoneIndex}`;
  joinedDisputeRooms.add(key);

  s.emit(
    "join:dispute",
    { agreementId, milestoneIndex },
    (state: DisputeUpdatedPayload | null) => {
      if (onState) onState(state);
    },
  );
}

export function leaveDisputeRoom(agreementId: string, milestoneIndex: number) {
  const key = `${agreementId}:${milestoneIndex}`;
  joinedDisputeRooms.delete(key);
  socket?.emit("leave:dispute", { agreementId, milestoneIndex });
}

export function disconnectSocket() {
  joinedAgreementRooms.clear();
  joinedDisputeRooms.clear();
  socket?.disconnect();
  socket = null;
}
