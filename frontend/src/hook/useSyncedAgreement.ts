// ============================================================
// hook/useSyncedAgreement.ts
// FIXED: deriveFundState no longer flips to "released" from stale DB.
//        REST_LOADED always re-derives fundState from milestone statuses.
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

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL;

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
  _seq: number;
}

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
    return ms;
  });
}

function applyMilestoneUpdate(
  milestones: SyncedMilestone[],
  payload: MilestoneUpdatedPayload,
): SyncedMilestone[] {
  if (payload.milestones?.length) {
    return payload.milestones.map(mapMilestone);
  }
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

// ── THE KEY FIX ───────────────────────────────────────────────
// Always derive fundState from actual milestone statuses.
// NEVER trust the raw DB fundState if milestones contradict it.
// Rules:
//   - ALL milestones complete/refunded → "released"
//   - ANY milestone locked/pending/disputed → "locked" (never "released")
//   - Otherwise keep current
function deriveFundState(
  milestones: SyncedMilestone[],
  rawDbFundState: string,
): string {
  if (milestones.length === 0) {
    // No milestones yet — if DB says released, that's wrong; use locked
    return rawDbFundState === "released" ? "locked" : rawDbFundState;
  }

  const allSettled = milestones.every((m) =>
    ["complete", "refunded"].includes(m.status),
  );

  if (allSettled) return "released";

  // If ANY milestone is not settled, the agreement is NOT released.
  // Even if DB says "released" — milestone statuses are ground truth.
  const anyUnsettled = milestones.some(
    (m) => !["complete", "refunded"].includes(m.status),
  );

  if (anyUnsettled && rawDbFundState === "released") {
    // DB is corrupted / stale. Override to locked.
    return "locked";
  }

  return rawDbFundState;
}

function reducer(
  state: SyncedAgreementState,
  action: Action,
): SyncedAgreementState {
  switch (action.type) {
    case "LOADING":
      return { ...state, loading: true };

    case "REST_LOADED": {
      if (action.seq < state._seq) {
        // Stale REST — only update non-milestone fields
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

      const incoming = action.payload;
      const milestones = incoming.milestones ?? state.milestones;

      // ── CRITICAL: Always re-derive fundState from milestone statuses ──
      // The DB fundState can be stale/wrong (e.g. "released" with locked milestones).
      // Milestone statuses are the single source of truth for completion.
      const derivedFundState = deriveFundState(
        milestones,
        incoming.fundState ?? state.fundState,
      );

      return {
        ...state,
        ...incoming,
        milestones,
        fundState: derivedFundState,
        // fundsLocked = true whenever agreement is active (not idle)
        fundsLocked: derivedFundState !== "idle",
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

      const derivedFundState = deriveFundState(
        milestones,
        payload.fundState ?? state.fundState,
      );

      return {
        ...state,
        ...payload,
        milestones,
        fundState: derivedFundState,
        fundsLocked: derivedFundState !== "idle",
        loading: false,
        _seq: state._seq + 1,
        lastUpdate: new Date(),
      };
    }

    case "SOCKET_CONNECTED":
      return { ...state, connected: action.payload };

    case "MILESTONE_UPDATED": {
      const milestones = applyMilestoneUpdate(state.milestones, action.payload);
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
        [
          "awaiting_statements",
          "party_a_submitted",
          "party_b_submitted",
          "ai_pending",
          "ai_complete",
        ].includes(action.payload.status)
      ) {
        // Dispute is open — mark milestone as disputed
        milestones = milestones.map((ms) =>
          ms.index === idx &&
          ms.status !== "complete" &&
          ms.status !== "refunded"
            ? { ...ms, status: "disputed" as MsStatus }
            : ms,
        );
      }

      // Re-derive fundState — a disputed milestone means NOT released
      const newFundState = deriveFundState(milestones, state.fundState);

      return {
        ...state,
        milestones,
        fundState: newFundState,
        fundsLocked: newFundState !== "idle",
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

interface UseSyncedAgreementOptions {
  agreementId: string | null;
  walletAddress?: string | null;
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
  const fetchSeqRef = useRef<number>(0);

  const fetchSnapshot = useCallback(async () => {
    if (!agreementId) return;
    const mySeq = ++fetchSeqRef.current;
    try {
      const res = await fetch(
        `${API_BASE}/agreement/${agreementId}/milestones`,
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

  const fetchArbDecision = useCallback(
    async (milestoneIndex: number) => {
      if (!agreementId) return;
      try {
        const res = await fetch(
          `${API_BASE}/arbitrate/${agreementId}/${milestoneIndex}`,
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

  function scheduleFlashClear() {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(
      () => dispatch({ type: "FLASH_CLEAR" }),
      2500,
    );
  }

  useEffect(() => {
    if (!agreementId) return;

    const socket = getSocket();

    fetchSnapshot();

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
      fetchSnapshot();
    }
    function onDisconnect() {
      dispatch({ type: "SOCKET_CONNECTED", payload: false });
    }

    function onMilestoneUpdated(payload: MilestoneUpdatedPayload) {
      if (payload.agreementId && payload.agreementId !== agreementId) return;
      dispatch({ type: "MILESTONE_UPDATED", payload });
      scheduleFlashClear();

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
        if (!payload.arbitrator_decision) {
          fetchArbDecision(idx);
        }
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
