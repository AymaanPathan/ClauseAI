// ============================================================
// lib/contractReads.ts — MILESTONE ESCROW v3 (sBTC edition)
//
// Amounts returned from the chain are in satoshis (sBTC's base unit).
// All BigInt values converted to number (Redux serialization safe).
// ============================================================

import {
  fetchCallReadOnlyFunction,
  cvToJSON,
  stringAsciiCV,
  uintCV,
} from "@stacks/transactions";
import { STACKS_TESTNET, STACKS_MAINNET } from "@stacks/network";
import {
  CONTRACT_ADDRESS,
  CONTRACT_NAME,
  NETWORK_NAME,
  CONTRACT_STATE,
  ContractState,
  SATOSHIS_PER_BTC,
  formatSats,
} from "./stacksConfig";

const STACKS_NETWORK =
  NETWORK_NAME === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;

// ── Milestone status constants (mirror Clarity) ───────────────
export const MILESTONE_STATUS = {
  PENDING: 0,
  ACTIVE: 1,
  COMPLETE: 2,
  REFUNDED: 3,
  DISPUTED: 4,
} as const;

export type MilestoneStatus =
  (typeof MILESTONE_STATUS)[keyof typeof MILESTONE_STATUS];

// ── Types ─────────────────────────────────────────────────────

export interface OnChainMilestone {
  index: number;
  percentage: number; // basis points (0–10000)
  amount: number; // satoshis allocated to this tranche
  status: MilestoneStatus;
  deadlineBlock: number;
  disputeBlock: number;
}

export interface OnChainAgreement {
  state: ContractState;
  partyA: string;
  partyB: string;
  arbitrator: string;
  /** Total escrow amount in satoshis */
  totalAmount: number;
  deposited: boolean;
  /** Remaining satoshis held in escrow */
  totalDeposited: number;
  milestoneCount: number;
  createdAt: number;
}

// ── Helpers ───────────────────────────────────────────────────

async function readContract(
  functionName: string,
  functionArgs: (
    | ReturnType<typeof stringAsciiCV>
    | ReturnType<typeof uintCV>
  )[],
) {
  return fetchCallReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName,
    functionArgs,
    network: STACKS_NETWORK,
    senderAddress: CONTRACT_ADDRESS,
  });
}

function safeVal(field: unknown): unknown {
  if (field === null || field === undefined) return undefined;
  if (typeof field === "object" && "value" in (field as object)) {
    return (field as { value: unknown }).value;
  }
  return field;
}

function toNum(val: unknown): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === "bigint") return Number(val);
  if (typeof val === "number") return val;
  return Number(String(val));
}

// ── get-agreement ─────────────────────────────────────────────
export async function getAgreement(
  agreementId: string,
): Promise<OnChainAgreement | null> {
  try {
    const result = await readContract("get-agreement", [
      stringAsciiCV(agreementId),
    ]);

    const json = cvToJSON(result);
    if (!json || json.value === null || json.value === undefined) return null;

    const raw = json.value;
    const v: Record<string, unknown> =
      raw &&
      typeof raw === "object" &&
      "value" in (raw as object) &&
      typeof (raw as { value: unknown }).value === "object"
        ? ((raw as { value: unknown }).value as Record<string, unknown>)
        : (raw as Record<string, unknown>);

    if (!v) return null;

    const stateRaw = safeVal(v["state"]);
    const partyARaw = safeVal(v["party-a"]);
    if (stateRaw === undefined || partyARaw === undefined) return null;

    return {
      state: Number(stateRaw) as ContractState,
      partyA: String(safeVal(v["party-a"]) ?? ""),
      partyB: String(safeVal(v["party-b"]) ?? ""),
      arbitrator: String(safeVal(v["arbitrator"]) ?? ""),
      totalAmount: toNum(safeVal(v["total-amount"])), // satoshis
      deposited:
        safeVal(v["deposited"]) === true || safeVal(v["deposited"]) === "true",
      totalDeposited: toNum(safeVal(v["total-deposited"])), // satoshis
      milestoneCount: toNum(safeVal(v["milestone-count"])),
      createdAt: toNum(safeVal(v["created-at"])),
    };
  } catch (err) {
    console.error("[contractReads] getAgreement error:", err);
    return null;
  }
}

// ── get-milestone ─────────────────────────────────────────────
export async function getMilestone(
  agreementId: string,
  index: number,
): Promise<OnChainMilestone | null> {
  try {
    const result = await readContract("get-milestone", [
      stringAsciiCV(agreementId),
      uintCV(BigInt(index)),
    ]);

    const json = cvToJSON(result);
    if (!json || json.value === null || json.value === undefined) return null;

    const raw = json.value;
    const v: Record<string, unknown> =
      raw &&
      typeof raw === "object" &&
      "value" in (raw as object) &&
      typeof (raw as { value: unknown }).value === "object"
        ? ((raw as { value: unknown }).value as Record<string, unknown>)
        : (raw as Record<string, unknown>);

    if (!v) return null;

    return {
      index,
      percentage: toNum(safeVal(v["percentage"])),
      amount: toNum(safeVal(v["amount"])), // satoshis
      status: toNum(safeVal(v["status"])) as MilestoneStatus,
      deadlineBlock: toNum(safeVal(v["deadline-block"])),
      disputeBlock: toNum(safeVal(v["dispute-block"])),
    };
  } catch (err) {
    console.error(`[contractReads] getMilestone(${index}) error:`, err);
    return null;
  }
}

// ── getAllMilestones ───────────────────────────────────────────
export async function getAllMilestones(
  agreementId: string,
  count: number,
): Promise<OnChainMilestone[]> {
  const indices = Array.from({ length: count }, (_, i) => i);
  const results = await Promise.all(
    indices.map((i) => getMilestone(agreementId, i)),
  );
  return results.filter((m): m is OnChainMilestone => m !== null);
}

// ── get-state ─────────────────────────────────────────────────
export async function getAgreementState(
  agreementId: string,
): Promise<ContractState | null> {
  try {
    const result = await readContract("get-state", [
      stringAsciiCV(agreementId),
    ]);
    const json = cvToJSON(result);
    if (!json || json.type === "err" || json.value == null) return null;
    const val = safeVal(json.value);
    return val !== undefined ? (Number(val) as ContractState) : null;
  } catch (err) {
    console.error("[contractReads] getAgreementState error:", err);
    return null;
  }
}

// ── get-milestone-status ──────────────────────────────────────
export async function getMilestoneStatus(
  agreementId: string,
  index: number,
): Promise<MilestoneStatus | null> {
  try {
    const result = await readContract("get-milestone-status", [
      stringAsciiCV(agreementId),
      uintCV(BigInt(index)),
    ]);
    const json = cvToJSON(result);
    if (!json || json.type === "err" || json.value == null) return null;
    const val = safeVal(json.value);
    return val !== undefined ? (toNum(val) as MilestoneStatus) : null;
  } catch (err) {
    console.error("[contractReads] getMilestoneStatus error:", err);
    return null;
  }
}

// ── is-milestone-timed-out ────────────────────────────────────
export async function isMilestoneTimedOut(
  agreementId: string,
  index: number,
): Promise<boolean> {
  try {
    const result = await readContract("is-milestone-timed-out", [
      stringAsciiCV(agreementId),
      uintCV(BigInt(index)),
    ]);
    const json = cvToJSON(result);
    if (!json || json.type === "err" || json.value == null) return false;
    return safeVal(json.value) === true;
  } catch {
    return false;
  }
}

// ── is-arb-timed-out ─────────────────────────────────────────
export async function isArbTimedOut(
  agreementId: string,
  index: number,
): Promise<boolean> {
  try {
    const result = await readContract("is-arb-timed-out", [
      stringAsciiCV(agreementId),
      uintCV(BigInt(index)),
    ]);
    const json = cvToJSON(result);
    if (!json || json.type === "err" || json.value == null) return false;
    return safeVal(json.value) === true;
  } catch {
    return false;
  }
}

// ── getCurrentBlockHeight ─────────────────────────────────────
export async function getCurrentBlockHeight(): Promise<number> {
  try {
    const baseUrl = STACKS_NETWORK.client.baseUrl;
    const res = await fetch(`${baseUrl}/v2/info`);
    const data = await res.json();
    return data.stacks_tip_height ?? 0;
  } catch {
    return 0;
  }
}

// ── getSbtcBalance ────────────────────────────────────────────
/**
 * Read an address's sBTC balance via the SIP-010 `get-balance` call.
 * Returns satoshis as a number.
 */
export async function getSbtcBalance(address: string): Promise<number> {
  try {
    const { SBTC_CONTRACT_ADDRESS, SBTC_CONTRACT_NAME } =
      await import("./stacksConfig");
    const result = await fetchCallReadOnlyFunction({
      contractAddress: SBTC_CONTRACT_ADDRESS,
      contractName: SBTC_CONTRACT_NAME,
      functionName: "get-balance",
      functionArgs: [principalCV(address)],
      network: STACKS_NETWORK,
      senderAddress: address,
    });
    const json = cvToJSON(result);
    if (!json || json.value == null) return 0;
    const val = safeVal(json.value);
    return toNum(val);
  } catch {
    return 0;
  }
}

// Need principalCV for getSbtcBalance
import { principalCV } from "@stacks/transactions";

// ── Display helpers ───────────────────────────────────────────

export function stateLabel(state: ContractState): string {
  switch (state) {
    case CONTRACT_STATE.PENDING:
      return "Pending";
    case CONTRACT_STATE.ACTIVE:
      return "Active";
    case CONTRACT_STATE.COMPLETE:
      return "Complete";
    case CONTRACT_STATE.REFUNDED:
      return "Refunded";
    case CONTRACT_STATE.DISPUTED:
      return "Disputed";
    default:
      return "Unknown";
  }
}

export function milestoneStatusLabel(status: MilestoneStatus): string {
  switch (status) {
    case MILESTONE_STATUS.PENDING:
      return "Pending";
    case MILESTONE_STATUS.ACTIVE:
      return "Active";
    case MILESTONE_STATUS.COMPLETE:
      return "Complete";
    case MILESTONE_STATUS.REFUNDED:
      return "Refunded";
    case MILESTONE_STATUS.DISPUTED:
      return "Disputed";
    default:
      return "Unknown";
  }
}

/**
 * Format satoshis for display in the UI.
 * Re-exported from stacksConfig for convenience.
 */
export { formatSats };

/**
 * Convert satoshis to a USD-equivalent display string.
 * On testnet uses the same placeholder rate as contractCalls.
 * (1000 sats = $1 USD on testnet)
 */
export function satsToUsdDisplay(sats: number): string {
  if (NETWORK_NAME === "mainnet") return "—"; // needs live price feed
  const usd = sats / 1000;
  return `$${usd.toFixed(2)}`;
}
