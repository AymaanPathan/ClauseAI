// ============================================================
// lib/contractCalls.ts — MILESTONE ESCROW v3
// ============================================================

import { openContractCall } from "@stacks/connect";
import {
  stringAsciiCV,
  uintCV,
  principalCV,
  PostConditionMode,
  Pc,
} from "@stacks/transactions";
import {
  CONTRACT_ADDRESS,
  CONTRACT_NAME,
  NETWORK_NAME,
  MICRO_STX,
} from "./stacksConfig";

const NETWORK = NETWORK_NAME;

// ── Types ─────────────────────────────────────────────────────

export interface MilestoneInput {
  /** Basis points out of 10000 (e.g. 3000 = 30%) */
  percentage: number;
  /** Absolute block height deadline. Pass 0 for no deadline. */
  deadlineBlock: number;
}

// ── Inline ABI ────────────────────────────────────────────────
//
// ROOT CAUSE OF THE LEATHER CRASH:
//
//   Leather's FunctionArgumentList (index.js:51857) does:
//     abi.functions.find(f => f.name === functionName).args.map(a => a.name)
//
//   Without an explicit `abi` in openContractCall, Leather fetches
//   it from the Stacks node. On testnet with a freshly deployed or
//   not-yet-indexed contract, the fetch returns null/undefined —
//   so `.args` is undefined and `.map(a => a.name)` throws:
//     TypeError: Cannot read properties of undefined (reading 'name')
//
//   FIX: pass the ABI inline so Leather never hits the network.
//   Every arg object MUST have a { name, type } shape.

function milestoneArgPairs(count: number): { name: string; type: "uint128" }[] {
  const out: { name: string; type: "uint128" }[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ name: `m${i}-pct`, type: "uint128" });
    out.push({ name: `m${i}-deadline`, type: "uint128" });
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ESCROW_ABI: any = {
  functions: [
    {
      name: "create-agreement",
      access: "public",
      args: [
        { name: "agreement-id", type: { "string-ascii": { length: 36 } } },
        { name: "payer", type: "principal" },
        { name: "receiver", type: "principal" },
        { name: "arbitrator", type: "principal" },
        { name: "amount", type: "uint128" },
        { name: "milestone-count", type: "uint128" },
        ...milestoneArgPairs(10), // m0-pct, m0-deadline … m9-pct, m9-deadline
      ],
      outputs: { type: { response: { ok: "bool", error: "uint128" } } },
    },
    {
      name: "deposit",
      access: "public",
      args: [
        { name: "agreement-id", type: { "string-ascii": { length: 36 } } },
      ],
      outputs: { type: { response: { ok: "bool", error: "uint128" } } },
    },
    {
      name: "complete-milestone",
      access: "public",
      args: [
        { name: "agreement-id", type: { "string-ascii": { length: 36 } } },
        { name: "milestone-index", type: "uint128" },
      ],
      outputs: { type: { response: { ok: "bool", error: "uint128" } } },
    },
    {
      name: "dispute-milestone",
      access: "public",
      args: [
        { name: "agreement-id", type: { "string-ascii": { length: 36 } } },
        { name: "milestone-index", type: "uint128" },
      ],
      outputs: { type: { response: { ok: "bool", error: "uint128" } } },
    },
    {
      name: "resolve-to-receiver",
      access: "public",
      args: [
        { name: "agreement-id", type: { "string-ascii": { length: 36 } } },
        { name: "milestone-index", type: "uint128" },
      ],
      outputs: { type: { response: { ok: "bool", error: "uint128" } } },
    },
    {
      name: "resolve-to-payer",
      access: "public",
      args: [
        { name: "agreement-id", type: { "string-ascii": { length: 36 } } },
        { name: "milestone-index", type: "uint128" },
      ],
      outputs: { type: { response: { ok: "bool", error: "uint128" } } },
    },
    {
      name: "trigger-milestone-timeout",
      access: "public",
      args: [
        { name: "agreement-id", type: { "string-ascii": { length: 36 } } },
        { name: "milestone-index", type: "uint128" },
      ],
      outputs: { type: { response: { ok: "bool", error: "uint128" } } },
    },
    {
      name: "trigger-arb-timeout",
      access: "public",
      args: [
        { name: "agreement-id", type: { "string-ascii": { length: 36 } } },
        { name: "milestone-index", type: "uint128" },
      ],
      outputs: { type: { response: { ok: "bool", error: "uint128" } } },
    },
    {
      name: "cancel-agreement",
      access: "public",
      args: [
        { name: "agreement-id", type: { "string-ascii": { length: 36 } } },
      ],
      outputs: { type: { response: { ok: "bool", error: "uint128" } } },
    },
  ],
  variables: [],
  maps: [],
  fungible_tokens: [],
  non_fungible_tokens: [],
};

// ── Helper ────────────────────────────────────────────────────

function callContract(options: {
  contractAddress: string;
  contractName: string;
  functionName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  functionArgs: any[];
  postConditionMode: PostConditionMode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  postConditions: any[];
}): Promise<string> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (openContractCall as (o: any) => void)({
      ...options,
      network: NETWORK,
      // ▼▼▼ THE FIX — without this, Leather fetches ABI from node,
      //     which fails on testnet and crashes FunctionArgumentList
      abi: ESCROW_ABI,
      // ▲▲▲
      onFinish: (data: { txId: string }) => resolve(data.txId),
      onCancel: () => reject(new Error("User cancelled transaction")),
    });
  });
}

function usdToMicroStx(_usd: number): bigint {
  return BigInt(1_000_000); // 1 STX placeholder — replace with price feed on mainnet
}

function validateAddress(address: string, label: string) {
  if (!address || address.trim() === "") {
    throw new Error(`${label} address is empty. Cannot deploy contract.`);
  }
  const expectedPrefix = NETWORK_NAME === "mainnet" ? "SP" : "ST";
  if (!address.startsWith(expectedPrefix)) {
    throw new Error(
      `${label} address "${address.slice(0, 8)}..." is invalid for ${NETWORK_NAME.toUpperCase()}. ` +
        `Expected prefix "${expectedPrefix}". Switch Leather to ${NETWORK_NAME === "testnet" ? "Testnet4" : "Mainnet"}.`,
    );
  }
}

function validateMilestones(milestones: MilestoneInput[]) {
  if (milestones.length < 1 || milestones.length > 10) {
    throw new Error("Milestones must be between 1 and 10");
  }
  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i];
    if (m === undefined || m === null) {
      throw new Error(`Milestone at index ${i} is undefined`);
    }
    if (typeof m.percentage !== "number" || !isFinite(m.percentage)) {
      throw new Error(`Milestone ${i} has invalid percentage: ${m.percentage}`);
    }
    if (typeof m.deadlineBlock !== "number" || !isFinite(m.deadlineBlock)) {
      throw new Error(
        `Milestone ${i} has invalid deadlineBlock: ${m.deadlineBlock}`,
      );
    }
  }
  const total = milestones.reduce((sum, m) => sum + m.percentage, 0);
  if (total !== 10000) {
    throw new Error(
      `Milestone percentages must sum to 10000 (100%). Got ${total}. ` +
        `Check that your percentages × 100 sum correctly.`,
    );
  }
}

function safeBigInt(value: number | undefined | null, fallback = 0): bigint {
  const n = value ?? fallback;
  if (!Number.isFinite(n)) return BigInt(fallback);
  return BigInt(Math.round(n));
}

function padMilestones(
  milestones: MilestoneInput[],
): { pct: bigint; dl: bigint }[] {
  const padded = [...milestones];
  while (padded.length < 10) padded.push({ percentage: 0, deadlineBlock: 0 });
  return padded.map((m) => ({
    pct: safeBigInt(m.percentage),
    dl: safeBigInt(m.deadlineBlock),
  }));
}

// ── create-agreement ──────────────────────────────────────────

export async function callCreateAgreement(
  agreementId: string,
  payer: string,
  receiver: string,
  arbitrator: string,
  amountUsd: number,
  milestones: MilestoneInput[],
): Promise<string> {
  validateAddress(payer, "Payer");
  validateAddress(receiver, "Receiver");
  validateAddress(arbitrator, "Arbitrator");
  validateMilestones(milestones);

  const microStxAmount = usdToMicroStx(amountUsd);
  const p = padMilestones(milestones);

  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "create-agreement",
    functionArgs: [
      stringAsciiCV(agreementId),
      principalCV(payer),
      principalCV(receiver),
      principalCV(arbitrator),
      uintCV(microStxAmount),
      uintCV(BigInt(milestones.length)),
      uintCV(p[0].pct),
      uintCV(p[0].dl),
      uintCV(p[1].pct),
      uintCV(p[1].dl),
      uintCV(p[2].pct),
      uintCV(p[2].dl),
      uintCV(p[3].pct),
      uintCV(p[3].dl),
      uintCV(p[4].pct),
      uintCV(p[4].dl),
      uintCV(p[5].pct),
      uintCV(p[5].dl),
      uintCV(p[6].pct),
      uintCV(p[6].dl),
      uintCV(p[7].pct),
      uintCV(p[7].dl),
      uintCV(p[8].pct),
      uintCV(p[8].dl),
      uintCV(p[9].pct),
      uintCV(p[9].dl),
    ],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}

// ── deposit ───────────────────────────────────────────────────

export async function callDeposit(
  agreementId: string,
  amountUsd: number,
  payerAddress: string,
): Promise<string> {
  const microStxAmount = usdToMicroStx(amountUsd);
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "deposit",
    functionArgs: [stringAsciiCV(agreementId)],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [
      Pc.principal(payerAddress).willSendLte(microStxAmount).ustx(),
    ],
  });
}

// ── complete-milestone ────────────────────────────────────────

export async function callCompleteMilestone(
  agreementId: string,
  milestoneIndex: number,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "complete-milestone",
    functionArgs: [stringAsciiCV(agreementId), uintCV(BigInt(milestoneIndex))],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}

// ── dispute-milestone ─────────────────────────────────────────

export async function callDisputeMilestone(
  agreementId: string,
  milestoneIndex: number,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "dispute-milestone",
    functionArgs: [stringAsciiCV(agreementId), uintCV(BigInt(milestoneIndex))],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}

// ── resolve-to-receiver ───────────────────────────────────────

export async function callResolveToReceiver(
  agreementId: string,
  milestoneIndex: number,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "resolve-to-receiver",
    functionArgs: [stringAsciiCV(agreementId), uintCV(BigInt(milestoneIndex))],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}

// ── resolve-to-payer ─────────────────────────────────────────

export async function callResolveToPayer(
  agreementId: string,
  milestoneIndex: number,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "resolve-to-payer",
    functionArgs: [stringAsciiCV(agreementId), uintCV(BigInt(milestoneIndex))],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}

// ── trigger-milestone-timeout ─────────────────────────────────

export async function callTriggerMilestoneTimeout(
  agreementId: string,
  milestoneIndex: number,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "trigger-milestone-timeout",
    functionArgs: [stringAsciiCV(agreementId), uintCV(BigInt(milestoneIndex))],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}

// ── trigger-arb-timeout ───────────────────────────────────────

export async function callTriggerArbTimeout(
  agreementId: string,
  milestoneIndex: number,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "trigger-arb-timeout",
    functionArgs: [stringAsciiCV(agreementId), uintCV(BigInt(milestoneIndex))],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}

// ── cancel-agreement ──────────────────────────────────────────

export async function callCancelAgreement(
  agreementId: string,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "cancel-agreement",
    functionArgs: [stringAsciiCV(agreementId)],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}
