// ============================================================
// store/slices/agreementSlice.ts  — DAY 6 UPDATE
// Added: wallet thunks, contract call thunks, polling thunk
// ============================================================

import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { parseAgreement, ParsedAgreement, AgreementType } from "@/api/parseApi";
import {
  callCreateAgreement,
  callDeposit,
  callComplete,
  callDispute,
  callTriggerTimeout,
  getAgreement,
  getAgreementState,
  getCurrentBlockHeight,
  CONTRACT_STATE,
  OnChainAgreement,
} from "@/api/stacksApi";
import {
  connectHiroWallet,
  disconnectHiroWallet,
  getConnectedUser,
  isWalletConnected,
} from "@/lib/hiroWallet";
import { explorerTxUrl } from "@/lib/stacksConfig";

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

export type TxStatus =
  | "idle"
  | "pending"
  | "confirming"
  | "confirmed"
  | "failed";

export interface TxState {
  status: TxStatus;
  txId: string | null;
  txUrl: string | null;
  error: string | null;
}

const emptyTx = (): TxState => ({
  status: "idle",
  txId: null,
  txUrl: null,
  error: null,
});

export interface AgreementState {
  currentScreen: AppScreen;

  // form
  agreementType: AgreementType | null;
  rawText: string;
  partyAName: string;
  partyBName: string;
  arbitratorName: string;

  // parsed
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

  // on-chain data (from polling)
  onChainData: OnChainAgreement | null;
  blockHeight: number;
  pollingActive: boolean;

  // tx states per action
  txCreate: TxState;
  txDeposit: TxState;
  txComplete: TxState;
  txDispute: TxState;
  txTimeout: TxState;
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
  onChainData: null,
  blockHeight: 0,
  pollingActive: false,
  txCreate: emptyTx(),
  txDeposit: emptyTx(),
  txComplete: emptyTx(),
  txDispute: emptyTx(),
  txTimeout: emptyTx(),
};

// ─────────────────────────────────────────────────────────────
// ASYNC THUNKS
// ─────────────────────────────────────────────────────────────

// ── Parse agreement (AI) ──────────────────────────────────────
export const parseAgreementThunk = createAsyncThunk(
  "agreement/parse",
  async (
    payload: { type: AgreementType; text: string },
    { rejectWithValue },
  ) => {
    try {
      const result = await parseAgreement(payload);
      if (!result.success || !result.data)
        return rejectWithValue(result.error ?? "Parse failed");
      return result;
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Network error",
      );
    }
  },
);

// ── Connect Hiro Wallet ───────────────────────────────────────
export const connectWalletThunk = createAsyncThunk(
  "agreement/connectWallet",
  async (_, { rejectWithValue }) => {
    // If already signed in, just return the user
    if (isWalletConnected()) {
      const user = getConnectedUser();
      if (user) return user.address;
    }
    return new Promise<string>((resolve, reject) => {
      connectHiroWallet((user) => resolve(user.address));
      // Timeout fallback after 60s
      setTimeout(() => reject(new Error("Wallet connect timed out")), 60_000);
    });
  },
);

// ── Create agreement on-chain ─────────────────────────────────
export const createAgreementThunk = createAsyncThunk(
  "agreement/createOnChain",
  async (
    payload: {
      agreementId: string;
      partyA: string;
      partyB: string;
      arbitrator: string;
      amountUsd: number;
    },
    { rejectWithValue },
  ) => {
    try {
      const txId = await callCreateAgreement(
        payload.agreementId,
        payload.partyA,
        payload.partyB,
        payload.arbitrator,
        payload.amountUsd,
      );
      return { txId, txUrl: explorerTxUrl(txId) };
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Create failed",
      );
    }
  },
);

// ── Deposit ───────────────────────────────────────────────────
export const depositThunk = createAsyncThunk(
  "agreement/deposit",
  async (
    payload: { agreementId: string; amountUsd: number; senderAddress: string },
    { rejectWithValue },
  ) => {
    try {
      const txId = await callDeposit(
        payload.agreementId,
        payload.amountUsd,
        payload.senderAddress,
      );
      return { txId, txUrl: explorerTxUrl(txId) };
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Deposit failed",
      );
    }
  },
);

// ── Complete ──────────────────────────────────────────────────
export const completeThunk = createAsyncThunk(
  "agreement/complete",
  async (agreementId: string, { rejectWithValue }) => {
    try {
      const txId = await callComplete(agreementId);
      return { txId, txUrl: explorerTxUrl(txId) };
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Complete failed",
      );
    }
  },
);

// ── Dispute ───────────────────────────────────────────────────
export const disputeThunk = createAsyncThunk(
  "agreement/dispute",
  async (agreementId: string, { rejectWithValue }) => {
    try {
      const txId = await callDispute(agreementId);
      return { txId, txUrl: explorerTxUrl(txId) };
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Dispute failed",
      );
    }
  },
);

// ── Trigger timeout ───────────────────────────────────────────
export const timeoutThunk = createAsyncThunk(
  "agreement/timeout",
  async (agreementId: string, { rejectWithValue }) => {
    try {
      const txId = await callTriggerTimeout(agreementId);
      return { txId, txUrl: explorerTxUrl(txId) };
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Timeout failed",
      );
    }
  },
);

// ── Poll on-chain state ───────────────────────────────────────
export const pollAgreementThunk = createAsyncThunk(
  "agreement/poll",
  async (agreementId: string, { rejectWithValue }) => {
    try {
      const [onChain, blockHeight] = await Promise.all([
        getAgreement(agreementId),
        getCurrentBlockHeight(),
      ]);
      return { onChain, blockHeight };
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Poll failed",
      );
    }
  },
);

// ─────────────────────────────────────────────────────────────
// SLICE
// ─────────────────────────────────────────────────────────────
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
      if (state.editedTerms)
        state.editedTerms = { ...state.editedTerms, ...action.payload };
    },
    approveTerms(state) {
      state.parsedTerms = state.editedTerms;
    },
    // Sync wallet connect (used after thunk resolves)
    setWalletAddress(state, action: PayloadAction<string>) {
      state.walletConnected = true;
      state.walletAddress = action.payload;
    },
    disconnectWallet(state) {
      disconnectHiroWallet();
      state.walletConnected = false;
      state.walletAddress = null;
    },
    setCounterpartyConnected(state, action: PayloadAction<string>) {
      state.counterpartyWallet = action.payload;
      state.counterpartyConnected = true;
    },
    generateShareLink(state) {
      if (!state.agreementId) {
        state.agreementId = Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase();
      }
      state.shareLink = `${typeof window !== "undefined" ? window.location.origin : "https://clauseai.xyz"}/agreement/${state.agreementId}`;
    },
    setAgreementId(state, action: PayloadAction<string>) {
      state.agreementId = action.payload;
      state.shareLink = `${typeof window !== "undefined" ? window.location.origin : "https://clauseai.xyz"}/agreement/${action.payload}`;
    },
    // Used by polling to sync on-chain state to UI
    syncOnChainState(state, action: PayloadAction<OnChainAgreement>) {
      const data = action.payload;
      state.onChainData = data;
      // Sync fund state
      if (data.state === CONTRACT_STATE.ACTIVE) state.fundState = "locked";
      if (data.state === CONTRACT_STATE.COMPLETE) {
        state.fundState = "released";
        state.currentScreen = "complete";
      }
      if (data.state === CONTRACT_STATE.REFUNDED) {
        state.fundState = "refunded";
        state.currentScreen = "timeout";
      }
      if (data.state === CONTRACT_STATE.DISPUTED) {
        state.fundState = "disputed";
        state.currentScreen = "dispute";
      }
      // Sync deadline block
      if (data.deadlineBlock > BigInt(0))
        state.deadlineBlock = Number(data.deadlineBlock);
      // Sync amount (microSTX → rough USD)
      if (data.totalDeposited > BigInt(0)) {
        const stx = Number(data.totalDeposited) / 1_000_000;
        state.amountLocked = (stx * 0.8).toFixed(2);
      }
    },
    setBlockHeight(state, action: PayloadAction<number>) {
      state.blockHeight = action.payload;
    },
    setPollingActive(state, action: PayloadAction<boolean>) {
      state.pollingActive = action.payload;
    },
    // Optimistic local state updates (fallback when chain is slow)
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

  // ── Extra reducers (thunk lifecycle) ──────────────────────────
  extraReducers: (builder) => {
    // parse
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
        if (state.partyAName) state.editedTerms!.partyA = state.partyAName;
        if (state.partyBName) state.editedTerms!.partyB = state.partyBName;
        if (state.arbitratorName)
          state.editedTerms!.arbitrator = state.arbitratorName;
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

    // connectWallet
    builder.addCase(connectWalletThunk.fulfilled, (state, action) => {
      state.walletConnected = true;
      state.walletAddress = action.payload;
    });

    // createAgreement
    builder
      .addCase(createAgreementThunk.pending, (state) => {
        state.txCreate = {
          status: "pending",
          txId: null,
          txUrl: null,
          error: null,
        };
      })
      .addCase(createAgreementThunk.fulfilled, (state, action) => {
        state.txCreate = {
          status: "confirming",
          txId: action.payload.txId,
          txUrl: action.payload.txUrl,
          error: null,
        };
      })
      .addCase(createAgreementThunk.rejected, (state, action) => {
        state.txCreate = {
          status: "failed",
          txId: null,
          txUrl: null,
          error: action.payload as string,
        };
      });

    // deposit
    builder
      .addCase(depositThunk.pending, (state) => {
        state.txDeposit = {
          status: "pending",
          txId: null,
          txUrl: null,
          error: null,
        };
      })
      .addCase(depositThunk.fulfilled, (state, action) => {
        state.txDeposit = {
          status: "confirming",
          txId: action.payload.txId,
          txUrl: action.payload.txUrl,
          error: null,
        };
        state.fundState = "locked";
        state.amountLocked = state.editedTerms?.amount_usd ?? null;
      })
      .addCase(depositThunk.rejected, (state, action) => {
        state.txDeposit = {
          status: "failed",
          txId: null,
          txUrl: null,
          error: action.payload as string,
        };
      });

    // complete
    builder
      .addCase(completeThunk.pending, (state) => {
        state.txComplete = {
          status: "pending",
          txId: null,
          txUrl: null,
          error: null,
        };
      })
      .addCase(completeThunk.fulfilled, (state, action) => {
        state.txComplete = {
          status: "confirming",
          txId: action.payload.txId,
          txUrl: action.payload.txUrl,
          error: null,
        };
        state.fundState = "released";
        state.currentScreen = "complete";
      })
      .addCase(completeThunk.rejected, (state, action) => {
        state.txComplete = {
          status: "failed",
          txId: null,
          txUrl: null,
          error: action.payload as string,
        };
      });

    // dispute
    builder
      .addCase(disputeThunk.pending, (state) => {
        state.txDispute = {
          status: "pending",
          txId: null,
          txUrl: null,
          error: null,
        };
      })
      .addCase(disputeThunk.fulfilled, (state, action) => {
        state.txDispute = {
          status: "confirming",
          txId: action.payload.txId,
          txUrl: action.payload.txUrl,
          error: null,
        };
        state.fundState = "disputed";
        state.currentScreen = "dispute";
      })
      .addCase(disputeThunk.rejected, (state, action) => {
        state.txDispute = {
          status: "failed",
          txId: null,
          txUrl: null,
          error: action.payload as string,
        };
      });

    // timeout
    builder
      .addCase(timeoutThunk.pending, (state) => {
        state.txTimeout = {
          status: "pending",
          txId: null,
          txUrl: null,
          error: null,
        };
      })
      .addCase(timeoutThunk.fulfilled, (state, action) => {
        state.txTimeout = {
          status: "confirming",
          txId: action.payload.txId,
          txUrl: action.payload.txUrl,
          error: null,
        };
        state.fundState = "refunded";
        state.currentScreen = "timeout";
      })
      .addCase(timeoutThunk.rejected, (state, action) => {
        state.txTimeout = {
          status: "failed",
          txId: null,
          txUrl: null,
          error: action.payload as string,
        };
      });

    // poll
    builder.addCase(pollAgreementThunk.fulfilled, (state, action) => {
      const { onChain, blockHeight } = action.payload;
      if (blockHeight) state.blockHeight = blockHeight;
      if (onChain) {
        state.onChainData = onChain;
        // Sync state machine
        if (onChain.state === CONTRACT_STATE.ACTIVE) state.fundState = "locked";
        if (
          onChain.state === CONTRACT_STATE.COMPLETE &&
          state.currentScreen === "dashboard"
        ) {
          state.fundState = "released";
          state.currentScreen = "complete";
        }
        if (
          onChain.state === CONTRACT_STATE.REFUNDED &&
          state.currentScreen === "dashboard"
        ) {
          state.fundState = "refunded";
          state.currentScreen = "timeout";
        }
        if (onChain.state === CONTRACT_STATE.DISPUTED)
          state.fundState = "disputed";
        if (onChain.deadlineBlock > BigInt(0))
          state.deadlineBlock = Number(onChain.deadlineBlock);
      }
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
  setWalletAddress,
  disconnectWallet,
  setCounterpartyConnected,
  generateShareLink,
  setAgreementId,
  syncOnChainState,
  setBlockHeight,
  setPollingActive,
  lockFunds,
  markComplete,
  triggerTimeout,
  openDispute,
  resetAll,
} = agreementSlice.actions;

export default agreementSlice.reducer;
