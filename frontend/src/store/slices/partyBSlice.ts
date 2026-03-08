// ============================================================
// store/partyB/partyBSlice.ts
//
// ISOLATED state for Party B only. Party B's journey:
//   Opens /agreement/[id] → Reviews terms → Connects wallet
//   → Approves agreement → Waits for Party A to lock funds
//   → Both get notified → Dashboard
//
// This slice NEVER shares state with partyASlice.
// ============================================================

import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { ParsedAgreement, ParsedAgreementV2 } from "@/api/parseApi";
import {
  connectHiroWallet,
  isWalletConnected,
  getConnectedUser,
} from "@/lib/hiroWallet";
import { approveAgreement, getApprovalState } from "@/api/approvalApi";
import { registerParty } from "@/api/PresenceaApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type PartyBScreen =
  | "loading" // fetching agreement from server
  | "error" // agreement not found / server error
  | "review" // reading terms
  | "connect-wallet" // connecting Leather wallet
  | "approve" // confirming approval
  | "waiting-funds" // waiting for Party A to lock funds
  | "dashboard"; // both done, funds locked

export interface PartyBState {
  screen: PartyBScreen;
  agreementId: string | null;
  loadError: string | null;

  // Agreement terms (fetched from server)
  terms: ParsedAgreement | ParsedAgreementV2 | null;
  partyAWallet: string | null; // Party A's wallet (counterparty)

  // Party B wallet
  walletConnected: boolean;
  walletAddress: string | null;

  // Approval state (always fetched fresh — never from localStorage)
  partyAApproved: boolean;
  partyBApproved: boolean;

  // UX state
  approving: boolean;
  approveError: string | null;
  connecting: boolean;
  connectError: string | null;

  // Fund notification
  fundsLocked: boolean;
  amountLocked: string | null;
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
};

// ── Thunks ─────────────────────────────────────────────────────

/**
 * Init Party B: always fetches from server. Never trusts localStorage
 * for approval flags. Only uses localStorage to restore wallet address.
 */
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

      // Only restore wallet if this device previously joined as Party B
      const storedAddress =
        typeof window !== "undefined"
          ? localStorage.getItem(`pB_wallet_${agreementId}`)
          : null;

      return {
        agreementId,
        terms: data.termsSnapshot ?? null,
        partyAWallet: data.partyA ?? null,
        partyAApproved: data.partyAApproved ?? false,
        partyBApproved: data.partyBApproved ?? false,
        // "already approved" = server confirms AND same device/wallet
        alreadyApproved:
          data.partyBApproved === true &&
          !!storedAddress &&
          data.partyB === storedAddress,
        storedAddress,
        partyBWallet: data.partyB ?? null,
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
      // Register presence first (so Party A can see our wallet)
      await registerParty(payload.agreementId, "partyB", payload.address);
      // Then approve
      const result = await approveAgreement(
        payload.agreementId,
        "partyB",
        payload.address,
      );
      // Persist wallet for this agreement on this device
      if (typeof window !== "undefined") {
        localStorage.setItem(
          `pB_wallet_${payload.agreementId}`,
          payload.address,
        );
        localStorage.setItem(`pB_agreementId`, payload.agreementId);
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

// ── Slice ─────────────────────────────────────────────────────

const partyBSlice = createSlice({
  name: "partyB",
  initialState,
  reducers: {
    setScreen(state, action: PayloadAction<PartyBScreen>) {
      state.screen = action.payload;
    },

    /** Called from SSE stream when approval state changes */
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

    /** Called when SSE or polling detects funds are locked */
    notifyFundsLocked(state, action: PayloadAction<{ amountLocked: string }>) {
      state.fundsLocked = true;
      state.amountLocked = action.payload.amountLocked;
      state.screen = "dashboard";
    },

    reset() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    // initPartyB
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

        // Route determination:
        if (p.alreadyApproved) {
          // Returning Party B who already approved → straight to waiting
          state.screen = "waiting-funds";
        } else {
          // Fresh Party B → start at review
          state.screen = "review";
        }
      })
      .addCase(initPartyBThunk.rejected, (state, action) => {
        state.screen = "error";
        state.loadError = action.payload as string;
      });

    // connectWallet
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

    // approve
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

    // poll approval
    builder.addCase(pollPartyBApprovalThunk.fulfilled, (state, action) => {
      state.partyAApproved = action.payload.partyAApproved;
      state.partyBApproved = action.payload.partyBApproved;
    });
  },
});

export const { setScreen, applyApprovalUpdate, notifyFundsLocked, reset } =
  partyBSlice.actions;
export default partyBSlice.reducer;
