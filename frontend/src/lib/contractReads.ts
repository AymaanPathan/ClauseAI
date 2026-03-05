// ============================================================
// lib/contractReads.ts
// FIX: All BigInt values converted to number before returning.
//      Redux cannot serialize BigInt — causes console warnings
//      and potential state bugs.
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

// ── All numeric fields are plain number (no BigInt) ───────────
export interface OnChainAgreement {
  state: ContractState;
  partyA: string;
  partyB: string;
  arbitrator: string;
  amount: number; // was bigint
  deposited: boolean;
  totalDeposited: number; // was bigint
  deadlineBlock: number; // was bigint
  disputeBlock: number; // was bigint
}

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

function safeVal(field: unknown): unknown {
  if (field === null || field === undefined) return undefined;
  if (typeof field === "object" && "value" in (field as object)) {
    return (field as { value: unknown }).value;
  }
  return field;
}

// Safe number conversion — handles BigInt, string, number
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

    if (stateRaw === undefined || partyARaw === undefined) {
      console.warn("[contractReads] missing required fields", v);
      return null;
    }

    return {
      state: Number(stateRaw) as ContractState,
      partyA: String(safeVal(v["party-a"]) ?? ""),
      partyB: String(safeVal(v["party-b"]) ?? ""),
      arbitrator: String(safeVal(v["arbitrator"]) ?? ""),
      amount: toNum(safeVal(v["amount"])),
      deposited:
        safeVal(v["deposited"]) === true || safeVal(v["deposited"]) === "true",
      totalDeposited: toNum(safeVal(v["total-deposited"])),
      deadlineBlock: toNum(safeVal(v["deadline-block"])),
      disputeBlock: toNum(safeVal(v["dispute-block"])),
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
    if (!json || json.type === "err" || json.value == null) return null;
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
): Promise<number | null> {
  try {
    const result = await readContract("get-total-deposited", [
      stringAsciiCV(agreementId),
    ]);
    const json = cvToJSON(result);
    if (!json || json.type === "err" || json.value == null) return null;
    return toNum(safeVal(json.value));
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
    if (!json || json.type === "err" || json.value == null) return false;
    return safeVal(json.value) === true;
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

// ── stateLabel ────────────────────────────────────────────────
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
