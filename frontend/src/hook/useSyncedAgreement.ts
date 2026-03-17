import { useEffect, useRef, useCallback, useReducer } from "react";
import {
  getSocket,
  joinAgreementRoom,
  joinDisputeRoom,
  leaveDisputeRoom,
  type AgreementStatePayload,
  type MilestoneUpdatedPayload,
  type DisputeUpdatedPayload,
  type FundsLockedPayload,
} from "@/lib/socket";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────

export type MsStatus =
  | "locked"
  | "pending"
  | "complete"
  | "disputed"
  | "refunded"
  | "failed";

export interface SyncedMilestone {
  index: number;
  title: string;
  percentage: number;
  condition: string;
  deadline?: string; // legacy plain-text label
  deadline_dt?: string; // ← ADDED: ISO datetime from the date picker
  amountUsd: string;
  amountSats: number;
  status: MsStatus;
  txId?: string;
  txUrl?: string;
  completedAt?: string;
  disputedAt?: string;
}

export interface ArbitratorDecision {
  outcome: "release_to_receiver" | "refund_to_payer" | "split";
  followed_ai: boolean;
  override_reason?: string;
  decided_at: string;
  arbitrator_address: string;
}

export interface SyncedAgreementState {
  milestones: SyncedMilestone[];
  fundState: string;
  fundsLocked: boolean;
  amountLocked: string | null;
  partyA: string | null;
  partyB: string | null;
  partyAApproved: boolean;
  partyBApproved: boolean;
  totalAmountUsd: number;
  totalAmountSats: number;
  arbitrator: string | null;
  terms: Record<string, unknown> | null;
  arbDecisions: Record<number, ArbitratorDecision | null>;
  connected: boolean;
  loading: boolean;
  lastUpdate: Date | null;
  flashIndex: number | null;
}

// ── Reducer ───────────────────────────────────────────────────

type Action =
  | { type: "LOADING" }
  | { type: "LOADED"; payload: Partial<SyncedAgreementState> }
  | { type: "SOCKET_CONNECTED"; payload: boolean }
  | { type: "MILESTONE_UPDATED"; payload: MilestoneUpdatedPayload }
  | { type: "FUNDS_LOCKED"; payload: FundsLockedPayload }
  | {
      type: "APPROVAL_UPDATED";
      payload: {
        partyAApproved: boolean;
        partyBApproved: boolean;
        partyA?: string | null;
        partyB?: string | null;
      };
    }
  | { type: "DISPUTE_UPDATED"; payload: DisputeUpdatedPayload }
  | {
      type: "ARB_DECISION";
      payload: { milestoneIndex: number; decision: ArbitratorDecision };
    }
  | { type: "FLASH_CLEAR" };

const initialState: SyncedAgreementState = {
  milestones: [],
  fundState: "idle",
  fundsLocked: false,
  amountLocked: null,
  partyA: null,
  partyB: null,
  partyAApproved: false,
  partyBApproved: false,
  totalAmountUsd: 0,
  totalAmountSats: 0,
  arbitrator: null,
  terms: null,
  arbDecisions: {},
  connected: false,
  loading: true,
  lastUpdate: null,
  flashIndex: null,
};

// ── Helper: map a raw DB milestone to SyncedMilestone ─────────
// Centralised so both fetchSnapshot and socket payloads use the same mapping.
function mapMilestone(m: any): SyncedMilestone {
  return {
    index: m.index,
    title: m.title ?? "",
    percentage: m.percentage ?? 0,
    condition: m.condition ?? "",
    deadline: m.deadline ?? "",
    deadline_dt: m.deadline_dt ?? undefined, // ← ADDED: preserve ISO datetime
    amountUsd: m.amountUsd ?? "0",
    amountSats: m.amountSats ?? 0,
    status: (m.status ?? "locked") as MsStatus,
    txId: m.txId ?? undefined,
    txUrl: m.txUrl ?? undefined,
    completedAt: m.completedAt ?? undefined,
    disputedAt: m.disputedAt ?? undefined,
  };
}

function applyMilestoneUpdate(
  milestones: SyncedMilestone[],
  payload: MilestoneUpdatedPayload,
): SyncedMilestone[] {
  // If server sends full milestone array, use it directly
  if (payload.milestones?.length) {
    return payload.milestones.map(mapMilestone);
  }
  // Otherwise patch the single milestone in-place,
  // preserving deadline_dt that was already in state
  return milestones.map((ms) =>
    ms.index === payload.milestoneIndex
      ? {
          ...ms,
          status: payload.status as MsStatus,
          txId: payload.txId,
          txUrl: payload.txUrl,
          completedAt:
            payload.status === "complete"
              ? (ms.completedAt ?? new Date().toISOString())
              : ms.completedAt,
          disputedAt:
            payload.status === "disputed"
              ? (ms.disputedAt ?? new Date().toISOString())
              : ms.disputedAt,
        }
      : ms,
  );
}

function reducer(
  state: SyncedAgreementState,
  action: Action,
): SyncedAgreementState {
  switch (action.type) {
    case "LOADING":
      return { ...state, loading: true };

    case "LOADED":
      return { ...state, ...action.payload, loading: false };

    case "SOCKET_CONNECTED":
      return { ...state, connected: action.payload };

    case "MILESTONE_UPDATED": {
      const milestones = applyMilestoneUpdate(state.milestones, action.payload);
      const allComplete = milestones.every((m) =>
        ["complete", "refunded"].includes(m.status),
      );
      return {
        ...state,
        milestones,
        fundState: allComplete ? "released" : state.fundState,
        lastUpdate: new Date(),
        flashIndex: action.payload.milestoneIndex,
      };
    }

    case "FUNDS_LOCKED": {
      const milestones = action.payload.milestones?.length
        ? action.payload.milestones.map(mapMilestone)
        : state.milestones;
      return {
        ...state,
        fundsLocked: true,
        fundState: "locked",
        amountLocked: action.payload.amountLocked ?? state.amountLocked,
        milestones,
        lastUpdate: new Date(),
      };
    }

    case "APPROVAL_UPDATED":
      return {
        ...state,
        partyAApproved: action.payload.partyAApproved,
        partyBApproved: action.payload.partyBApproved,
        partyA: action.payload.partyA ?? state.partyA,
        partyB: action.payload.partyB ?? state.partyB,
        lastUpdate: new Date(),
      };

    case "DISPUTE_UPDATED": {
      const idx = action.payload.milestone_index;
      const isResolved = action.payload.status === "resolved";
      const decision = action.payload.arbitrator_decision;

      let milestones = state.milestones;
      let arbDecisions = state.arbDecisions;

      if (isResolved && decision) {
        const newStatus: MsStatus =
          decision.outcome === "release_to_receiver" ? "complete" : "refunded";
        milestones = milestones.map((ms) =>
          ms.index === idx
            ? { ...ms, status: newStatus, completedAt: decision.decided_at }
            : ms,
        );
        arbDecisions = {
          ...arbDecisions,
          [idx]: decision as ArbitratorDecision,
        };
      } else if (
        [
          "awaiting_statements",
          "party_a_submitted",
          "party_b_submitted",
          "ai_pending",
          "ai_complete",
        ].includes(action.payload.status)
      ) {
        milestones = milestones.map((ms) =>
          ms.index === idx &&
          ms.status !== "complete" &&
          ms.status !== "refunded"
            ? { ...ms, status: "disputed" as MsStatus }
            : ms,
        );
      }

      return {
        ...state,
        milestones,
        arbDecisions,
        lastUpdate: new Date(),
        flashIndex: idx,
      };
    }

    case "ARB_DECISION":
      return {
        ...state,
        arbDecisions: {
          ...state.arbDecisions,
          [action.payload.milestoneIndex]: action.payload.decision,
        },
      };

    case "FLASH_CLEAR":
      return { ...state, flashIndex: null };

    default:
      return state;
  }
}

// ── Hook ──────────────────────────────────────────────────────

interface UseSyncedAgreementOptions {
  agreementId: string | null;
  walletAddress?: string | null;
}

export function useSyncedAgreement({
  agreementId,
  walletAddress,
}: UseSyncedAgreementOptions) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const joinedDisputeRooms = useRef<Set<number>>(new Set());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── REST fetch (cold start + fallback) ────────────────────
  const fetchSnapshot = useCallback(async () => {
    if (!agreementId) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/agreement/${agreementId}/milestones`,
      );
      if (!res.ok) return;
      const data = await res.json();

      dispatch({
        type: "LOADED",
        payload: {
          // ← uses mapMilestone so deadline_dt is always preserved
          milestones: (data.milestones ?? []).map(mapMilestone),
          fundState: data.fundState ?? "idle",
          fundsLocked: data.fundState === "locked" || data.fundsLocked,
          amountLocked: data.amountLocked ?? null,
          partyA: data.partyA ?? null,
          partyB: data.partyBWallet ?? data.partyB ?? null,
          partyAApproved: data.partyAApproved ?? false,
          partyBApproved: data.partyBApproved ?? false,
          totalAmountUsd: data.totalAmountUsd ?? 0,
          totalAmountSats: data.totalAmountSats ?? 0,
          arbitrator: data.arbitrator ?? null,
          terms: data.terms ?? null,
        },
      });

      const milestones: SyncedMilestone[] = (data.milestones ?? []).map(
        mapMilestone,
      );
      milestones.forEach((ms) => {
        fetchArbDecision(ms.index);
        if (
          ms.status === "disputed" &&
          !joinedDisputeRooms.current.has(ms.index)
        ) {
          joinDisputeRoom(agreementId, ms.index);
          joinedDisputeRooms.current.add(ms.index);
        }
      });
    } catch (err) {
      console.warn("[useSyncedAgreement] fetchSnapshot error:", err);
    }
  }, [agreementId]);

  // ── Fetch arbitrator decision for a milestone ─────────────
  const fetchArbDecision = useCallback(
    async (milestoneIndex: number) => {
      if (!agreementId) return;
      try {
        const res = await fetch(
          `${API_BASE}/api/arbitrate/${agreementId}/${milestoneIndex}`,
        );
        if (!res.ok) return;
        const json = await res.json();
        if (
          json.dispute?.status === "resolved" &&
          json.dispute?.arbitrator_decision
        ) {
          dispatch({
            type: "ARB_DECISION",
            payload: {
              milestoneIndex,
              decision: json.dispute.arbitrator_decision,
            },
          });
        }
      } catch {
        /* non-fatal */
      }
    },
    [agreementId],
  );

  // ── Flash clear helper ────────────────────────────────────
  function scheduleFlashClear() {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(
      () => dispatch({ type: "FLASH_CLEAR" }),
      2500,
    );
  }

  // ── Socket setup ──────────────────────────────────────────
  useEffect(() => {
    if (!agreementId) return;

    const socket = getSocket();

    fetchSnapshot();

    joinAgreementRoom(
      agreementId,
      (serverState: AgreementStatePayload | null) => {
        if (!serverState) return;
        dispatch({
          type: "LOADED",
          payload: {
            milestones: (serverState.milestones ?? []).map(mapMilestone),
            fundState: serverState.fundState ?? "idle",
            fundsLocked: serverState.fundsLocked,
            amountLocked: serverState.amountLocked,
            partyA: serverState.partyA,
            partyB: serverState.partyB,
            partyAApproved: serverState.partyAApproved,
            partyBApproved: serverState.partyBApproved,
          },
        });
      },
    );

    function onConnect() {
      dispatch({ type: "SOCKET_CONNECTED", payload: true });
    }
    function onDisconnect() {
      dispatch({ type: "SOCKET_CONNECTED", payload: false });
    }

    function onMilestoneUpdated(payload: MilestoneUpdatedPayload) {
      if (payload.agreementId && payload.agreementId !== agreementId) return;
      dispatch({ type: "MILESTONE_UPDATED", payload });
      scheduleFlashClear();
    }

    function onFundsLocked(payload: FundsLockedPayload) {
      if (payload.agreementId && payload.agreementId !== agreementId) return;
      dispatch({ type: "FUNDS_LOCKED", payload });
      if (!payload.milestones?.length) {
        setTimeout(fetchSnapshot, 500);
      }
    }

    function onApprovalUpdated(payload: {
      partyAApproved: boolean;
      partyBApproved: boolean;
      partyA?: string | null;
      partyB?: string | null;
    }) {
      dispatch({ type: "APPROVAL_UPDATED", payload });
    }

    function onDisputeUpdated(payload: DisputeUpdatedPayload) {
      if (payload.agreement_id && payload.agreement_id !== agreementId) return;
      dispatch({ type: "DISPUTE_UPDATED", payload });
      scheduleFlashClear();

      const idx = payload.milestone_index;
      if (idx !== undefined && !joinedDisputeRooms.current.has(idx)) {
        joinDisputeRoom(
          agreementId!,
          idx,
          (state: DisputeUpdatedPayload | null) => {
            if (state) dispatch({ type: "DISPUTE_UPDATED", payload: state });
          },
        );
        joinedDisputeRooms.current.add(idx);
      }

      if (payload.status === "resolved" && !payload.arbitrator_decision) {
        fetchArbDecision(idx);
      }
    }

    function onPresenceUpdated() {
      fetchSnapshot();
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("milestone:updated", onMilestoneUpdated);
    socket.on("funds:locked", onFundsLocked);
    socket.on("approval:updated", onApprovalUpdated);
    socket.on("dispute:updated", onDisputeUpdated);
    socket.on("presence:updated", onPresenceUpdated);

    if (socket.connected) {
      dispatch({ type: "SOCKET_CONNECTED", payload: true });
    }

    pollTimer.current = setInterval(fetchSnapshot, 30_000);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("milestone:updated", onMilestoneUpdated);
      socket.off("funds:locked", onFundsLocked);
      socket.off("approval:updated", onApprovalUpdated);
      socket.off("dispute:updated", onDisputeUpdated);
      socket.off("presence:updated", onPresenceUpdated);
      joinedDisputeRooms.current.forEach((idx) =>
        leaveDisputeRoom(agreementId, idx),
      );
      joinedDisputeRooms.current.clear();
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [agreementId, fetchSnapshot, fetchArbDecision]);

  return {
    ...state,
    refetch: fetchSnapshot,
    fetchArbDecision,
  };
}
