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

// ── Helper ────────────────────────────────────────────────────

function callContract(options: {
  contractAddress: string;
  contractName: string;
  functionName: string;
  functionArgs: unknown[];
  postConditionMode: PostConditionMode;
  postConditions: unknown[];
}): Promise<string> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (openContractCall as (o: any) => void)({
      ...options,
      network: NETWORK,
      onFinish: (data: { txId: string }) => resolve(data.txId),
      onCancel: () => reject(new Error("User cancelled transaction")),
    });
  });
}

function usdToMicroStx(_usd: number): bigint {
  return BigInt(1_000_000); // 1 STX — replace with real price feed on mainnet
}

function validateAddress(address: string, label: string) {
  const expectedPrefix = NETWORK_NAME === "mainnet" ? "SP" : "ST";
  if (!address.startsWith(expectedPrefix)) {
    throw new Error(
      `${label} address "${address.slice(0, 6)}..." is a ${
        address.startsWith("SP") ? "MAINNET" : "TESTNET"
      } address but app is on ${NETWORK_NAME.toUpperCase()}. ` +
        `Switch Leather to ${NETWORK_NAME === "testnet" ? "Testnet4" : "Mainnet"}.`,
    );
  }
}

function validateMilestones(milestones: MilestoneInput[]) {
  if (milestones.length < 1 || milestones.length > 10) {
    throw new Error("Milestones must be between 1 and 10");
  }
  const total = milestones.reduce((sum, m) => sum + m.percentage, 0);
  if (total !== 10000) {
    throw new Error(
      `Milestone percentages must sum to 10000 (100%). Got ${total}`,
    );
  }
}

function padMilestones(
  milestones: MilestoneInput[],
): { pct: bigint; dl: bigint }[] {
  const padded = [...milestones];
  while (padded.length < 10) padded.push({ percentage: 0, deadlineBlock: 0 });
  return padded.map((m) => ({
    pct: BigInt(m.percentage),
    dl: BigInt(m.deadlineBlock),
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
