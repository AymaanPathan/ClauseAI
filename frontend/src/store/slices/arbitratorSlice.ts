// ============================================================
// store/slices/arbitratorSlice.ts
// ============================================================

import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import {
  connectHiroWallet,
  isWalletConnected,
  getConnectedUser,
} from "@/lib/hiroWallet";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────

export type ArbitratorScreen =
  | "connect-wallet"
  | "dashboard"
  | "dispute-detail";

export interface ContractTerms {
  payer: string;
  receiver: string;
  arbitrator: string;
  total_amount: number;
  milestone_description: string;
  milestone_percentage: number;
  milestone_deadline?: string;
  agreement_type?: string;
}

export interface AIVerdict {
  verdict: "release_to_receiver" | "refund_to_payer" | "split";
  confidence: number;
  reasoning: string;
  key_factors: string[];
  warnings: string[];
  split_percentage?: number;
  generated_at: string;
  model: string;
  latency_ms: number;
}

export interface ArbitratorDecision {
  outcome: "release_to_receiver" | "refund_to_payer" | "split";
  followed_ai: boolean;
  override_reason?: string;
  decided_at: string;
  arbitrator_address: string;
}

export type DisputeStatus =
  | "awaiting_statements"
  | "party_a_submitted"
  | "party_b_submitted"
  | "ai_pending"
  | "ai_complete"
  | "resolved"
  | "auto_refunded";

export interface Dispute {
  _id: string;
  agreement_id: string;
  milestone_index: number;
  contract_terms: ContractTerms;
  status: DisputeStatus;
  party_a_statement: string;
  party_a_evidence: string[];
  party_a_submitted_at?: string;
  party_b_statement: string;
  party_b_evidence: string[];
  party_b_submitted_at?: string;
  ai_verdict?: AIVerdict;
  arbitrator_decision?: ArbitratorDecision;
  opened_at: string;
  resolved_at?: string;
  updated_at: string;
}

export interface DashboardSummary {
  total: number;
  needs_decision: number;
  pending: number;
  resolved: number;
}

export interface ArbitratorState {
  screen: ArbitratorScreen;
  walletAddress: string | null;
  walletConnected: boolean;
  connectError: string | null;
  connecting: boolean;

  disputes: Dispute[];
  summary: DashboardSummary | null;
  dashboardLoading: boolean;
  dashboardError: string | null;

  activeDispute: Dispute | null;
  activeDisputeLoading: boolean;
  activeDisputeError: string | null;

  uploadingEvidence: boolean;
  uploadedUrls: string[];
  uploadError: string | null;

  submittingStatement: boolean;
  submitError: string | null;

  decidingVerdict: boolean;
  verdictError: string | null;
}

const initialState: ArbitratorState = {
  screen: "connect-wallet",
  walletAddress: null,
  walletConnected: false,
  connectError: null,
  connecting: false,

  disputes: [],
  summary: null,
  dashboardLoading: false,
  dashboardError: null,

  activeDispute: null,
  activeDisputeLoading: false,
  activeDisputeError: null,

  uploadingEvidence: false,
  uploadedUrls: [],
  uploadError: null,

  submittingStatement: false,
  submitError: null,

  decidingVerdict: false,
  verdictError: null,
};

// ── Thunks ─────────────────────────────────────────────────────

export const connectArbitratorWalletThunk = createAsyncThunk(
  "arbitrator/connectWallet",
  async (_, { rejectWithValue }) => {
    try {
      if (isWalletConnected()) {
        const user = getConnectedUser();
        if (user) return user.address;
      }
      const user = await connectHiroWallet();
      return user.address;
    } catch (err) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Wallet connect failed",
      );
    }
  },
);

export const fetchArbitratorDashboardThunk = createAsyncThunk(
  "arbitrator/fetchDashboard",
  async (address: string, { rejectWithValue }) => {
    try {
      const res = await fetch(`${API_BASE}/api/arbitrate/dashboard/${address}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      return await res.json();
    } catch (err) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Failed to load dashboard",
      );
    }
  },
);

export const fetchDisputeDetailThunk = createAsyncThunk(
  "arbitrator/fetchDisputeDetail",
  async (
    payload: { agreementId: string; milestoneIndex: number },
    { rejectWithValue },
  ) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/arbitrate/${payload.agreementId}/${payload.milestoneIndex}`,
      );
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      return data.dispute as Dispute;
    } catch (err) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Failed to load dispute",
      );
    }
  },
);

export const uploadEvidenceThunk = createAsyncThunk(
  "arbitrator/uploadEvidence",
  async (files: File[], { rejectWithValue }) => {
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      const res = await fetch(`${API_BASE}/api/arbitrate/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const data = await res.json();
      return data.urls as string[];
    } catch (err) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Upload failed",
      );
    }
  },
);

// ── openDisputeThunk ──────────────────────────────────────────
// Call this before submitStatementThunk if you know the dispute
// may not exist yet (e.g. the payer is the first to raise the dispute).
// It is idempotent — safe to call even if already opened.
export const openDisputeThunk = createAsyncThunk(
  "arbitrator/openDispute",
  async (
    payload: {
      agreement_id: string;
      milestone_index: number;
      contract_terms: ContractTerms;
    },
    { rejectWithValue },
  ) => {
    try {
      const res = await fetch(`${API_BASE}/api/arbitrate/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `Open failed: ${res.status}`);
      }
      return (await res.json()).dispute as Dispute;
    } catch (err) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Failed to open dispute",
      );
    }
  },
);

// ── submitStatementThunk ──────────────────────────────────────
// Now accepts an optional `contract_terms` field.
// The backend will auto-open the dispute if it doesn't exist yet
// AND contract_terms are provided — so you never need a separate
// /open call as long as you pass contract_terms here.
export const submitStatementThunk = createAsyncThunk(
  "arbitrator/submitStatement",
  async (
    payload: {
      agreement_id: string;
      milestone_index: number;
      party: "A" | "B";
      statement: string;
      evidence_urls: string[];
      contract_terms?: ContractTerms; // ← pass this to auto-open if needed
    },
    { rejectWithValue },
  ) => {
    try {
      const res = await fetch(`${API_BASE}/api/arbitrate/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `Submit failed: ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Submit failed",
      );
    }
  },
);

export const resolveDisputeThunk = createAsyncThunk(
  "arbitrator/resolve",
  async (
    payload: {
      agreement_id: string;
      milestone_index: number;
      arbitrator_address: string;
      action: "confirm" | "override_release" | "override_refund";
      override_reason?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const res = await fetch(`${API_BASE}/api/arbitrate/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `Resolve failed: ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Resolve failed",
      );
    }
  },
);

// ── Slice ──────────────────────────────────────────────────────

const arbitratorSlice = createSlice({
  name: "arbitrator",
  initialState,
  reducers: {
    setScreen(state, action: PayloadAction<ArbitratorScreen>) {
      state.screen = action.payload;
    },
    setActiveDispute(state, action: PayloadAction<Dispute | null>) {
      state.activeDispute = action.payload;
      if (action.payload) state.screen = "dispute-detail";
    },
    clearUploadedUrls(state) {
      state.uploadedUrls = [];
      state.uploadError = null;
    },
    appendUploadedUrl(state, action: PayloadAction<string>) {
      state.uploadedUrls.push(action.payload);
    },
    updateActiveDispute(state, action: PayloadAction<Partial<Dispute>>) {
      if (state.activeDispute) {
        state.activeDispute = { ...state.activeDispute, ...action.payload };
      }
    },
    disconnect(state) {
      state.walletAddress = null;
      state.walletConnected = false;
      state.screen = "connect-wallet";
      state.disputes = [];
      state.summary = null;
    },
  },
  extraReducers: (builder) => {
    // connectWallet
    builder
      .addCase(connectArbitratorWalletThunk.pending, (state) => {
        state.connecting = true;
        state.connectError = null;
      })
      .addCase(connectArbitratorWalletThunk.fulfilled, (state, action) => {
        state.connecting = false;
        state.walletConnected = true;
        state.walletAddress = action.payload;
        state.screen = "dashboard";
        if (typeof window !== "undefined")
          localStorage.setItem("arb_wallet", action.payload);
      })
      .addCase(connectArbitratorWalletThunk.rejected, (state, action) => {
        state.connecting = false;
        state.connectError = action.payload as string;
      });

    // fetchDashboard
    builder
      .addCase(fetchArbitratorDashboardThunk.pending, (state) => {
        state.dashboardLoading = true;
        state.dashboardError = null;
      })
      .addCase(fetchArbitratorDashboardThunk.fulfilled, (state, action) => {
        state.dashboardLoading = false;
        state.disputes = action.payload.disputes ?? [];
        state.summary = action.payload.summary ?? null;
      })
      .addCase(fetchArbitratorDashboardThunk.rejected, (state, action) => {
        state.dashboardLoading = false;
        state.dashboardError = action.payload as string;
      });

    // fetchDisputeDetail
    builder
      .addCase(fetchDisputeDetailThunk.pending, (state) => {
        state.activeDisputeLoading = true;
        state.activeDisputeError = null;
      })
      .addCase(fetchDisputeDetailThunk.fulfilled, (state, action) => {
        state.activeDisputeLoading = false;
        state.activeDispute = action.payload;
        state.screen = "dispute-detail";
      })
      .addCase(fetchDisputeDetailThunk.rejected, (state, action) => {
        state.activeDisputeLoading = false;
        state.activeDisputeError = action.payload as string;
      });

    // openDispute
    builder
      .addCase(openDisputeThunk.pending, (state) => {
        state.activeDisputeLoading = true;
        state.activeDisputeError = null;
      })
      .addCase(openDisputeThunk.fulfilled, (state, action) => {
        state.activeDisputeLoading = false;
        state.activeDispute = action.payload;
      })
      .addCase(openDisputeThunk.rejected, (state, action) => {
        state.activeDisputeLoading = false;
        state.activeDisputeError = action.payload as string;
      });

    // uploadEvidence
    builder
      .addCase(uploadEvidenceThunk.pending, (state) => {
        state.uploadingEvidence = true;
        state.uploadError = null;
      })
      .addCase(uploadEvidenceThunk.fulfilled, (state, action) => {
        state.uploadingEvidence = false;
        state.uploadedUrls = [...state.uploadedUrls, ...action.payload];
      })
      .addCase(uploadEvidenceThunk.rejected, (state, action) => {
        state.uploadingEvidence = false;
        state.uploadError = action.payload as string;
      });

    // submitStatement
    builder
      .addCase(submitStatementThunk.pending, (state) => {
        state.submittingStatement = true;
        state.submitError = null;
      })
      .addCase(submitStatementThunk.fulfilled, (state, action) => {
        state.submittingStatement = false;
        if (action.payload?.dispute) {
          state.activeDispute = action.payload.dispute;
        }
      })
      .addCase(submitStatementThunk.rejected, (state, action) => {
        state.submittingStatement = false;
        state.submitError = action.payload as string;
      });

    // resolveDispute
    builder
      .addCase(resolveDisputeThunk.pending, (state) => {
        state.decidingVerdict = true;
        state.verdictError = null;
      })
      .addCase(resolveDisputeThunk.fulfilled, (state, action) => {
        state.decidingVerdict = false;
        if (action.payload?.dispute) {
          state.activeDispute = action.payload.dispute;
          const idx = state.disputes.findIndex(
            (d) =>
              d.agreement_id === action.payload.dispute.agreement_id &&
              d.milestone_index === action.payload.dispute.milestone_index,
          );
          if (idx !== -1) state.disputes[idx] = action.payload.dispute;
        }
      })
      .addCase(resolveDisputeThunk.rejected, (state, action) => {
        state.decidingVerdict = false;
        state.verdictError = action.payload as string;
      });
  },
});

export const {
  setScreen,
  setActiveDispute,
  clearUploadedUrls,
  appendUploadedUrl,
  updateActiveDispute,
  disconnect,
} = arbitratorSlice.actions;

export default arbitratorSlice.reducer;
