// ============================================================
// store/slices/agreementSlice.ts
// ============================================================

import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { parseAgreement, ParsedAgreement, AgreementType } from "@/api/parseApi";

// ── Types ─────────────────────────────────────────────────────
export type AppScreen =
  | "landing"
  | "select-type"
  | "describe"
  | "parsed-terms"
  | "connect-wallet"
  | "share-link"
  | "lock-funds"
  | "dashboard"
  | "complete"
  | "timeout"
  | "dispute";

export type FundState =
  | "idle"
  | "locked"
  | "released"
  | "refunded"
  | "disputed";

export interface AgreementState {
  // navigation
  currentScreen: AppScreen;

  // form
  agreementType: AgreementType | null;
  rawText: string;
  partyAName: string;
  partyBName: string;
  arbitratorName: string;

  // parsed data
  parsedTerms: ParsedAgreement | null;
  editedTerms: ParsedAgreement | null;
  parseLoading: boolean;
  parseError: string | null;
  parseMeta: { provider: string; model: string; latency_ms: number } | null;

  // wallet
  walletConnected: boolean;
  walletAddress: string | null;
  counterpartyWallet: string | null;
  counterpartyConnected: boolean;

  // agreement lifecycle
  agreementId: string | null;
  shareLink: string | null;
  fundState: FundState;
  amountLocked: string | null;
  deadlineBlock: number | null;
  disputeOpenedBy: string | null;
}

const initialState: AgreementState = {
  currentScreen: "landing",
  agreementType: null,
  rawText: "",
  partyAName: "",
  partyBName: "",
  arbitratorName: "",
  parsedTerms: null,
  editedTerms: null,
  parseLoading: false,
  parseError: null,
  parseMeta: null,
  walletConnected: false,
  walletAddress: null,
  counterpartyWallet: null,
  counterpartyConnected: false,
  agreementId: null,
  shareLink: null,
  fundState: "idle",
  amountLocked: null,
  deadlineBlock: null,
  disputeOpenedBy: null,
};

// ── Async thunk ───────────────────────────────────────────────
export const parseAgreementThunk = createAsyncThunk(
  "agreement/parse",
  async (
    payload: { type: AgreementType; text: string },
    { rejectWithValue },
  ) => {
    try {
      const result = await parseAgreement(payload);
      if (!result.success || !result.data) {
        return rejectWithValue(result.error ?? "Parse failed");
      }
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      return rejectWithValue(msg);
    }
  },
);

// ── Slice ─────────────────────────────────────────────────────
const agreementSlice = createSlice({
  name: "agreement",
  initialState,
  reducers: {
    setScreen(state, action: PayloadAction<AppScreen>) {
      state.currentScreen = action.payload;
    },
    setAgreementType(state, action: PayloadAction<AgreementType>) {
      state.agreementType = action.payload;
      state.parsedTerms = null;
      state.editedTerms = null;
      state.parseError = null;
      state.rawText = "";
    },
    setRawText(state, action: PayloadAction<string>) {
      state.rawText = action.payload;
    },
    setPartyNames(
      state,
      action: PayloadAction<{
        partyA: string;
        partyB: string;
        arbitrator: string;
      }>,
    ) {
      state.partyAName = action.payload.partyA;
      state.partyBName = action.payload.partyB;
      state.arbitratorName = action.payload.arbitrator;
    },
    updateEditedTerms(state, action: PayloadAction<Partial<ParsedAgreement>>) {
      if (state.editedTerms) {
        state.editedTerms = { ...state.editedTerms, ...action.payload };
      }
    },
    approveTerms(state) {
      state.parsedTerms = state.editedTerms;
    },
    connectWallet(state, action: PayloadAction<string>) {
      state.walletConnected = true;
      state.walletAddress = action.payload;
    },
    disconnectWallet(state) {
      state.walletConnected = false;
      state.walletAddress = null;
    },
    setCounterpartyConnected(state, action: PayloadAction<string>) {
      state.counterpartyWallet = action.payload;
      state.counterpartyConnected = true;
    },
    generateShareLink(state) {
      const id = Math.random().toString(36).substring(2, 8).toUpperCase();
      state.agreementId = id;
      state.shareLink = `https://clauseai.xyz/agreement/${id}`;
    },
    lockFunds(state) {
      state.fundState = "locked";
      state.amountLocked = state.editedTerms?.amount_usd ?? null;
    },
    markComplete(state) {
      state.fundState = "released";
      state.currentScreen = "complete";
    },
    triggerTimeout(state) {
      state.fundState = "refunded";
      state.currentScreen = "timeout";
    },
    openDispute(state, action: PayloadAction<string>) {
      state.fundState = "disputed";
      state.disputeOpenedBy = action.payload;
      state.currentScreen = "dispute";
    },
    resetAll() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(parseAgreementThunk.pending, (state) => {
        state.parseLoading = true;
        state.parseError = null;
        state.parsedTerms = null;
        state.editedTerms = null;
      })
      .addCase(parseAgreementThunk.fulfilled, (state, action) => {
        state.parseLoading = false;
        state.parsedTerms = action.payload.data!;
        state.editedTerms = { ...action.payload.data! };

        // inject names from form if AI returned placeholders
        if (state.partyAName && state.editedTerms) {
          state.editedTerms.partyA = state.partyAName;
        }
        if (state.partyBName && state.editedTerms) {
          state.editedTerms.partyB = state.partyBName;
        }
        if (state.arbitratorName && state.editedTerms) {
          state.editedTerms.arbitrator = state.arbitratorName;
        }

        state.parseMeta = {
          provider: action.payload.meta.provider,
          model: action.payload.meta.model,
          latency_ms: action.payload.meta.latency_ms,
        };
      })
      .addCase(parseAgreementThunk.rejected, (state, action) => {
        state.parseLoading = false;
        state.parseError = action.payload as string;
      });
  },
});

export const {
  setScreen,
  setAgreementType,
  setRawText,
  setPartyNames,
  updateEditedTerms,
  approveTerms,
  connectWallet,
  disconnectWallet,
  setCounterpartyConnected,
  generateShareLink,
  lockFunds,
  markComplete,
  triggerTimeout,
  openDispute,
  resetAll,
} = agreementSlice.actions;

export default agreementSlice.reducer;
