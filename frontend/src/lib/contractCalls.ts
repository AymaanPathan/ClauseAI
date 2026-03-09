// ============================================================
// lib/contractCalls.ts — MILESTONE ESCROW v3 (sBTC edition)
//
// All STX transfers replaced with sBTC SIP-010 token transfers.
// Post conditions use fungible-token assertions instead of ustx.
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
  SBTC_CONTRACT_PRINCIPAL,
  SBTC_ASSET_NAME,
  SATOSHIS_PER_BTC,
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
// Passed to openContractCall so Leather never needs to fetch it
// from the node (prevents crash on un-indexed testnet contracts).

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
        ...milestoneArgPairs(10),
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

// ── Core helper ───────────────────────────────────────────────

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
      abi: ESCROW_ABI,
      onFinish: (data: { txId: string }) => resolve(data.txId),
      onCancel: () => reject(new Error("User cancelled transaction")),
    });
  });
}

// ── Amount conversion ─────────────────────────────────────────

/**
 * Convert a USD amount to satoshis for the contract call.
 *
 * On TESTNET this is a static placeholder (1 USD = 1,000 sats).
 * On MAINNET replace this with a live BTC/USD price feed.
 *
 * 1,000 sats minimum keeps test transactions cheap and above the
 * contract's MIN-AMOUNT (1000 sats) constant.
 */
function usdToSats(usd: number): bigint {
  if (NETWORK === "mainnet") {
    // TODO: integrate price feed (e.g. Pyth, Stacks oracle)
    throw new Error(
      "usdToSats: mainnet price feed not configured. " +
        "Replace this with a live BTC/USD rate before deploying.",
    );
  }
  // Testnet placeholder: 1 USD → 1,000 sats (0.00001 BTC)
  return BigInt(Math.max(1000, Math.round(usd * 1000)));
}

/**
 * Expose the conversion so UI components can show the sBTC equivalent.
 * Returns satoshis as a number.
 */
export function usdToSatsPreview(usd: number): number {
  if (NETWORK === "mainnet") return 0; // won't be accurate without price feed
  return Math.max(1000, Math.round(usd * 1000));
}

// ── Post condition builder ────────────────────────────────────

/**
 * Build an sBTC fungible-token post condition asserting that
 * `sender` will send AT MOST `sats` sBTC tokens.
 *
 * Format expected by @stacks/transactions Pc builder:
 *   Pc.principal(addr).willSendLte(amount).ft(contractId, assetName)
 */
function sbtcSendLte(sender: string, sats: bigint) {
  return Pc.principal(sender)
    .willSendLte(sats)
    .ft(SBTC_CONTRACT_PRINCIPAL, SBTC_ASSET_NAME);
}

// ── Validation helpers ────────────────────────────────────────

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
      `Milestone percentages must sum to 10000 (100%). Got ${total}.`,
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
// No sBTC transfer happens here — just writes the agreement to chain.

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

  const satoshiAmount = usdToSats(amountUsd);
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
      uintCV(satoshiAmount),
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
    // create-agreement doesn't move tokens — Deny mode is safe here
    postConditionMode: PostConditionMode.Deny,
    postConditions: [],
  });
}

// ── deposit ───────────────────────────────────────────────────
// Party A sends sBTC to the escrow contract.
// Post condition: payer sends exactly `satoshiAmount` sBTC tokens.

export async function callDeposit(
  agreementId: string,
  amountUsd: number,
  payerAddress: string,
): Promise<string> {
  const satoshiAmount = usdToSats(amountUsd);

  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "deposit",
    functionArgs: [stringAsciiCV(agreementId)],
    postConditionMode: PostConditionMode.Deny,
    postConditions: [
      // Payer will send ≤ satoshiAmount sBTC from their wallet
      sbtcSendLte(payerAddress, satoshiAmount),
    ],
  });
}

// ── complete-milestone ────────────────────────────────────────
// Contract sends sBTC from escrow → party-b.
// Post condition: escrow contract sends ≤ milestone allocation.

export async function callCompleteMilestone(
  agreementId: string,
  milestoneIndex: number,
  milestoneAmountSats: bigint,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "complete-milestone",
    functionArgs: [stringAsciiCV(agreementId), uintCV(BigInt(milestoneIndex))],
    postConditionMode: PostConditionMode.Deny,
    postConditions: [
      // The escrow contract principal sends sBTC to the receiver
      sbtcSendLte(`${CONTRACT_ADDRESS}.${CONTRACT_NAME}`, milestoneAmountSats),
    ],
  });
}

// ── dispute-milestone ─────────────────────────────────────────
// No token movement — safe to use Deny mode with empty conditions.

export async function callDisputeMilestone(
  agreementId: string,
  milestoneIndex: number,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "dispute-milestone",
    functionArgs: [stringAsciiCV(agreementId), uintCV(BigInt(milestoneIndex))],
    postConditionMode: PostConditionMode.Deny,
    postConditions: [],
  });
}

// ── resolve-to-receiver ───────────────────────────────────────

export async function callResolveToReceiver(
  agreementId: string,
  milestoneIndex: number,
  milestoneAmountSats: bigint,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "resolve-to-receiver",
    functionArgs: [stringAsciiCV(agreementId), uintCV(BigInt(milestoneIndex))],
    postConditionMode: PostConditionMode.Deny,
    postConditions: [
      sbtcSendLte(`${CONTRACT_ADDRESS}.${CONTRACT_NAME}`, milestoneAmountSats),
    ],
  });
}

// ── resolve-to-payer ─────────────────────────────────────────

export async function callResolveToPayer(
  agreementId: string,
  milestoneIndex: number,
  milestoneAmountSats: bigint,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "resolve-to-payer",
    functionArgs: [stringAsciiCV(agreementId), uintCV(BigInt(milestoneIndex))],
    postConditionMode: PostConditionMode.Deny,
    postConditions: [
      sbtcSendLte(`${CONTRACT_ADDRESS}.${CONTRACT_NAME}`, milestoneAmountSats),
    ],
  });
}

// ── trigger-milestone-timeout ─────────────────────────────────

export async function callTriggerMilestoneTimeout(
  agreementId: string,
  milestoneIndex: number,
  milestoneAmountSats: bigint,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "trigger-milestone-timeout",
    functionArgs: [stringAsciiCV(agreementId), uintCV(BigInt(milestoneIndex))],
    postConditionMode: PostConditionMode.Deny,
    postConditions: [
      sbtcSendLte(`${CONTRACT_ADDRESS}.${CONTRACT_NAME}`, milestoneAmountSats),
    ],
  });
}

// ── trigger-arb-timeout ───────────────────────────────────────

export async function callTriggerArbTimeout(
  agreementId: string,
  milestoneIndex: number,
  milestoneAmountSats: bigint,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "trigger-arb-timeout",
    functionArgs: [stringAsciiCV(agreementId), uintCV(BigInt(milestoneIndex))],
    postConditionMode: PostConditionMode.Deny,
    postConditions: [
      sbtcSendLte(`${CONTRACT_ADDRESS}.${CONTRACT_NAME}`, milestoneAmountSats),
    ],
  });
}

// ── cancel-agreement ──────────────────────────────────────────
// No token movement (only works in STATE-PENDING, before deposit).

export async function callCancelAgreement(
  agreementId: string,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "cancel-agreement",
    functionArgs: [stringAsciiCV(agreementId)],
    postConditionMode: PostConditionMode.Deny,
    postConditions: [],
  });
}
