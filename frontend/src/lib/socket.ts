// ============================================================
// lib/socket.ts — Socket.io client singleton
// Connects once, reused across components.
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

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

// ── Event types emitted by the server ─────────────────────────
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
