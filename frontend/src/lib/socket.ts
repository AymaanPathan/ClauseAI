// ============================================================
// lib/socket.ts — Socket.io client singleton
// ============================================================

import { io, Socket } from "socket.io-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socket.on("connect", () =>
      console.log("[socket.io] connected:", socket?.id),
    );
    socket.on("disconnect", () => console.log("[socket.io] disconnected"));
    socket.on("connect_error", (err) =>
      console.warn("[socket.io] error:", err.message),
    );
  }
  return socket;
}

export function joinAgreementRoom(agreementId: string) {
  getSocket().emit("join:agreement", agreementId);
}

// Join a dispute-specific room for real-time statement/evidence updates.
// Room key on server: "dispute:{agreementId}:{milestoneIndex}"
export function joinDisputeRoom(agreementId: string, milestoneIndex: number) {
  getSocket().emit("join:dispute", { agreementId, milestoneIndex });
}

export function leaveDisputeRoom(agreementId: string, milestoneIndex: number) {
  getSocket().emit("leave:dispute", { agreementId, milestoneIndex });
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

// ── Event payload types ───────────────────────────────────────

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
  }>;
}

export interface FundsLockedPayload {
  agreementId: string;
  amountLocked: string;
  txId: string;
}

// Emitted to "dispute:{agreementId}:{milestoneIndex}" room whenever:
//  - A party submits their statement
//  - AI verdict is generated
//  - Arbitrator resolves
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
    outcome: string;
    followed_ai: boolean;
    override_reason?: string;
    decided_at: string;
    arbitrator_address: string;
  };
}
