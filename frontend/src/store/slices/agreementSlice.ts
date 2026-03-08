// ============================================================
// store/slices/agreementSlice.ts — MILESTONE ESCROW v3
//
// New state:
//   • milestones: OnChainMilestone[] — synced from chain
//   • milestoneInputs: MilestoneInput[] — user-defined before deploy
//   • txMilestone: Record<number, TxState> — per-milestone tx tracking
//
// New thunks:
//   • completeMilestoneThunk(id, index)
//   • disputeMilestoneThunk(id, index)
//   • triggerMilestoneTimeoutThunk(id, index)
//   • triggerArbTimeoutThunk(id, index)  (now takes index)
//   • pollAgreementThunk — now also fetches all milestones
//   • approveAgreementThunk(id, role, address)   ← NEW
//   • pollApprovalThunk(id)                      ← NEW
// ============================================================

import {
  createSlice,
  createAsyncThunk,
  PayloadAction,
  createAction,
} from "@reduxjs/toolkit";
import {
  parseAgreement,
  ParsedAgreement,
  AgreementType,
  ParsedAgreementV2,
} from "@/api/parseApi";
import {
  callCreateAgreement,
  callDeposit,
  callCompleteMilestone,
  callDisputeMilestone,
  callTriggerMilestoneTimeout,
  callTriggerArbTimeout,
  MilestoneInput,
} from "@/lib/contractCalls";
import {
  getAgreement,
  getAllMilestones,
  getCurrentBlockHeight,
  OnChainMilestone,
  OnChainAgreement,
} from "@/lib/contractReads";
import {
  connectHiroWallet,
  disconnectHiroWallet,
  getConnectedUser,
  isWalletConnected,
} from "@/lib/hiroWallet";
import { CONTRACT_STATE, explorerTxUrl } from "@/lib/stacksConfig";
import {
  registerParty,
  getPresence,
  PresenceState,
} from "../../api/PresenceaApi";
import {
  approveAgreement,
  getApprovalState,
  ApprovalState,
} from "../../api/approvalApi";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type AppScreen =
  | "landing"
  | "select-type"
  | "describe"
  | "parsed-terms"
  | "connect-wallet"
  | "set-arbitrator" // ← NEW
  | "approve-agreement" // ← NEW
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
  partyAApproved: boolean;
  partyBApproved: boolean;
  arbitratorName: string;
  parsedTerms: ParsedAgreement | ParsedAgreementV2 | null;
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

  // ── Milestone state ──────────────────────────────────────────
  /** User-defined milestone inputs before deployment */
  milestoneInputs: MilestoneInput[];
  /** Live on-chain milestone data (fetched during polling) */
  milestones: OnChainMilestone[];
  /** Per-milestone tx states keyed by milestone index */
  txMilestone: Record<number, TxState>;

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
  partyAApproved: false,
  partyBApproved: false,
  milestoneInputs: [],
  milestones: [],
  txMilestone: {},

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

// ── create-agreement (v3: includes milestones) ────────────────
export const createAgreementThunk = createAsyncThunk(
  "agreement/createOnChain",
  async (
    payload: {
      agreementId: string;
      partyA: string;
      partyB: string;
      arbitrator: string;
      amountUsd: number;
      milestones: MilestoneInput[];
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
        payload.milestones,
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

// ── complete-milestone ────────────────────────────────────────
export const completeMilestoneThunk = createAsyncThunk(
  "agreement/completeMilestone",
  async (
    payload: { agreementId: string; milestoneIndex: number },
    { rejectWithValue },
  ) => {
    try {
      const txId = await callCompleteMilestone(
        payload.agreementId,
        payload.milestoneIndex,
      );
      return {
        txId,
        txUrl: explorerTxUrl(txId),
        milestoneIndex: payload.milestoneIndex,
      };
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Complete milestone failed",
      );
    }
  },
);

// ── dispute-milestone ─────────────────────────────────────────
export const disputeMilestoneThunk = createAsyncThunk(
  "agreement/disputeMilestone",
  async (
    payload: { agreementId: string; milestoneIndex: number },
    { rejectWithValue },
  ) => {
    try {
      const txId = await callDisputeMilestone(
        payload.agreementId,
        payload.milestoneIndex,
      );
      return {
        txId,
        txUrl: explorerTxUrl(txId),
        milestoneIndex: payload.milestoneIndex,
      };
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Dispute milestone failed",
      );
    }
  },
);

// ── trigger-milestone-timeout ─────────────────────────────────
export const triggerMilestoneTimeoutThunk = createAsyncThunk(
  "agreement/triggerMilestoneTimeout",
  async (
    payload: { agreementId: string; milestoneIndex: number },
    { rejectWithValue },
  ) => {
    try {
      const txId = await callTriggerMilestoneTimeout(
        payload.agreementId,
        payload.milestoneIndex,
      );
      return {
        txId,
        txUrl: explorerTxUrl(txId),
        milestoneIndex: payload.milestoneIndex,
      };
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Milestone timeout failed",
      );
    }
  },
);

// ── trigger-arb-timeout (per milestone) ──────────────────────
export const triggerArbTimeoutThunk = createAsyncThunk(
  "agreement/triggerArbTimeout",
  async (
    payload: { agreementId: string; milestoneIndex: number },
    { rejectWithValue },
  ) => {
    try {
      const txId = await callTriggerArbTimeout(
        payload.agreementId,
        payload.milestoneIndex,
      );
      return {
        txId,
        txUrl: explorerTxUrl(txId),
        milestoneIndex: payload.milestoneIndex,
      };
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Arb timeout failed",
      );
    }
  },
);

// ── pollAgreementThunk — now also fetches all milestones ──────
export const pollAgreementThunk = createAsyncThunk(
  "agreement/poll",
  async (agreementId: string, { rejectWithValue }) => {
    try {
      const [onChain, blockHeight] = await Promise.all([
        getAgreement(agreementId),
        getCurrentBlockHeight(),
      ]);
      // Fetch milestones if we know the count
      let milestones: OnChainMilestone[] = [];
      if (onChain && onChain.milestoneCount > 0) {
        milestones = await getAllMilestones(
          agreementId,
          onChain.milestoneCount,
        );
      }
      return { onChain, blockHeight, milestones };
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Poll failed",
      );
    }
  },
);

// ── approveAgreementThunk ─────────────────────────────────────
export const approveAgreementThunk = createAsyncThunk(
  "agreement/approveAgreement",
  async (
    payload: {
      agreementId: string;
      role: "partyA" | "partyB";
      address: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await approveAgreement(
        payload.agreementId,
        payload.role,
        payload.address,
      );
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Approval failed",
      );
    }
  },
);

// ── pollApprovalThunk ─────────────────────────────────────────
export const pollApprovalThunk = createAsyncThunk(
  "agreement/pollApproval",
  async (agreementId: string, { rejectWithValue }) => {
    try {
      return await getApprovalState(agreementId);
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Approval poll failed",
      );
    }
  },
);

export const presenceUpdated = createAction<PresenceState>(
  "agreement/presenceUpdated",
);

/** Dispatched by the SSE subscriber in ScreenApproveAgreement */
export const approvalUpdated = createAction<ApprovalState>(
  "agreement/approvalUpdated",
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

    // ── Milestone inputs (set during lock-funds screen) ───────
    setMilestoneInputs(state, action: PayloadAction<MilestoneInput[]>) {
      state.milestoneInputs = action.payload;
      if (typeof window !== "undefined") {
        localStorage.setItem(
          "clauseai_milestones",
          JSON.stringify(action.payload),
        );
      }
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
      const termsRaw = localStorage.getItem("clauseai_terms");
      if (termsRaw) {
        try {
          const terms = JSON.parse(termsRaw) as ParsedAgreement;
          state.editedTerms = terms;
          state.parsedTerms = terms;
        } catch {
          // corrupted — ignore
        }
      }
      const milestonesRaw = localStorage.getItem("clauseai_milestones");
      if (milestonesRaw) {
        try {
          state.milestoneInputs = JSON.parse(milestonesRaw) as MilestoneInput[];
        } catch {
          // ignore
        }
      }

      // FIX: If Party B is rehydrating and hasn't approved yet,
      // don't leave them on "dashboard" — send them to approve-agreement.
      // This prevents the premature dashboard redirect in page.tsx.
      if (
        state.isPartyB &&
        !state.partyBApproved &&
        state.currentScreen === "dashboard"
      ) {
        state.currentScreen = "approve-agreement";
      }
    },

    applyPresenceUpdate(state, action: PayloadAction<PresenceState>) {
      applyPresence(state, action.payload);
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
        state.editedTerms = {
          ...(action.payload.data! as any),
        } as typeof state.editedTerms;
        const terms = state.editedTerms as any;
        if (state.partyAName) {
          terms.partyA = state.partyAName;
          terms.payer = state.partyAName;
        }
        if (state.partyBName) {
          terms.partyB = state.partyBName;
          terms.receiver = state.partyBName;
        }
        if (state.arbitratorName) {
          terms.arbitrator = state.arbitratorName;
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

    // presenceUpdated (SSE)
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

    // completeMilestone
    builder
      .addCase(completeMilestoneThunk.pending, (state, action) => {
        const idx = action.meta.arg.milestoneIndex;
        state.txMilestone[idx] = {
          status: "pending",
          txId: null,
          txUrl: null,
          error: null,
        };
      })
      .addCase(completeMilestoneThunk.fulfilled, (state, action) => {
        const idx = action.payload.milestoneIndex;
        state.txMilestone[idx] = {
          status: "confirming",
          txId: action.payload.txId,
          txUrl: action.payload.txUrl,
          error: null,
        };
        const ms = state.milestones.find((m) => m.index === idx);
        if (ms) ms.status = 2; // COMPLETE
      })
      .addCase(completeMilestoneThunk.rejected, (state, action) => {
        const idx = action.meta.arg.milestoneIndex;
        state.txMilestone[idx] = {
          status: "failed",
          txId: null,
          txUrl: null,
          error: action.payload as string,
        };
      });

    // disputeMilestone
    builder
      .addCase(disputeMilestoneThunk.pending, (state, action) => {
        const idx = action.meta.arg.milestoneIndex;
        state.txMilestone[idx] = {
          status: "pending",
          txId: null,
          txUrl: null,
          error: null,
        };
      })
      .addCase(disputeMilestoneThunk.fulfilled, (state, action) => {
        const idx = action.payload.milestoneIndex;
        state.txMilestone[idx] = {
          status: "confirming",
          txId: action.payload.txId,
          txUrl: action.payload.txUrl,
          error: null,
        };
        const ms = state.milestones.find((m) => m.index === idx);
        if (ms) ms.status = 4; // DISPUTED
      })
      .addCase(disputeMilestoneThunk.rejected, (state, action) => {
        const idx = action.meta.arg.milestoneIndex;
        state.txMilestone[idx] = {
          status: "failed",
          txId: null,
          txUrl: null,
          error: action.payload as string,
        };
      });

    // triggerMilestoneTimeout
    builder
      .addCase(triggerMilestoneTimeoutThunk.pending, (state, action) => {
        const idx = action.meta.arg.milestoneIndex;
        state.txMilestone[idx] = {
          status: "pending",
          txId: null,
          txUrl: null,
          error: null,
        };
      })
      .addCase(triggerMilestoneTimeoutThunk.fulfilled, (state, action) => {
        const idx = action.payload.milestoneIndex;
        state.txMilestone[idx] = {
          status: "confirming",
          txId: action.payload.txId,
          txUrl: action.payload.txUrl,
          error: null,
        };
        const ms = state.milestones.find((m) => m.index === idx);
        if (ms) ms.status = 3; // REFUNDED
      })
      .addCase(triggerMilestoneTimeoutThunk.rejected, (state, action) => {
        const idx = action.meta.arg.milestoneIndex;
        state.txMilestone[idx] = {
          status: "failed",
          txId: null,
          txUrl: null,
          error: action.payload as string,
        };
      });

    // triggerArbTimeout
    builder
      .addCase(triggerArbTimeoutThunk.pending, (state, action) => {
        const idx = action.meta.arg.milestoneIndex;
        state.txMilestone[idx] = {
          status: "pending",
          txId: null,
          txUrl: null,
          error: null,
        };
      })
      .addCase(triggerArbTimeoutThunk.fulfilled, (state, action) => {
        const idx = action.payload.milestoneIndex;
        state.txMilestone[idx] = {
          status: "confirming",
          txId: action.payload.txId,
          txUrl: action.payload.txUrl,
          error: null,
        };
        const ms = state.milestones.find((m) => m.index === idx);
        if (ms) ms.status = 3; // REFUNDED
      })
      .addCase(triggerArbTimeoutThunk.rejected, (state, action) => {
        const idx = action.meta.arg.milestoneIndex;
        state.txMilestone[idx] = {
          status: "failed",
          txId: null,
          txUrl: null,
          error: action.payload as string,
        };
      });

    // pollAgreement — now also syncs milestones
    builder.addCase(pollAgreementThunk.fulfilled, (state, action) => {
      const { onChain, blockHeight, milestones } = action.payload;
      if (blockHeight) state.blockHeight = blockHeight;
      if (milestones.length > 0) state.milestones = milestones;
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
        if (onChain.totalDeposited > 0) {
          const stx = Number(onChain.totalDeposited) / 1_000_000;
          state.amountLocked = (stx * 0.8).toFixed(2);
        }
      }
    });

    // ── approveAgreement ──────────────────────────────────────
    builder
      .addCase(approveAgreementThunk.fulfilled, (state, action) => {
        state.partyAApproved = action.payload.partyAApproved;
        state.partyBApproved = action.payload.partyBApproved;
      })
      .addCase(approveAgreementThunk.rejected, (state, action) => {
        state.presenceError = action.payload as string;
      });

    // ── pollApproval ──────────────────────────────────────────
    builder.addCase(pollApprovalThunk.fulfilled, (state, action) => {
      state.partyAApproved = action.payload.partyAApproved;
      state.partyBApproved = action.payload.partyBApproved;
    });

    // ── approvalUpdated (SSE) ─────────────────────────────────
    builder.addCase(approvalUpdated, (state, action) => {
      state.partyAApproved = action.payload.partyAApproved;
      state.partyBApproved = action.payload.partyBApproved;
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
  // Sync approval flags whenever a presence event carries them
  if ((presence as any).partyAApproved !== undefined)
    state.partyAApproved = (presence as any).partyAApproved;
  if ((presence as any).partyBApproved !== undefined)
    state.partyBApproved = (presence as any).partyBApproved;
}

export const {
  setScreen,
  setAgreementType,
  setRawText,
  setPartyNames,
  updateEditedTerms,
  approveTerms,
  setMilestoneInputs,
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
