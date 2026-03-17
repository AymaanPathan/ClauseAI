import { callDisputeMilestone } from "@/lib/contractCalls";
import { explorerTxUrl, NETWORK_NAME } from "@/lib/stacksConfig";

import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { ParsedAgreement, ParsedAgreementV2 } from "@/api/parseApi";
import {
  connectHiroWallet,
  isWalletConnected,
  getConnectedUser,
} from "@/lib/hiroWallet";
import { approveAgreement, getApprovalState } from "@/api/approvalApi";
import { registerParty } from "@/api/PresenceaApi";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL;

const STACKS_API_BASE =
  NETWORK_NAME === "mainnet"
    ? "https://api.mainnet.hiro.so"
    : "https://api.testnet.hiro.so";

// ── Stacks tx poller (same logic as partyASlice) ─────────────
async function fetchTxStatus(
  txId: string,
): Promise<
  "pending" | "success" | "abort_by_response" | "abort_by_post_condition"
> {
  try {
    const res = await fetch(`${STACKS_API_BASE}/extended/v1/tx/${txId}`);
    if (!res.ok) return "pending";
    const data = await res.json();
    return data.tx_status ?? "pending";
  } catch {
    return "pending";
  }
}

export type PartyBScreen =
  | "loading"
  | "error"
  | "review"
  | "connect-wallet"
  | "approve"
  | "waiting-funds"
  | "dashboard";

export interface PartyBState {
  screen: PartyBScreen;
  agreementId: string | null;
  loadError: string | null;
  terms: ParsedAgreement | ParsedAgreementV2 | null;
  partyAWallet: string | null;
  walletConnected: boolean;
  walletAddress: string | null;
  partyAApproved: boolean;
  partyBApproved: boolean;
  approving: boolean;
  approveError: string | null;
  connecting: boolean;
  connectError: string | null;
  fundsLocked: boolean;
  amountLocked: string | null;
  // Track per-milestone tx state for Party B disputes
  txMilestone: Record<
    number,
    {
      status: "idle" | "pending" | "confirming" | "confirmed" | "failed";
      txId: string | null;
      error: string | null;
    }
  >;
}

const initialState: PartyBState = {
  screen: "loading",
  agreementId: null,
  loadError: null,
  terms: null,
  partyAWallet: null,
  walletConnected: false,
  walletAddress: null,
  partyAApproved: false,
  partyBApproved: false,
  approving: false,
  approveError: null,
  connecting: false,
  connectError: null,
  fundsLocked: false,
  amountLocked: null,
  txMilestone: {},
};

// ── localStorage helpers ──────────────────────────────────────

export function getPartyBAgreementIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("pB_agreements");
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function savePartyBAgreementId(agreementId: string): void {
  if (typeof window === "undefined") return;
  const existing = getPartyBAgreementIds();
  if (!existing.includes(agreementId)) {
    localStorage.setItem(
      "pB_agreements",
      JSON.stringify([agreementId, ...existing]),
    );
  }
}

// ── Thunks ─────────────────────────────────────────────────────

export const initPartyBThunk = createAsyncThunk(
  "partyB/init",
  async (agreementId: string, { rejectWithValue }) => {
    try {
      const res = await fetch(`${API_BASE}/api/agreement/${agreementId}`);
      if (!res.ok) {
        if (res.status === 404)
          throw new Error("This agreement link is invalid or has expired.");
        throw new Error(`Server error ${res.status}`);
      }
      const data = await res.json();

      let terms = data.termsSnapshot ?? null;
      if (!terms) {
        try {
          const dbRes = await fetch(
            `${API_BASE}/api/agreement/${agreementId}/milestones`,
          );
          if (dbRes.ok) {
            const dbData = await dbRes.json();
            if (dbData.terms && Object.keys(dbData.terms).length > 0) {
              terms = dbData.terms;
            }
          }
        } catch {
          // non-fatal
        }
      }

      const storedAddress =
        typeof window !== "undefined"
          ? localStorage.getItem(`pB_wallet_${agreementId}`)
          : null;

      return {
        agreementId,
        terms,
        partyAWallet: data.partyA ?? null,
        partyAApproved: data.partyAApproved ?? false,
        partyBApproved: data.partyBApproved ?? false,
        alreadyApproved:
          data.partyBApproved === true &&
          !!storedAddress &&
          data.partyB === storedAddress,
        storedAddress,
        partyBWallet: data.partyB ?? null,
        storedFundsLocked:
          typeof window !== "undefined"
            ? localStorage.getItem(`pB_fundsLocked_${agreementId}`) === "true"
            : false,
        storedAmountLocked:
          typeof window !== "undefined"
            ? (localStorage.getItem(`pB_amountLocked_${agreementId}`) ?? null)
            : null,
      };
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Failed to load agreement.",
      );
    }
  },
);

export const connectPartyBWalletThunk = createAsyncThunk(
  "partyB/connectWallet",
  async (_, { rejectWithValue }) => {
    try {
      if (isWalletConnected()) {
        const user = getConnectedUser();
        if (user) return user.address;
      }
      const user = await connectHiroWallet();
      return user.address;
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Wallet connect failed",
      );
    }
  },
);

export const approveAsPartyBThunk = createAsyncThunk(
  "partyB/approve",
  async (
    payload: { agreementId: string; address: string },
    { rejectWithValue },
  ) => {
    try {
      await registerParty(payload.agreementId, "partyB", payload.address);

      const result = await approveAgreement(
        payload.agreementId,
        "partyB",
        payload.address,
      );

      if (typeof window !== "undefined") {
        localStorage.setItem(
          `pB_wallet_${payload.agreementId}`,
          payload.address,
        );
        localStorage.setItem(`pB_agreementId`, payload.agreementId);
        savePartyBAgreementId(payload.agreementId);
      }

      try {
        await fetch(
          `${API_BASE}/api/agreement/${payload.agreementId}/partyb-wallet`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ walletAddress: payload.address }),
          },
        );
      } catch {
        // Non-fatal
      }

      return result;
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Approval failed",
      );
    }
  },
);

export const pollPartyBApprovalThunk = createAsyncThunk(
  "partyB/pollApproval",
  async (agreementId: string, { rejectWithValue }) => {
    try {
      return await getApprovalState(agreementId);
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Poll failed",
      );
    }
  },
);

// ── KEY FIX: disputeMilestoneAsPartyBThunk now polls for tx confirmation
// before notifying the DB — same pattern as Party A's pollMilestoneTxThunk.
// Previously it fired the /milestone endpoint immediately, so the backend
// got status="pending" and saved that to DB instead of "disputed".
export const disputeMilestoneAsPartyBThunk = createAsyncThunk(
  "partyB/disputeMilestone",
  async (
    payload: {
      agreementId: string;
      milestoneIndex: number;
      callerAddress: string;
      onConfirmed?: () => void;
    },
    { dispatch, rejectWithValue },
  ) => {
    // Step 1: submit tx on-chain
    let txId: string;
    try {
      txId = await callDisputeMilestone(
        payload.agreementId,
        payload.milestoneIndex,
      );
    } catch (err) {
      return rejectWithValue(
        err instanceof Error ? err.message : "dispute-milestone failed",
      );
    }

    const txUrl = explorerTxUrl(txId);

    // Update local state to "pending" immediately so UI shows spinner
    dispatch(
      setMilestoneTxState({
        index: payload.milestoneIndex,
        tx: { status: "pending", txId, error: null },
      }),
    );

    // Step 2: poll until confirmed (max 15 min)
    const MAX_POLLS = 180;
    let attempts = 0;

    while (attempts < MAX_POLLS) {
      await new Promise((r) => setTimeout(r, 5000));
      attempts++;

      try {
        const txStatus = await fetchTxStatus(txId);

        if (txStatus === "success") {
          // Step 3: notify DB + socket ONLY after confirmed
          try {
            await fetch(
              `${API_BASE}/api/agreement/${payload.agreementId}/milestone`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  milestoneIndex: payload.milestoneIndex,
                  action: "dispute",
                  txId,
                  txUrl,
                  callerAddress: payload.callerAddress,
                }),
              },
            );
          } catch (err) {
            console.warn("[partyB/disputeMilestone] DB notify failed:", err);
          }

          dispatch(
            setMilestoneTxState({
              index: payload.milestoneIndex,
              tx: { status: "confirmed", txId, error: null },
            }),
          );

          payload.onConfirmed?.();

          return {
            milestoneIndex: payload.milestoneIndex,
            txId,
            txUrl,
            status: "confirmed",
          };
        }

        if (
          txStatus === "abort_by_response" ||
          txStatus === "abort_by_post_condition"
        ) {
          dispatch(
            setMilestoneTxState({
              index: payload.milestoneIndex,
              tx: {
                status: "failed",
                txId,
                error: `Transaction aborted: ${txStatus}`,
              },
            }),
          );
          return rejectWithValue({
            milestoneIndex: payload.milestoneIndex,
            error: `Transaction aborted: ${txStatus}`,
          });
        }

        // Still pending — update confirming state
        dispatch(
          setMilestoneTxState({
            index: payload.milestoneIndex,
            tx: { status: "confirming", txId, error: null },
          }),
        );
      } catch {
        // Network hiccup — keep polling
      }
    }

    // Timed out
    dispatch(
      setMilestoneTxState({
        index: payload.milestoneIndex,
        tx: {
          status: "failed",
          txId,
          error: "Polling timed out. Check the explorer.",
        },
      }),
    );
    return rejectWithValue({
      milestoneIndex: payload.milestoneIndex,
      error: "Polling timeout",
    });
  },
);

// ── Slice ─────────────────────────────────────────────────────

const partyBSlice = createSlice({
  name: "partyB",
  initialState,
  reducers: {
    setScreen(state, action: PayloadAction<PartyBScreen>) {
      state.screen = action.payload;
      if (typeof window !== "undefined" && state.agreementId) {
        localStorage.setItem(`pB_screen_${state.agreementId}`, action.payload);
      }
    },
    applyApprovalUpdate(
      state,
      action: PayloadAction<{
        partyAApproved: boolean;
        partyBApproved: boolean;
        partyA?: string | null;
      }>,
    ) {
      state.partyAApproved = action.payload.partyAApproved;
      state.partyBApproved = action.payload.partyBApproved;
      if (action.payload.partyA && !state.partyAWallet) {
        state.partyAWallet = action.payload.partyA;
      }
    },
    notifyFundsLocked(state, action: PayloadAction<{ amountLocked: string }>) {
      state.fundsLocked = true;
      state.amountLocked = action.payload.amountLocked;
      state.screen = "dashboard";
      if (typeof window !== "undefined" && state.agreementId) {
        localStorage.setItem(`pB_screen_${state.agreementId}`, "dashboard");
        localStorage.setItem(`pB_fundsLocked_${state.agreementId}`, "true");
        localStorage.setItem(
          `pB_amountLocked_${state.agreementId}`,
          action.payload.amountLocked,
        );
      }
    },
    // Track per-milestone tx state
    setMilestoneTxState(
      state,
      action: PayloadAction<{
        index: number;
        tx: {
          status: "idle" | "pending" | "confirming" | "confirmed" | "failed";
          txId: string | null;
          error: string | null;
        };
      }>,
    ) {
      state.txMilestone = {
        ...state.txMilestone,
        [action.payload.index]: action.payload.tx,
      };
    },
    reset() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initPartyBThunk.pending, (state) => {
        state.screen = "loading";
        state.loadError = null;
      })
      .addCase(initPartyBThunk.fulfilled, (state, action) => {
        const p = action.payload;
        state.agreementId = p.agreementId;
        state.terms = p.terms;
        state.partyAWallet = p.partyAWallet;
        state.partyAApproved = p.partyAApproved;
        state.partyBApproved = p.partyBApproved;

        if (p.storedAddress) {
          state.walletConnected = true;
          state.walletAddress = p.storedAddress;
        }

        if (p.partyBApproved && p.storedAddress) {
          savePartyBAgreementId(p.agreementId);

          if (p.storedFundsLocked) {
            state.fundsLocked = true;
            state.amountLocked = p.storedAmountLocked;
          }

          const savedScreen =
            typeof window !== "undefined"
              ? localStorage.getItem(`pB_screen_${p.agreementId}`)
              : null;
          const safeScreens: PartyBScreen[] = ["waiting-funds", "dashboard"];
          state.screen =
            savedScreen && safeScreens.includes(savedScreen as PartyBScreen)
              ? (savedScreen as PartyBScreen)
              : "waiting-funds";
        } else {
          state.screen = "review";
        }
      })
      .addCase(initPartyBThunk.rejected, (state, action) => {
        state.screen = "error";
        state.loadError = action.payload as string;
      });

    builder
      .addCase(connectPartyBWalletThunk.pending, (state) => {
        state.connecting = true;
        state.connectError = null;
      })
      .addCase(connectPartyBWalletThunk.fulfilled, (state, action) => {
        state.connecting = false;
        state.walletConnected = true;
        state.walletAddress = action.payload;
      })
      .addCase(connectPartyBWalletThunk.rejected, (state, action) => {
        state.connecting = false;
        state.connectError = action.payload as string;
      });

    builder
      .addCase(approveAsPartyBThunk.pending, (state) => {
        state.approving = true;
        state.approveError = null;
      })
      .addCase(approveAsPartyBThunk.fulfilled, (state, action) => {
        state.approving = false;
        state.partyAApproved = action.payload.partyAApproved;
        state.partyBApproved = action.payload.partyBApproved;
        state.screen = "waiting-funds";
      })
      .addCase(approveAsPartyBThunk.rejected, (state, action) => {
        state.approving = false;
        state.approveError = action.payload as string;
      });

    builder.addCase(pollPartyBApprovalThunk.fulfilled, (state, action) => {
      state.partyAApproved = action.payload.partyAApproved;
      state.partyBApproved = action.payload.partyBApproved;
    });

    // disputeMilestoneAsPartyBThunk state tracking
    builder.addCase(disputeMilestoneAsPartyBThunk.rejected, (state, action) => {
      const p = action.payload as
        | { milestoneIndex: number; error: string }
        | undefined;
      if (p?.milestoneIndex !== undefined) {
        state.txMilestone = {
          ...state.txMilestone,
          [p.milestoneIndex]: { status: "failed", txId: null, error: p.error },
        };
      }
    });
  },
});

export const {
  setScreen,
  applyApprovalUpdate,
  notifyFundsLocked,
  setMilestoneTxState,
  reset,
} = partyBSlice.actions;
export default partyBSlice.reducer;
