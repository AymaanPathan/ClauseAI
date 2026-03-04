// ============================================================
// api/stacksApi.ts
// Thin wrappers used by Redux thunks.
// Combines contractCalls (write) + contractReads (read).
// ============================================================

export {
  callCreateAgreement,
  callDeposit,
  callComplete,
  callDispute,
  callRefund,
  callTriggerTimeout,
  // callCancelDeposit,
} from "@/lib/contractCalls";

export {
  getAgreement,
  getAgreementState,
  getTotalDeposited,
  isTimedOut,
  getCurrentBlockHeight,
  stateLabel,
} from "@/lib/contractReads";

export type { OnChainAgreement } from "@/lib/contractReads";
export type { ContractState } from "@/lib/stacksConfig";
export { CONTRACT_STATE } from "@/lib/stacksConfig";
