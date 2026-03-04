// ============================================================
// lib/contractReads.ts — CONDITIONAL ESCROW v2
// All READ-ONLY contract calls via Stacks API.
// These do NOT require wallet signing.
//
// Key changes from v1:
//   • OnChainAgreement reflects new map shape:
//     - deposited (bool) replaces partyADeposited / partyBDeposited
//     - amount replaces amountPerParty
//     - removed partyAAmount, partyBAmount
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
  partyA: string; // Payer
  partyB: string; // Receiver
  arbitrator: string;
  amount: bigint; // Amount payer locked (or will lock)
  deposited: boolean; // Has payer deposited?
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

// ── get-agreement ─────────────────────────────────────────────
export async function getAgreement(
  agreementId: string,
): Promise<OnChainAgreement | null> {
  try {
    const result = await readContract("get-agreement", [
      stringAsciiCV(agreementId),
    ]);
    const json = cvToJSON(result);
    if (!json.value) return null;

    const v = json.value;
    return {
      state: Number(v["state"].value) as ContractState,
      partyA: v["party-a"].value,
      partyB: v["party-b"].value,
      arbitrator: v["arbitrator"].value,
      amount: BigInt(v["amount"].value),
      deposited: v["deposited"].value === true,
      totalDeposited: BigInt(v["total-deposited"].value),
      deadlineBlock: BigInt(v["deadline-block"].value),
      disputeBlock: BigInt(v["dispute-block"].value),
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
    if (json.type === "err") return null;
    return Number(json.value.value) as ContractState;
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
    if (json.type === "err") return null;
    return BigInt(json.value.value);
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
    if (json.type === "err") return false;
    return json.value.value === true;
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
    if (json.type === "err") return false;
    return json.value.value === true;
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
