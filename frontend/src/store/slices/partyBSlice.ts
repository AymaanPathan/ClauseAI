// ============================================================
// store/partyB/partyBSlice.ts — FIXED
//
// Key fix: approveAsPartyBThunk now saves agreementId to a
// pB_agreements JSON array in localStorage so Party B can see
// their history on any page that reads this list.
// Also saves partyB wallet address to the Agreement DB record.
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

// ── localStorage helpers ──────────────────────────────────────

/** Read the list of agreement IDs Party B has joined on this device */
export function getPartyBAgreementIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("pB_agreements");
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Add an agreement ID to Party B's local history (deduped) */
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
      // 1. Register presence (so Party A can see wallet)
      await registerParty(payload.agreementId, "partyB", payload.address);

      // 2. Approve
      const result = await approveAgreement(
        payload.agreementId,
        "partyB",
        payload.address,
      );

      // 3. Persist wallet for this agreement on this device
      if (typeof window !== "undefined") {
        localStorage.setItem(
          `pB_wallet_${payload.agreementId}`,
          payload.address,
        );
        localStorage.setItem(`pB_agreementId`, payload.agreementId);
        // KEY FIX: save to Party B's agreement history list
        savePartyBAgreementId(payload.agreementId);
      }

      // 4. Also update DB to store Party B's actual wallet address
      //    in a dedicated field so we can query by it later
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
        // Non-fatal — history still works via localStorage
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

        // KEY FIX: if Party B has previously approved this agreement
        // on this device, also add it to their history list
        if (p.partyBApproved && p.storedAddress) {
          savePartyBAgreementId(p.agreementId);
          state.screen = "waiting-funds";
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
  },
});

export const { setScreen, applyApprovalUpdate, notifyFundsLocked, reset } =
  partyBSlice.actions;
export default partyBSlice.reducer;
