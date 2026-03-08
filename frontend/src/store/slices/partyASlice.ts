// ============================================================
// store/partyA/partyASlice.ts
//
// ISOLATED state for Party A only. Never touches Party B logic.
// Party A flow:
//   landing → select-type → describe → parsed-terms →
//   set-arbitrator → share-link → connect-wallet → lock-funds → dashboard
// ============================================================

import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import {
  parseAgreement,
  ParsedAgreement,
  ParsedAgreementV2,
  AgreementType,
} from "@/api/parseApi";
import {
  connectHiroWallet,
  isWalletConnected,
  getConnectedUser,
} from "@/lib/hiroWallet";
import {
  callCreateAgreement,
  callDeposit,
  MilestoneInput,
} from "@/lib/contractCalls";
import { explorerTxUrl } from "@/lib/stacksConfig";
import { registerParty } from "@/api/PresenceaApi";
import { approveAgreement, getApprovalState } from "@/api/approvalApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type PartyAScreen =
  | "landing"
  | "select-type"
  | "describe"
  | "parsed-terms"
  | "set-arbitrator"
  | "share-link"
  | "connect-wallet"
  | "approve-agreement"
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

export interface PartyAState {
  screen: PartyAScreen;
  agreementType: AgreementType | null;
  rawText: string;

  // Party names
  partyAName: string;
  partyBName: string;
  arbitratorName: string;

  // Parsed terms
  parsedTerms: ParsedAgreement | ParsedAgreementV2 | null;
  editedTerms: ParsedAgreement | null;
  parseLoading: boolean;
  parseError: string | null;
  parseMeta: { provider: string; model: string; latency_ms: number } | null;

  // Wallet
  walletConnected: boolean;
  walletAddress: string | null;

  // Agreement
  agreementId: string | null;
  shareLink: string | null;

  // Counterparty (Party B) status
  partyBConnected: boolean;
  partyBWallet: string | null;
  partyBApproved: boolean;
  partyAApproved: boolean;

  // Presence registration
  presenceRegistered: boolean;

  // Fund state
  fundState: FundState;
  amountLocked: string | null;
  milestoneInputs: MilestoneInput[];

  // Counterparty wallet alias (same as partyBWallet, kept for component compat)
  counterpartyWallet: string | null;

  // Chain state
  blockHeight: number | null;

  // Transactions
  txCreate: TxState;
  txDeposit: TxState;
  txMilestone: Record<number, TxState>;
}

const initialState: PartyAState = {
  screen: "landing",
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
  agreementId: null,
  shareLink: null,
  partyBConnected: false,
  partyBWallet: null,
  partyBApproved: false,
  partyAApproved: false,
  presenceRegistered: false,
  fundState: "idle",
  amountLocked: null,
  milestoneInputs: [],
  counterpartyWallet: null,
  blockHeight: null,
  txCreate: emptyTx(),
  txDeposit: emptyTx(),
  txMilestone: {},
};

// ── Thunks ────────────────────────────────────────────────────

export const parseAgreementThunk = createAsyncThunk(
  "partyA/parse",
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
  "partyA/connectWallet",
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

export const registerPartyAPresenceThunk = createAsyncThunk(
  "partyA/registerPresence",
  async (
    payload: {
      agreementId: string;
      address: string;
      termsHash?: string;
      termsSnapshot?: Record<string, unknown>;
    },
    { rejectWithValue },
  ) => {
    try {
      return await registerParty(
        payload.agreementId,
        "partyA",
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

export const approveAsPartyAThunk = createAsyncThunk(
  "partyA/approve",
  async (
    payload: { agreementId: string; address: string },
    { rejectWithValue },
  ) => {
    try {
      return await approveAgreement(
        payload.agreementId,
        "partyA",
        payload.address,
      );
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Approval failed",
      );
    }
  },
);

export const pollApprovalStateThunk = createAsyncThunk(
  "partyA/pollApproval",
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

export const createAgreementThunk = createAsyncThunk(
  "partyA/createOnChain",
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
  "partyA/deposit",
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

/** Rehydrate Party A session from localStorage on page load */
export const rehydratePartyAThunk = createAsyncThunk(
  "partyA/rehydrate",
  async (_, { rejectWithValue }) => {
    if (typeof window === "undefined") return null;
    try {
      const agreementId = localStorage.getItem("pA_agreementId");
      if (!agreementId) return null;
      const address = localStorage.getItem("pA_walletAddress");
      const termsRaw = localStorage.getItem("pA_terms");
      const milestoresRaw = localStorage.getItem("pA_milestones");
      const agreementType = localStorage.getItem(
        "pA_agreementType",
      ) as AgreementType | null;
      const screen = localStorage.getItem("pA_screen") as PartyAScreen | null;
      return {
        agreementId,
        address,
        terms: termsRaw ? (JSON.parse(termsRaw) as ParsedAgreement) : null,
        milestones: milestoresRaw
          ? (JSON.parse(milestoresRaw) as MilestoneInput[])
          : null,
        agreementType,
        screen,
      };
    } catch {
      return null;
    }
  },
);

// ── Slice ─────────────────────────────────────────────────────

const partyASlice = createSlice({
  name: "partyA",
  initialState,
  reducers: {
    setScreen(state, action: PayloadAction<PartyAScreen>) {
      state.screen = action.payload;
      if (typeof window !== "undefined") {
        localStorage.setItem("pA_screen", action.payload);
      }
    },
    setAgreementType(state, action: PayloadAction<AgreementType>) {
      state.agreementType = action.payload;
      state.parsedTerms = null;
      state.editedTerms = null;
      state.parseError = null;
      state.rawText = "";
      if (typeof window !== "undefined") {
        localStorage.setItem("pA_agreementType", action.payload);
      }
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
        if (typeof window !== "undefined") {
          localStorage.setItem("pA_terms", JSON.stringify(state.editedTerms));
        }
      }
    },
    setArbitrator(state, action: PayloadAction<string>) {
      state.arbitratorName = action.payload;
      if (state.editedTerms) {
        (state.editedTerms as any).arbitrator = action.payload;
        if (typeof window !== "undefined") {
          localStorage.setItem("pA_terms", JSON.stringify(state.editedTerms));
        }
      }
    },
    generateShareLink(state) {
      if (!state.agreementId) {
        state.agreementId = Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase();
      }
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : "https://clauseai.xyz";
      state.shareLink = `${origin}/agreement/${state.agreementId}`;
      if (typeof window !== "undefined") {
        localStorage.setItem("pA_agreementId", state.agreementId);
        if (state.editedTerms) {
          localStorage.setItem("pA_terms", JSON.stringify(state.editedTerms));
        }
      }
    },
    setMilestoneInputs(state, action: PayloadAction<MilestoneInput[]>) {
      state.milestoneInputs = action.payload;
      if (typeof window !== "undefined") {
        localStorage.setItem("pA_milestones", JSON.stringify(action.payload));
      }
    },
    /** Called from SSE / polling updates */
    applyApprovalUpdate(
      state,
      action: PayloadAction<{
        partyAApproved: boolean;
        partyBApproved: boolean;
        partyB?: string | null;
      }>,
    ) {
      state.partyAApproved = action.payload.partyAApproved;
      state.partyBApproved = action.payload.partyBApproved;
      if (action.payload.partyB && !state.partyBConnected) {
        state.partyBWallet = action.payload.partyB;
        state.counterpartyWallet = action.payload.partyB;
        state.partyBConnected = true;
      }
    },
    setPartyBConnected(state, action: PayloadAction<{ wallet: string }>) {
      state.partyBWallet = action.payload.wallet;
      state.counterpartyWallet = action.payload.wallet;
      state.partyBConnected = true;
    },
    lockFunds(state) {
      state.fundState = "locked";
      state.amountLocked =
        (state.editedTerms as any)?.total_usd ??
        (state.editedTerms as any)?.amount_usd ??
        null;
    },
    markComplete(state) {
      state.fundState = "released";
      state.screen = "complete";
    },
    setBlockHeight(state, action: PayloadAction<number>) {
      state.blockHeight = action.payload;
    },
    resetAll() {
      if (typeof window !== "undefined") {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("pA_"))
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
        if (state.arbitratorName) terms.arbitrator = state.arbitratorName;
        state.parseMeta = action.payload.meta;
        if (typeof window !== "undefined") {
          localStorage.setItem("pA_terms", JSON.stringify(state.editedTerms));
        }
      })
      .addCase(parseAgreementThunk.rejected, (state, action) => {
        state.parseLoading = false;
        state.parseError = action.payload as string;
      });

    // connectWallet
    builder.addCase(connectWalletThunk.fulfilled, (state, action) => {
      state.walletConnected = true;
      state.walletAddress = action.payload;
      if (typeof window !== "undefined") {
        localStorage.setItem("pA_walletAddress", action.payload);
      }
    });

    // registerPresence
    builder.addCase(registerPartyAPresenceThunk.fulfilled, (state) => {
      state.presenceRegistered = true;
    });

    // approve as Party A
    builder.addCase(approveAsPartyAThunk.fulfilled, (state, action) => {
      state.partyAApproved = action.payload.partyAApproved;
      state.partyBApproved = action.payload.partyBApproved;
    });

    // poll approval
    builder.addCase(pollApprovalStateThunk.fulfilled, (state, action) => {
      state.partyAApproved = action.payload.partyAApproved;
      state.partyBApproved = action.payload.partyBApproved;
      if (action.payload.partyB && !state.partyBConnected) {
        state.partyBWallet = action.payload.partyB as string | null;
        state.partyBConnected = true;
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
        state.fundState = "locked";
        state.amountLocked =
          (state.editedTerms as any)?.total_usd ??
          (state.editedTerms as any)?.amount_usd ??
          null;
      })
      .addCase(depositThunk.rejected, (state, action) => {
        state.txDeposit = {
          status: "failed",
          txId: null,
          txUrl: null,
          error: action.payload as string,
        };
      });

    // rehydrate
    builder.addCase(rehydratePartyAThunk.fulfilled, (state, action) => {
      if (!action.payload) return;
      const { agreementId, address, terms, milestones, agreementType, screen } =
        action.payload;
      if (agreementId) {
        state.agreementId = agreementId;
        const origin =
          typeof window !== "undefined"
            ? window.location.origin
            : "https://clauseai.xyz";
        state.shareLink = `${origin}/agreement/${agreementId}`;
      }
      if (address) {
        state.walletConnected = true;
        state.walletAddress = address;
      }
      if (terms) {
        state.parsedTerms = terms;
        state.editedTerms = { ...terms };
      }
      if (milestones) state.milestoneInputs = milestones;
      if (agreementType) state.agreementType = agreementType;
      // Only restore non-sensitive screens (not beyond share-link)
      const safeScreens: PartyAScreen[] = [
        "select-type",
        "describe",
        "parsed-terms",
        "set-arbitrator",
        "share-link",
      ];
      if (screen && safeScreens.includes(screen)) state.screen = screen;
    });
  },
});

export const {
  setScreen,
  setAgreementType,
  setRawText,
  setPartyNames,
  updateEditedTerms,
  setArbitrator,
  generateShareLink,
  setMilestoneInputs,
  setBlockHeight,
  applyApprovalUpdate,
  setPartyBConnected,
  lockFunds,
  markComplete,
  resetAll,
} = partyASlice.actions;

export default partyASlice.reducer;
