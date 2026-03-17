// ============================================================
// hook/useSyncedAgreement.ts
// Production-grade: version-tracked, stale-write-safe, DB-authoritative
// ============================================================
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
  deadline?: string;
  deadline_dt?: string;
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
  // Internal: monotonic counter — socket events bump this, REST only writes
  // if its value is >= current (prevents stale REST from overwriting socket)
  _seq: number;
}

// ── Reducer ───────────────────────────────────────────────────

type Action =
  | { type: "LOADING" }
  | { type: "REST_LOADED"; payload: Partial<SyncedAgreementState>; seq: number }
  | { type: "SOCKET_STATE"; payload: Partial<SyncedAgreementState> }
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
  _seq: 0,
};

// ── Helpers ───────────────────────────────────────────────────

export function mapMilestone(m: any): SyncedMilestone {
  return {
    index: m.index,
    title: m.title ?? "",
    percentage: m.percentage ?? 0,
    condition: m.condition ?? "",
    deadline: m.deadline ?? "",
    deadline_dt: m.deadline_dt ?? undefined,
    amountUsd: m.amountUsd ?? "0",
    amountSats: m.amountSats ?? 0,
    status: (m.status ?? "locked") as MsStatus,
    txId: m.txId ?? undefined,
    txUrl: m.txUrl ?? undefined,
    completedAt: m.completedAt ?? undefined,
    disputedAt: m.disputedAt ?? undefined,
  };
}

// Merge DB milestones with optimistic local overrides.
// If a local status is "pending" or "confirming", it wins over DB.
export function mergeMilestonesWithOptimistic(
  dbMilestones: SyncedMilestone[],
  optimistic: Record<
    number,
    { status: string; txId?: string | null; txUrl?: string | null }
  >,
): SyncedMilestone[] {
  if (!Object.keys(optimistic).length) return dbMilestones;
  return dbMilestones.map((ms) => {
    const local = optimistic[ms.index];
    if (!local) return ms;
    const isPending =
      local.status === "pending" || local.status === "confirming";
    if (isPending) {
      return {
        ...ms,
        status: "pending" as MsStatus,
        txId: local.txId ?? ms.txId,
        txUrl: local.txUrl ?? ms.txUrl,
      };
    }
    if (local.status === "failed") {
      // Keep DB status, just annotate
      return ms;
    }
    return ms;
  });
}

function applyMilestoneUpdate(
  milestones: SyncedMilestone[],
  payload: MilestoneUpdatedPayload,
): SyncedMilestone[] {
  // Server always sends full milestones array — use it directly
  if (payload.milestones?.length) {
    return payload.milestones.map(mapMilestone);
  }
  // Fallback: patch in-place preserving deadline_dt
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

function deriveFundState(
  milestones: SyncedMilestone[],
  current: string,
): string {
  if (milestones.length === 0) return current;
  const allSettled = milestones.every((m) =>
    ["complete", "refunded"].includes(m.status),
  );
  if (allSettled) return "released";
  const anyDisputed = milestones.some((m) => m.status === "disputed");
  if (anyDisputed && current !== "locked") return current;
  return current;
}

function reducer(
  state: SyncedAgreementState,
  action: Action,
): SyncedAgreementState {
  switch (action.type) {
    case "LOADING":
      return { ...state, loading: true };

    case "REST_LOADED": {
      // Only apply REST response if it's not stale (seq >= current _seq)
      // Socket events bump _seq so a slow REST fetch won't overwrite them
      if (action.seq < state._seq) {
        // Stale REST — only update fields that socket doesn't carry
        return {
          ...state,
          loading: false,
          totalAmountUsd: action.payload.totalAmountUsd ?? state.totalAmountUsd,
          totalAmountSats:
            action.payload.totalAmountSats ?? state.totalAmountSats,
          arbitrator: action.payload.arbitrator ?? state.arbitrator,
          terms: action.payload.terms ?? state.terms,
          partyA: action.payload.partyA ?? state.partyA,
          partyB: action.payload.partyB ?? state.partyB,
        };
      }
      // Fresh REST: apply fully, but merge milestones carefully
      // If we already have milestones from socket (seq > 0), only update
      // milestones that have the same or lower seq
      const incoming = action.payload;
      return {
        ...state,
        ...incoming,
        loading: false,
        _seq: action.seq,
        lastUpdate: new Date(),
      };
    }

    case "SOCKET_STATE": {
      const payload = action.payload;
      const milestones = payload.milestones?.length
        ? (payload.milestones as SyncedMilestone[])
        : state.milestones;
      return {
        ...state,
        ...payload,
        milestones,
        loading: false,
        _seq: state._seq + 1,
        lastUpdate: new Date(),
      };
    }

    case "SOCKET_CONNECTED":
      return { ...state, connected: action.payload };

    case "MILESTONE_UPDATED": {
      const milestones = applyMilestoneUpdate(state.milestones, action.payload);
      // Derive fundState from milestones + any explicit fundState in payload
      const newFundState = deriveFundState(
        milestones,
        (action.payload as any).fundState ?? state.fundState,
      );
      return {
        ...state,
        milestones,
        fundState: newFundState,
        fundsLocked: newFundState !== "idle",
        lastUpdate: new Date(),
        flashIndex: action.payload.milestoneIndex,
        _seq: state._seq + 1,
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
        _seq: state._seq + 1,
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
        _seq: state._seq + 1,
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
        action.payload.status === "awaiting_statements" ||
        action.payload.status === "party_a_submitted" ||
        action.payload.status === "party_b_submitted" ||
        action.payload.status === "ai_pending" ||
        action.payload.status === "ai_complete"
      ) {
        milestones = milestones.map((ms) =>
          ms.index === idx &&
          ms.status !== "complete" &&
          ms.status !== "refunded"
            ? { ...ms, status: "disputed" as MsStatus }
            : ms,
        );
      }

      const newFundState = deriveFundState(milestones, state.fundState);

      return {
        ...state,
        milestones,
        fundState: newFundState,
        arbDecisions,
        lastUpdate: new Date(),
        flashIndex: idx,
        _seq: state._seq + 1,
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
  // Optional: local optimistic overrides from Redux txMilestone
  // This lets Party A's pending/confirming local state show correctly
  // while DB is still processing
  localOptimistic?: Record<
    number,
    { status: string; txId?: string | null; txUrl?: string | null }
  >;
}

export function useSyncedAgreement({
  agreementId,
  walletAddress,
  localOptimistic = {},
}: UseSyncedAgreementOptions) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const joinedDisputeRooms = useRef<Set<number>>(new Set());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track fetch sequence to detect stale responses
  const fetchSeqRef = useRef<number>(0);

  // ── REST fetch (cold start + periodic resync) ─────────────
  const fetchSnapshot = useCallback(async () => {
    if (!agreementId) return;
    const mySeq = ++fetchSeqRef.current;
    try {
      const res = await fetch(
        `${API_BASE}/api/agreement/${agreementId}/milestones`,
      );
      if (!res.ok) return;
      const data = await res.json();

      const milestones: SyncedMilestone[] = (data.milestones ?? []).map(
        mapMilestone,
      );

      dispatch({
        type: "REST_LOADED",
        seq: mySeq,
        payload: {
          milestones,
          fundState: data.fundState ?? "idle",
          fundsLocked: data.fundState === "locked" || !!data.fundsLocked,
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
  }, [agreementId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch arbitrator decision ─────────────────────────────
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

  // ── Flash clear ───────────────────────────────────────────
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

    // Cold start: REST fetch in parallel with socket join ack
    fetchSnapshot();

    // Join with ack — server returns full current state immediately
    joinAgreementRoom(
      agreementId,
      (serverState: AgreementStatePayload | null) => {
        if (!serverState) return;
        dispatch({
          type: "SOCKET_STATE",
          payload: {
            milestones: (serverState.milestones ?? []).map(mapMilestone),
            fundState: serverState.fundState ?? "idle",
            fundsLocked: serverState.fundsLocked,
            amountLocked: serverState.amountLocked,
            partyA: serverState.partyA,
            partyB: serverState.partyB,
            partyAApproved: serverState.partyAApproved,
            partyBApproved: serverState.partyBApproved,
            totalAmountUsd: (serverState as any).totalAmountUsd ?? 0,
            totalAmountSats: (serverState as any).totalAmountSats ?? 0,
            arbitrator: (serverState as any).arbitrator ?? null,
            terms: (serverState as any).terms ?? null,
          },
        });
      },
    );

    function onConnect() {
      dispatch({ type: "SOCKET_CONNECTED", payload: true });
      // On reconnect: re-fetch to resync any missed events
      fetchSnapshot();
    }
    function onDisconnect() {
      dispatch({ type: "SOCKET_CONNECTED", payload: false });
    }

    function onMilestoneUpdated(payload: MilestoneUpdatedPayload) {
      if (payload.agreementId && payload.agreementId !== agreementId) return;
      dispatch({ type: "MILESTONE_UPDATED", payload });
      scheduleFlashClear();

      // If any milestone is now disputed, join its dispute room
      const milestones = payload.milestones ?? [];
      milestones.forEach((ms) => {
        if (
          ms.status === "disputed" &&
          !joinedDisputeRooms.current.has(ms.index)
        ) {
          joinDisputeRoom(agreementId!, ms.index);
          joinedDisputeRooms.current.add(ms.index);
        }
      });
    }

    function onFundsLocked(payload: FundsLockedPayload) {
      if (payload.agreementId && payload.agreementId !== agreementId) return;
      dispatch({ type: "FUNDS_LOCKED", payload });
      // Fetch full snapshot to get milestone details
      if (!payload.milestones?.length) {
        setTimeout(fetchSnapshot, 300);
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
          (s: DisputeUpdatedPayload | null) => {
            if (s) dispatch({ type: "DISPUTE_UPDATED", payload: s });
          },
        );
        joinedDisputeRooms.current.add(idx);
      }

      if (payload.status === "resolved") {
        if (payload.arbitrator_decision) {
          // Decision already in payload — no need to fetch
        } else {
          fetchArbDecision(idx);
        }
        // Always do a fresh REST fetch after resolution to ensure DB is authoritative
        setTimeout(fetchSnapshot, 500);
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

    // Periodic poll: every 15s as safety net for missed socket events
    pollTimer.current = setInterval(fetchSnapshot, 15_000);

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

  // ── Merge optimistic local state on top of DB state ───────
  // This is for Party A's pending/confirming tx states
  const mergedMilestones =
    Object.keys(localOptimistic).length > 0
      ? mergeMilestonesWithOptimistic(state.milestones, localOptimistic)
      : state.milestones;

  return {
    ...state,
    milestones: mergedMilestones,
    refetch: fetchSnapshot,
    fetchArbDecision,
  };
}
