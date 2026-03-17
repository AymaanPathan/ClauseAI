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
    callCompleteMilestone,
    callDisputeMilestone,
    callTriggerMilestoneTimeout,
    MilestoneInput,
  } from "@/lib/contractCalls";
  import { explorerTxUrl, NETWORK_NAME } from "@/lib/stacksConfig";
  import { registerParty } from "@/api/PresenceaApi";
  import { approveAgreement, getApprovalState } from "@/api/approvalApi";

  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  // ── Tx polling helper ─────────────────────────────────────────
  const STACKS_API_BASE =
    NETWORK_NAME === "mainnet"
      ? "https://api.mainnet.hiro.so"
      : "https://api.testnet.hiro.so";

  async function fetchTxStatus(
    txId: string,
  ): Promise<
    "pending" | "success" | "abort_by_response" | "abort_by_post_condition"
  > {
    const res = await fetch(`${STACKS_API_BASE}/extended/v1/tx/${txId}`);
    if (!res.ok) return "pending";
    const data = await res.json();
    return data.tx_status ?? "pending";
  }

  // ── Types ─────────────────────────────────────────────────────
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
    partyAName: string;
    partyBName: string;
    arbitratorName: string;
    parsedTerms: ParsedAgreement | ParsedAgreementV2 | null;
    editedTerms: ParsedAgreement | null;
    parseLoading: boolean;
    parseError: string | null;
    parseMeta: { provider: string; model: string; latency_ms: number } | null;
    walletConnected: boolean;
    walletAddress: string | null;
    agreementId: string | null;
    shareLink: string | null;
    partyBConnected: boolean;
    partyBWallet: string | null;
    partyBApproved: boolean;
    partyAApproved: boolean;
    presenceRegistered: boolean;
    fundState: FundState;
    amountLocked: string | null;
    milestoneInputs: MilestoneInput[];
    counterpartyWallet: string | null;
    blockHeight: number | null;
    txCreate: TxState;
    txDeposit: TxState;
    txMilestone: Record<number, TxState>;
    milestoneOnChainStatuses: Record<number, number>;
    // Track which milestones have been notified to DB (avoid duplicate calls)
    milestonesNotifiedToDb: Record<number, boolean>;
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
    milestoneOnChainStatuses: {},
    milestonesNotifiedToDb: {},
  };

  // ── Thunks ─────────────────────────────────────────────────────

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
      } catch (err) {
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
      } catch (err) {
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
      } catch (err) {
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
      } catch (err) {
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
      } catch (err) {
        return rejectWithValue(
          err instanceof Error ? err.message : "Poll failed",
        );
      }
    },
  );

  // ── NEW: save agreement + milestones to MongoDB ────────────────
  export const saveAgreementToDbThunk = createAsyncThunk(
    "partyA/saveToDb",
    async (
      payload: {
        agreementId: string;
        partyA: string;
        partyB?: string;
        arbitrator?: string;
        totalAmountUsd: number;
        totalAmountSats: number;
        terms: Record<string, unknown>;
        milestones: Array<{
          index: number;
          title: string;
          percentage: number;
          condition: string;
          deadline?: string;
          deadline_dt: string;
          amountUsd: string;
          amountSats: number;
        }>;
        onChainCreateTxId?: string;
      },
      { rejectWithValue },
    ) => {
      try {
        const res = await fetch(
          `${API_BASE}/api/agreement/${payload.agreementId}/create`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!res.ok) throw new Error(`DB save failed: ${res.status}`);
        return await res.json();
      } catch (err) {
        return rejectWithValue(
          err instanceof Error ? err.message : "DB save failed",
        );
      }
    },
  );

  // ── NEW: notify DB + socket that a milestone tx was confirmed ──
  export const notifyMilestoneToDbThunk = createAsyncThunk(
    "partyA/notifyMilestoneToDb",
    async (
      payload: {
        agreementId: string;
        milestoneIndex: number;
        action: "complete" | "dispute" | "timeout";
        txId: string;
        txUrl?: string;
        callerAddress?: string;
      },
      { rejectWithValue },
    ) => {
      try {
        const res = await fetch(
          `${API_BASE}/api/agreement/${payload.agreementId}/milestone`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!res.ok) throw new Error(`Milestone notify failed: ${res.status}`);
        const data = await res.json();
        return { milestoneIndex: payload.milestoneIndex, ...data };
      } catch (err) {
        // Non-fatal — tx is already on-chain. Just log.
        console.warn("[notifyMilestoneToDb] failed:", err);
        return rejectWithValue(
          err instanceof Error ? err.message : "Notify failed",
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
      } catch (err) {
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
      } catch (err) {
        return rejectWithValue(
          err instanceof Error ? err.message : "Deposit failed",
        );
      }
    },
  );

  export const completeMilestoneThunk = createAsyncThunk(
    "partyA/completeMilestone",
    async (
      payload: {
        agreementId: string;
        milestoneIndex: number;
        milestoneAmountSats: bigint;
      },
      { rejectWithValue },
    ) => {
      try {
        const { getMilestone } = await import("@/lib/contractReads");
        const ms = await getMilestone(
          payload.agreementId,
          payload.milestoneIndex,
        );
        const onChainAmount = BigInt(ms?.amount ?? 0);
        if (onChainAmount === BigInt(0)) {
          return rejectWithValue({
            milestoneIndex: payload.milestoneIndex,
            error:
              "Milestone amount is 0 on-chain. Already completed or not deposited.",
          });
        }
        const txId = await callCompleteMilestone(
          payload.agreementId,
          payload.milestoneIndex,
          onChainAmount,
        );
        return {
          milestoneIndex: payload.milestoneIndex,
          txId,
          txUrl: explorerTxUrl(txId),
        };
      } catch (err) {
        return rejectWithValue({
          milestoneIndex: payload.milestoneIndex,
          error: err instanceof Error ? err.message : "complete-milestone failed",
        });
      }
    },
  );

  export const disputeMilestoneThunk = createAsyncThunk(
    "partyA/disputeMilestone",
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
          milestoneIndex: payload.milestoneIndex,
          txId,
          txUrl: explorerTxUrl(txId),
        };
      } catch (err) {
        return rejectWithValue({
          milestoneIndex: payload.milestoneIndex,
          error: err instanceof Error ? err.message : "dispute-milestone failed",
        });
      }
    },
  );

  export const triggerTimeoutThunk = createAsyncThunk(
    "partyA/triggerTimeout",
    async (
      payload: {
        agreementId: string;
        milestoneIndex: number;
        milestoneAmountSats: bigint;
      },
      { rejectWithValue },
    ) => {
      try {
        const { getMilestone } = await import("@/lib/contractReads");
        const ms = await getMilestone(
          payload.agreementId,
          payload.milestoneIndex,
        );
        const onChainAmount = BigInt(ms?.amount ?? 0);
        const txId = await callTriggerMilestoneTimeout(
          payload.agreementId,
          payload.milestoneIndex,
          onChainAmount,
        );
        return {
          milestoneIndex: payload.milestoneIndex,
          txId,
          txUrl: explorerTxUrl(txId),
        };
      } catch (err) {
        return rejectWithValue({
          milestoneIndex: payload.milestoneIndex,
          error: err instanceof Error ? err.message : "trigger-timeout failed",
        });
      }
    },
  );

  export const pollMilestoneTxThunk = createAsyncThunk(
    "partyA/pollMilestoneTx",
    async (
      payload: {
        milestoneIndex: number;
        txId: string;
        agreementId?: string;
        action?: "complete" | "dispute" | "timeout";
        callerAddress?: string;
        onConfirmed?: () => void;
      },
      { dispatch, rejectWithValue },
    ) => {
      const MAX_POLLS = 180;
      let attempts = 0;

      while (attempts < MAX_POLLS) {
        await new Promise((r) => setTimeout(r, 5000));
        attempts++;

        try {
          const txStatus = await fetchTxStatus(payload.txId);

          if (txStatus === "success") {
            dispatch(
              setMilestoneTxState({
                index: payload.milestoneIndex,
                tx: {
                  status: "confirmed",
                  txId: payload.txId,
                  txUrl: explorerTxUrl(payload.txId),
                  error: null,
                },
              }),
            );

            // ── Notify DB + socket on success ──
            if (payload.agreementId && payload.action) {
              dispatch(
                notifyMilestoneToDbThunk({
                  agreementId: payload.agreementId,
                  milestoneIndex: payload.milestoneIndex,
                  action: payload.action,
                  txId: payload.txId,
                  txUrl: explorerTxUrl(payload.txId),
                  callerAddress: payload.callerAddress,
                }),
              );
            }

            payload.onConfirmed?.();
            return {
              milestoneIndex: payload.milestoneIndex,
              txId: payload.txId,
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
                  txId: payload.txId,
                  txUrl: explorerTxUrl(payload.txId),
                  error: `Transaction aborted: ${txStatus}`,
                },
              }),
            );
            return {
              milestoneIndex: payload.milestoneIndex,
              txId: payload.txId,
              status: "failed",
            };
          }

          dispatch(
            setMilestoneTxState({
              index: payload.milestoneIndex,
              tx: {
                status: "confirming",
                txId: payload.txId,
                txUrl: explorerTxUrl(payload.txId),
                error: null,
              },
            }),
          );
        } catch {
          // Network hiccup — keep going
        }
      }

      dispatch(
        setMilestoneTxState({
          index: payload.milestoneIndex,
          tx: {
            status: "failed",
            txId: payload.txId,
            txUrl: explorerTxUrl(payload.txId),
            error: "Polling timed out after 15 minutes. Check the explorer.",
          },
        }),
      );
      return rejectWithValue({
        milestoneIndex: payload.milestoneIndex,
        error: "Polling timeout",
      });
    },
  );

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

  // ── Slice ──────────────────────────────────────────────────────
  const partyASlice = createSlice({
    name: "partyA",
    initialState,
    reducers: {
      setScreen(state, action: PayloadAction<PartyAScreen>) {
        state.screen = action.payload;
        if (typeof window !== "undefined")
          localStorage.setItem("pA_screen", action.payload);
      },
      setAgreementType(state, action: PayloadAction<AgreementType>) {
        state.agreementType = action.payload;
        state.parsedTerms = null;
        state.editedTerms = null;
        state.parseError = null;
        state.rawText = "";
        if (typeof window !== "undefined")
          localStorage.setItem("pA_agreementType", action.payload);
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
          if (typeof window !== "undefined")
            localStorage.setItem("pA_terms", JSON.stringify(state.editedTerms));
        }
      },
      setArbitrator(state, action: PayloadAction<string>) {
        state.arbitratorName = action.payload;
        if (state.editedTerms) {
          (state.editedTerms as any).arbitrator = action.payload;
          if (typeof window !== "undefined")
            localStorage.setItem("pA_terms", JSON.stringify(state.editedTerms));
        }
      },
      generateShareLink(state) {
        state.agreementId = crypto.randomUUID().slice(0, 6).toUpperCase();
        const origin =
          typeof window !== "undefined"
            ? window.location.origin
            : "https://clauseai.xyz";
        state.shareLink = `${origin}/agreement/${state.agreementId}`;
        if (typeof window !== "undefined")
          localStorage.setItem("pA_agreementId", state.agreementId);
      },
      setMilestoneInputs(state, action: PayloadAction<MilestoneInput[]>) {
        state.milestoneInputs = action.payload;
        if (typeof window !== "undefined")
          localStorage.setItem("pA_milestones", JSON.stringify(action.payload));
      },
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
      setMilestoneTxState(
        state,
        action: PayloadAction<{ index: number; tx: TxState }>,
      ) {
        state.txMilestone = {
          ...state.txMilestone,
          [action.payload.index]: action.payload.tx,
        };
      },
      setMilestoneOnChainStatus(
        state,
        action: PayloadAction<{ index: number; status: number }>,
      ) {
        state.milestoneOnChainStatuses = {
          ...state.milestoneOnChainStatuses,
          [action.payload.index]: action.payload.status,
        };
      },
      markMilestoneNotifiedToDb(state, action: PayloadAction<number>) {
        state.milestonesNotifiedToDb = {
          ...state.milestonesNotifiedToDb,
          [action.payload]: true,
        };
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
          if (typeof window !== "undefined")
            localStorage.setItem("pA_terms", JSON.stringify(state.editedTerms));
        })
        .addCase(parseAgreementThunk.rejected, (state, action) => {
          state.parseLoading = false;
          state.parseError = action.payload as string;
        });

      // connectWallet
      builder.addCase(connectWalletThunk.fulfilled, (state, action) => {
        state.walletConnected = true;
        state.walletAddress = action.payload;
        if (typeof window !== "undefined")
          localStorage.setItem("pA_walletAddress", action.payload);
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
            status: "confirmed",
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
            status: "confirmed",
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

      // completeMilestone
      builder
        .addCase(completeMilestoneThunk.pending, (state, action) => {
          const idx = action.meta.arg.milestoneIndex;
          state.txMilestone = {
            ...state.txMilestone,
            [idx]: { status: "pending", txId: null, txUrl: null, error: null },
          };
        })
        .addCase(completeMilestoneThunk.fulfilled, (state, action) => {
          const { milestoneIndex, txId, txUrl } = action.payload;
          state.txMilestone = {
            ...state.txMilestone,
            [milestoneIndex]: { status: "confirming", txId, txUrl, error: null },
          };
        })
        .addCase(completeMilestoneThunk.rejected, (state, action) => {
          const p = action.payload as { milestoneIndex: number; error: string };
          state.txMilestone = {
            ...state.txMilestone,
            [p.milestoneIndex]: {
              status: "failed",
              txId: null,
              txUrl: null,
              error: p.error,
            },
          };
        });

      // disputeMilestone
      builder
        .addCase(disputeMilestoneThunk.pending, (state, action) => {
          const idx = action.meta.arg.milestoneIndex;
          state.txMilestone = {
            ...state.txMilestone,
            [idx]: { status: "pending", txId: null, txUrl: null, error: null },
          };
        })
        .addCase(disputeMilestoneThunk.fulfilled, (state, action) => {
          const { milestoneIndex, txId, txUrl } = action.payload;
          state.txMilestone = {
            ...state.txMilestone,
            [milestoneIndex]: { status: "confirming", txId, txUrl, error: null },
          };
        })
        .addCase(disputeMilestoneThunk.rejected, (state, action) => {
          const p = action.payload as { milestoneIndex: number; error: string };
          state.txMilestone = {
            ...state.txMilestone,
            [p.milestoneIndex]: {
              status: "failed",
              txId: null,
              txUrl: null,
              error: p.error,
            },
          };
        });

      // triggerTimeout
      builder
        .addCase(triggerTimeoutThunk.pending, (state, action) => {
          const idx = action.meta.arg.milestoneIndex;
          state.txMilestone = {
            ...state.txMilestone,
            [idx]: { status: "pending", txId: null, txUrl: null, error: null },
          };
        })
        .addCase(triggerTimeoutThunk.fulfilled, (state, action) => {
          const { milestoneIndex, txId, txUrl } = action.payload;
          state.txMilestone = {
            ...state.txMilestone,
            [milestoneIndex]: { status: "confirming", txId, txUrl, error: null },
          };
        })
        .addCase(triggerTimeoutThunk.rejected, (state, action) => {
          const p = action.payload as { milestoneIndex: number; error: string };
          state.txMilestone = {
            ...state.txMilestone,
            [p.milestoneIndex]: {
              status: "failed",
              txId: null,
              txUrl: null,
              error: p.error,
            },
          };
        });

      // notifyMilestoneToDb — update local state with confirmed db status
      builder.addCase(notifyMilestoneToDbThunk.fulfilled, (state, action) => {
        if (action.payload?.milestoneIndex !== undefined) {
          state.milestonesNotifiedToDb = {
            ...state.milestonesNotifiedToDb,
            [action.payload.milestoneIndex]: true,
          };
        }
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
        const safeScreens: PartyAScreen[] = [
          "select-type",
          "describe",
          "parsed-terms",
          "set-arbitrator",
          "share-link",
          "connect-wallet",
          "approve-agreement",
          "lock-funds",
          "dashboard",
          "complete",
          "timeout",
          "dispute",
        ];
        if (screen && safeScreens.includes(screen)) state.screen = screen;
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
    setMilestoneTxState,
    setMilestoneOnChainStatus,
    markMilestoneNotifiedToDb,
    resetAll,
  } = partyASlice.actions;

  export default partyASlice.reducer;
