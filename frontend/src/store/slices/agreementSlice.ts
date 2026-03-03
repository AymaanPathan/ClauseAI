// ============================================================
// store/slices/agreementSlice.ts  — PRODUCTION UPDATE
// Key changes:
//   • isPartyB flag + role awareness
//   • registerPresenceThunk — POST wallet to presence API
//   • pollPresenceThunk — GET presence, detect counterparty
//   • rehydrateFromSession — restore wallet on page reload
//   • All thunks properly typed
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
import {
  registerParty,
  getPresence,
  hashTerms,
  PresenceState,
} from "../../api/PresenceaApi";

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

  // role
  isPartyB: boolean; // true when this user joined via share link

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

  // presence
  presenceRegistered: boolean;
  presenceError: string | null;

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
  isPartyB: false,
  agreementId: null,
  shareLink: null,
  fundState: "idle",
  amountLocked: null,
  deadlineBlock: null,
  disputeOpenedBy: null,
  onChainData: null,
  blockHeight: 0,
  pollingActive: false,
  presenceRegistered: false,
  presenceError: null,
  txCreate: emptyTx(),
  txDeposit: emptyTx(),
  txComplete: emptyTx(),
  txDispute: emptyTx(),
  txTimeout: emptyTx(),
};

// ─────────────────────────────────────────────────────────────
// ASYNC THUNKS
// ─────────────────────────────────────────────────────────────

// ── Parse agreement ───────────────────────────────────────────
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

// ── Connect wallet ────────────────────────────────────────────
export const connectWalletThunk = createAsyncThunk(
  "agreement/connectWallet",
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

// ── Register presence on server ───────────────────────────────
// Called after wallet connect, for both Party A and Party B
export const registerPresenceThunk = createAsyncThunk(
  "agreement/registerPresence",
  async (
    payload: {
      agreementId: string;
      role: "partyA" | "partyB";
      address: string;
      termsHash?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const presence = await registerParty(
        payload.agreementId,
        payload.role,
        payload.address,
        payload.termsHash,
      );
      return presence;
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Presence registration failed",
      );
    }
  },
);

// ── Poll presence (used by Party A on share-link screen) ──────
export const pollPresenceThunk = createAsyncThunk(
  "agreement/pollPresence",
  async (agreementId: string, { rejectWithValue }) => {
    try {
      return await getPresence(agreementId);
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Presence poll failed",
      );
    }
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

// ── Timeout ───────────────────────────────────────────────────
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
    setWalletAddress(state, action: PayloadAction<string>) {
      state.walletConnected = true;
      state.walletAddress = action.payload;
    },
    disconnectWallet(state) {
      disconnectHiroWallet();
      state.walletConnected = false;
      state.walletAddress = null;
    },
    // Used by Party B's join page to set their role
    setAsPartyB(
      state,
      action: PayloadAction<{ agreementId: string; address: string }>,
    ) {
      state.isPartyB = true;
      state.walletConnected = true;
      state.walletAddress = action.payload.address;
      state.agreementId = action.payload.agreementId;
      state.shareLink = `${typeof window !== "undefined" ? window.location.origin : "https://clauseai.xyz"}/agreement/${action.payload.agreementId}`;
      state.counterpartyConnected = false; // Party A is the counterparty from B's perspective
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
    // Rehydrate wallet session from localStorage on mount
    rehydrateSession(state) {
      if (typeof window === "undefined") return;
      const address = localStorage.getItem("clauseai_wallet_address");
      const agreementId = localStorage.getItem("clauseai_agreement_id");
      const isPartyB = localStorage.getItem("clauseai_is_party_b") === "true";
      if (address) {
        state.walletConnected = true;
        state.walletAddress = address;
      }
      if (agreementId) {
        state.agreementId = agreementId;
        state.shareLink = `${window.location.origin}/agreement/${agreementId}`;
      }
      if (isPartyB) {
        state.isPartyB = true;
      }
    },
    syncOnChainState(state, action: PayloadAction<OnChainAgreement>) {
      const data = action.payload;
      state.onChainData = data;
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
      if (data.deadlineBlock > BigInt(0))
        state.deadlineBlock = Number(data.deadlineBlock);
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
      if (typeof window !== "undefined") {
        localStorage.removeItem("clauseai_agreement_id");
        localStorage.removeItem("clauseai_is_party_b");
      }
      return initialState;
    },
  },

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
    builder
      .addCase(connectWalletThunk.fulfilled, (state, action) => {
        state.walletConnected = true;
        state.walletAddress = action.payload;
        // Persist to localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem("clauseai_wallet_address", action.payload);
        }
      })
      .addCase(connectWalletThunk.rejected, (state, action) => {
        state.presenceError = action.payload as string;
      });

    // registerPresence
    builder
      .addCase(registerPresenceThunk.fulfilled, (state, action) => {
        state.presenceRegistered = true;
        state.presenceError = null;
        const presence = action.payload as PresenceState;
        // If both connected, sync counterparty
        if (presence.bothConnected) {
          if (state.isPartyB && presence.partyA) {
            state.counterpartyWallet = presence.partyA;
            state.counterpartyConnected = true;
          } else if (!state.isPartyB && presence.partyB) {
            state.counterpartyWallet = presence.partyB;
            state.counterpartyConnected = true;
          }
        }
      })
      .addCase(registerPresenceThunk.rejected, (state, action) => {
        state.presenceError = action.payload as string;
      });

    // pollPresence
    builder.addCase(pollPresenceThunk.fulfilled, (state, action) => {
      const presence = action.payload as PresenceState;
      if (state.isPartyB) {
        // Party B is polling — looking for Party A
        if (presence.partyA && !state.counterpartyConnected) {
          state.counterpartyWallet = presence.partyA;
          state.counterpartyConnected = true;
        }
      } else {
        // Party A is polling — looking for Party B
        if (presence.partyB && !state.counterpartyConnected) {
          state.counterpartyWallet = presence.partyB;
          state.counterpartyConnected = true;
        }
      }
    });

    // createAgreement
    builder
      .addCase(createAgreementThunk.pending, (state) => {
        state.txCreate = { status: "pending", txId: null, txUrl: null, error: null };
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
        state.txDeposit = { status: "pending", txId: null, txUrl: null, error: null };
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
        state.txComplete = { status: "pending", txId: null, txUrl: null, error: null };
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
        state.txDispute = { status: "pending", txId: null, txUrl: null, error: null };
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
        state.txTimeout = { status: "pending", txId: null, txUrl: null, error: null };
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

    // poll on-chain
    builder.addCase(pollAgreementThunk.fulfilled, (state, action) => {
      const { onChain, blockHeight } = action.payload;
      if (blockHeight) state.blockHeight = blockHeight;
      if (onChain) {
        state.onChainData = onChain;
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
  setAsPartyB,
  setCounterpartyConnected,
  generateShareLink,
  setAgreementId,
  rehydrateSession,
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