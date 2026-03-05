// ============================================================
// store/slices/agreementSlice.ts — PRODUCTION v2
// FIXES:
//   1. BigInt removed everywhere — deadlineBlock/amount/totalDeposited
//      are all plain number now (contractReads.ts also updated)
//   2. rehydrateSession now restores editedTerms from localStorage
//   3. generateShareLink and setAsPartyB persist editedTerms
//   4. syncOnChainState uses number comparisons (no BigInt)
// ============================================================

import {
  createSlice,
  createAsyncThunk,
  PayloadAction,
  createAction,
} from "@reduxjs/toolkit";
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
  PresenceState,
} from "../../api/PresenceaApi";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

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
  agreementType: AgreementType | null;
  rawText: string;
  partyAName: string;
  partyBName: string;
  arbitratorName: string;
  parsedTerms: ParsedAgreement | null;
  editedTerms: ParsedAgreement | null;
  parseLoading: boolean;
  parseError: string | null;
  parseMeta: { provider: string; model: string; latency_ms: number } | null;
  walletConnected: boolean;
  walletAddress: string | null;
  counterpartyWallet: string | null;
  counterpartyConnected: boolean;
  isPartyB: boolean;
  agreementId: string | null;
  shareLink: string | null;
  fundState: FundState;
  amountLocked: string | null;
  deadlineBlock: number | null;
  disputeOpenedBy: string | null;
  myDepositDone: boolean;
  onChainData: OnChainAgreement | null;
  blockHeight: number;
  pollingActive: boolean;
  presenceRegistered: boolean;
  presenceError: string | null;
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
  myDepositDone: false,
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

export const registerPresenceThunk = createAsyncThunk(
  "agreement/registerPresence",
  async (
    payload: {
      agreementId: string;
      role: "partyA" | "partyB";
      address: string;
      termsHash?: string;
      termsSnapshot?: Record<string, unknown>;
    },
    { rejectWithValue },
  ) => {
    try {
      return await registerParty(
        payload.agreementId,
        payload.role,
        payload.address,
        payload.termsHash,
        payload.termsSnapshot,
      );
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Presence registration failed",
      );
    }
  },
);

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

export const fetchTermsForPartyBThunk = createAsyncThunk(
  "agreement/fetchTermsForPartyB",
  async (agreementId: string, { rejectWithValue }) => {
    try {
      return await getPresence(agreementId);
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Failed to load agreement terms",
      );
    }
  },
);

export const rehydratePartyBThunk = createAsyncThunk(
  "agreement/rehydratePartyB",
  async (agreementId: string, { rejectWithValue }) => {
    try {
      if (typeof window === "undefined") return null;
      const storedAddress = localStorage.getItem("clauseai_wallet_address");
      const storedIsPartyB =
        localStorage.getItem(`clauseai_is_party_b_${agreementId}`) === "true";
      if (!storedAddress || !storedIsPartyB) return null;
      const presence = await registerParty(
        agreementId,
        "partyB",
        storedAddress,
      );
      return { address: storedAddress, presence };
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Rehydration failed",
      );
    }
  },
);

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

export const presenceUpdated = createAction<PresenceState>(
  "agreement/presenceUpdated",
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

    // ── FIX: also persist editedTerms so rehydrateSession can restore them ──
    setAsPartyB(
      state,
      action: PayloadAction<{ agreementId: string; address: string }>,
    ) {
      state.isPartyB = true;
      state.walletConnected = true;
      state.walletAddress = action.payload.address;
      state.agreementId = action.payload.agreementId;
      state.shareLink = buildShareLink(action.payload.agreementId);
      state.counterpartyConnected = false;
      if (typeof window !== "undefined") {
        localStorage.setItem("clauseai_wallet_address", action.payload.address);
        localStorage.setItem(
          `clauseai_is_party_b_${action.payload.agreementId}`,
          "true",
        );
        localStorage.setItem(
          "clauseai_agreement_id",
          action.payload.agreementId,
        );
        // Persist terms so dashboard can show condition/deadline/arbitrator
        if (state.editedTerms) {
          localStorage.setItem(
            "clauseai_terms",
            JSON.stringify(state.editedTerms),
          );
        }
      }
    },

    setCounterpartyConnected(state, action: PayloadAction<string>) {
      state.counterpartyWallet = action.payload;
      state.counterpartyConnected = true;
    },

    // ── FIX: persist terms when Party A generates share link ────────────────
    generateShareLink(state) {
      if (!state.agreementId) {
        state.agreementId = Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase();
      }
      state.shareLink = buildShareLink(state.agreementId);
      if (typeof window !== "undefined") {
        localStorage.setItem("clauseai_agreement_id", state.agreementId);
        if (state.editedTerms) {
          localStorage.setItem(
            "clauseai_terms",
            JSON.stringify(state.editedTerms),
          );
        }
      }
    },

    setAgreementId(state, action: PayloadAction<string>) {
      state.agreementId = action.payload;
      state.shareLink = buildShareLink(action.payload);
    },

    // ── FIX: restore editedTerms from localStorage ───────────────────────────
    rehydrateSession(state) {
      if (typeof window === "undefined") return;
      const address = localStorage.getItem("clauseai_wallet_address");
      const agreementId = localStorage.getItem("clauseai_agreement_id");
      if (address) {
        state.walletConnected = true;
        state.walletAddress = address;
      }
      if (agreementId) {
        state.agreementId = agreementId;
        state.shareLink = buildShareLink(agreementId);
        const isPartyB =
          localStorage.getItem(`clauseai_is_party_b_${agreementId}`) === "true";
        if (isPartyB) state.isPartyB = true;
      }
      // Restore terms — this is why dashboard showed "—" for condition/deadline/arbitrator
      const termsRaw = localStorage.getItem("clauseai_terms");
      if (termsRaw) {
        try {
          const terms = JSON.parse(termsRaw) as ParsedAgreement;
          state.editedTerms = terms;
          state.parsedTerms = terms;
        } catch {
          // corrupted — ignore, will show "—" gracefully
        }
      }
    },

    applyPresenceUpdate(state, action: PayloadAction<PresenceState>) {
      applyPresence(state, action.payload);
    },

    // ── FIX: BigInt removed — all fields are plain number now ────────────────
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
      // FIX: was > BigInt(0), now plain number comparison
      if (data.deadlineBlock > 0) state.deadlineBlock = Number(data.deadlineBlock);
      if (data.totalDeposited > 0) {
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
      state.myDepositDone = true;
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
        Object.keys(localStorage)
          .filter((k) => k.startsWith("clauseai_"))
          .forEach((k) => localStorage.removeItem(k));
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
        applyPresence(state, action.payload as PresenceState);
      })
      .addCase(registerPresenceThunk.rejected, (state, action) => {
        state.presenceError = action.payload as string;
      });

    // pollPresence
    builder.addCase(pollPresenceThunk.fulfilled, (state, action) => {
      applyPresence(state, action.payload as PresenceState);
    });

    // presenceUpdated (from SSE)
    builder.addCase(presenceUpdated, (state, action) => {
      applyPresence(state, action.payload);
    });

    // fetchTermsForPartyB
    builder
      .addCase(fetchTermsForPartyBThunk.pending, (state) => {
        state.parseLoading = true;
        state.parseError = null;
      })
      .addCase(fetchTermsForPartyBThunk.fulfilled, (state, action) => {
        state.parseLoading = false;
        const presence = action.payload as PresenceState;
        applyPresence(state, presence);
        if (presence.termsSnapshot) {
          const terms = presence.termsSnapshot as unknown as ParsedAgreement;
          state.parsedTerms = terms;
          state.editedTerms = { ...terms };
          // Persist so dashboard can rehydrate them
          if (typeof window !== "undefined") {
            localStorage.setItem("clauseai_terms", JSON.stringify(terms));
          }
        }
        if (presence.partyA) {
          state.counterpartyWallet = presence.partyA;
          state.counterpartyConnected = true;
        }
      })
      .addCase(fetchTermsForPartyBThunk.rejected, (state, action) => {
        state.parseLoading = false;
        state.parseError = action.payload as string;
      });

    // rehydratePartyB
    builder.addCase(rehydratePartyBThunk.fulfilled, (state, action) => {
      if (!action.payload) return;
      const { address, presence } = action.payload;
      state.walletConnected = true;
      state.walletAddress = address;
      state.isPartyB = true;
      state.presenceRegistered = true;
      applyPresence(state, presence);
      if (presence.termsSnapshot) {
        const terms = presence.termsSnapshot as unknown as ParsedAgreement;
        state.parsedTerms = terms;
        state.editedTerms = { ...terms };
        if (typeof window !== "undefined") {
          localStorage.setItem("clauseai_terms", JSON.stringify(terms));
        }
      }
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
        state.myDepositDone = true;
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

    // ── FIX: pollAgreementThunk — BigInt removed ─────────────────────────────
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
        // FIX: was > BigInt(0) — contractReads now returns plain number
        if (onChain.deadlineBlock > 0)
          state.deadlineBlock = Number(onChain.deadlineBlock);
      }
    });
  },
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function buildShareLink(id: string): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://clauseai.xyz";
  return `${origin}/agreement/${id}`;
}

function applyPresence(state: AgreementState, presence: PresenceState) {
  if (state.isPartyB) {
    if (presence.partyA && !state.counterpartyConnected) {
      state.counterpartyWallet = presence.partyA;
      state.counterpartyConnected = true;
    }
  } else {
    if (presence.partyB && !state.counterpartyConnected) {
      state.counterpartyWallet = presence.partyB;
      state.counterpartyConnected = true;
    }
  }
}

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
  applyPresenceUpdate,
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
