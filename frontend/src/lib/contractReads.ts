// ============================================================
// lib/contractReads.ts — CONDITIONAL ESCROW v2
// All READ-ONLY contract calls via Stacks API.
// These do NOT require wallet signing.
//
// FIXES:
//   • getAgreement: contract returns (optional) — when agreementId doesn't
//     exist yet, cvToJSON gives { type: "(optional none)", value: null }.
//     Guard ALL field accesses so we never crash on undefined.
//   • All read functions now safely return null instead of throwing.
// ============================================================

import {
  fetchCallReadOnlyFunction,
  cvToJSON,
  stringAsciiCV,
} from "@stacks/transactions";
import { STACKS_TESTNET, STACKS_MAINNET } from "@stacks/network";
import {
  CONTRACT_ADDRESS,
  CONTRACT_NAME,
  NETWORK_NAME,
  CONTRACT_STATE,
  ContractState,
} from "./stacksConfig";

const STACKS_NETWORK =
  NETWORK_NAME === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;

// ── Parsed agreement from chain ───────────────────────────────
export interface OnChainAgreement {
  state: ContractState;
  partyA: string;
  partyB: string;
  arbitrator: string;
  amount: bigint;
  deposited: boolean;
  totalDeposited: bigint;
  deadlineBlock: bigint;
  disputeBlock: bigint;
}

// ── Shared call helper ────────────────────────────────────────
async function readContract(
  functionName: string,
  functionArgs: ReturnType<typeof stringAsciiCV>[],
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

// ── Safe field reader ─────────────────────────────────────────
// cvToJSON nested values can be { value: X } or { value: { value: X } }
// depending on Clarity type. This safely unwraps one level.
function safeVal(field: unknown): unknown {
  if (field === null || field === undefined) return undefined;
  if (typeof field === "object" && field !== null && "value" in field) {
    return (field as { value: unknown }).value;
  }
  return field;
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

    // Contract returns (optional {map}) — if none, value is null
    if (!json || json.value === null || json.value === undefined) {
      return null;
    }

    // Handle both direct value and nested optional: { type: "(optional ...)", value: {...} }
    const raw = json.value;

    // If it's still wrapped (some versions double-wrap), unwrap
    const v: Record<string, unknown> =
      raw &&
      typeof raw === "object" &&
      "value" in raw &&
      typeof (raw as { value: unknown }).value === "object"
        ? ((raw as { value: unknown }).value as Record<string, unknown>)
        : (raw as Record<string, unknown>);

    if (!v) return null;

    // Guard every field — if contract map keys are missing, return null
    const stateRaw = safeVal(v["state"]);
    const partyARaw = safeVal(v["party-a"]);
    const partyBRaw = safeVal(v["party-b"]);
    const arbitratorRaw = safeVal(v["arbitrator"]);
    const amountRaw = safeVal(v["amount"]);
    const depositedRaw = safeVal(v["deposited"]);
    const totalDepositedRaw = safeVal(v["total-deposited"]);
    const deadlineBlockRaw = safeVal(v["deadline-block"]);
    const disputeBlockRaw = safeVal(v["dispute-block"]);

    if (stateRaw === undefined || partyARaw === undefined) {
      console.warn(
        "[contractReads] getAgreement: missing required fields in response",
        v,
      );
      return null;
    }

    return {
      state: Number(stateRaw) as ContractState,
      partyA: String(partyARaw ?? ""),
      partyB: String(partyBRaw ?? ""),
      arbitrator: String(arbitratorRaw ?? ""),
      amount: BigInt(String(amountRaw ?? "0")),
      deposited: depositedRaw === true || depositedRaw === "true",
      totalDeposited: BigInt(String(totalDepositedRaw ?? "0")),
      deadlineBlock: BigInt(String(deadlineBlockRaw ?? "0")),
      disputeBlock: BigInt(String(disputeBlockRaw ?? "0")),
    };
  } catch (err) {
    console.error("[contractReads] getAgreement error:", err);
    return null;
  }
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
    if (
      !json ||
      json.type === "err" ||
      json.value === null ||
      json.value === undefined
    ) {
      return null;
    }
    const val = safeVal(json.value);
    return val !== undefined ? (Number(val) as ContractState) : null;
  } catch (err) {
    console.error("[contractReads] getAgreementState error:", err);
    return null;
  }
}

// ── get-total-deposited ───────────────────────────────────────
export async function getTotalDeposited(
  agreementId: string,
): Promise<bigint | null> {
  try {
    const result = await readContract("get-total-deposited", [
      stringAsciiCV(agreementId),
    ]);
    const json = cvToJSON(result);
    if (
      !json ||
      json.type === "err" ||
      json.value === null ||
      json.value === undefined
    ) {
      return null;
    }
    const val = safeVal(json.value);
    return val !== undefined ? BigInt(String(val)) : null;
  } catch (err) {
    console.error("[contractReads] getTotalDeposited error:", err);
    return null;
  }
}

// ── is-timed-out ──────────────────────────────────────────────
export async function isTimedOut(agreementId: string): Promise<boolean> {
  try {
    const result = await readContract("is-timed-out", [
      stringAsciiCV(agreementId),
    ]);
    const json = cvToJSON(result);
    if (
      !json ||
      json.type === "err" ||
      json.value === null ||
      json.value === undefined
    ) {
      return false;
    }
    const val = safeVal(json.value);
    return val === true || val === "true";
  } catch {
    return false;
  }
}

// ── is-arb-timed-out ─────────────────────────────────────────
export async function isArbTimedOut(agreementId: string): Promise<boolean> {
  try {
    const result = await readContract("is-arb-timed-out", [
      stringAsciiCV(agreementId),
    ]);
    const json = cvToJSON(result);
    if (
      !json ||
      json.type === "err" ||
      json.value === null ||
      json.value === undefined
    ) {
      return false;
    }
    const val = safeVal(json.value);
    return val === true || val === "true";
  } catch {
    return false;
  }
}

// ── Fetch current Stacks block height ─────────────────────────
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

// ── State label helper ────────────────────────────────────────
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
