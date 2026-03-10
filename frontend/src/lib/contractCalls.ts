import { openContractCall } from "@stacks/connect";
import {
  stringAsciiCV,
  uintCV,
  principalCV,
  contractPrincipalCV,
  PostConditionMode,
  Pc,
} from "@stacks/transactions";
import {
  CONTRACT_ADDRESS,
  CONTRACT_NAME,
  NETWORK_NAME,
  SBTC_CONTRACT_ADDRESS,
  SBTC_CONTRACT_NAME,
  SBTC_CONTRACT_PRINCIPAL,
  SBTC_ASSET_NAME,
} from "./stacksConfig";

const NETWORK = NETWORK_NAME;

export interface MilestoneInput {
  percentage: number;
  deadlineBlock: number;
}

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
        { name: "agreement-id", type: { "string-ascii": { length: 64 } } },
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
        { name: "agreement-id", type: { "string-ascii": { length: 64 } } },
        { name: "token", type: "trait_reference" },
      ],
      outputs: { type: { response: { ok: "bool", error: "uint128" } } },
    },
    {
      name: "complete-milestone",
      access: "public",
      args: [
        { name: "agreement-id", type: { "string-ascii": { length: 64 } } },
        { name: "milestone-index", type: "uint128" },
        { name: "token", type: "trait_reference" },
      ],
      outputs: { type: { response: { ok: "bool", error: "uint128" } } },
    },
    {
      name: "dispute-milestone",
      access: "public",
      args: [
        { name: "agreement-id", type: { "string-ascii": { length: 64 } } },
        { name: "milestone-index", type: "uint128" },
      ],
      outputs: { type: { response: { ok: "bool", error: "uint128" } } },
    },
    {
      name: "resolve-to-receiver",
      access: "public",
      args: [
        { name: "agreement-id", type: { "string-ascii": { length: 64 } } },
        { name: "milestone-index", type: "uint128" },
        { name: "token", type: "trait_reference" },
      ],
      outputs: { type: { response: { ok: "bool", error: "uint128" } } },
    },
    {
      name: "resolve-to-payer",
      access: "public",
      args: [
        { name: "agreement-id", type: { "string-ascii": { length: 64 } } },
        { name: "milestone-index", type: "uint128" },
        { name: "token", type: "trait_reference" },
      ],
      outputs: { type: { response: { ok: "bool", error: "uint128" } } },
    },
    {
      name: "trigger-milestone-timeout",
      access: "public",
      args: [
        { name: "agreement-id", type: { "string-ascii": { length: 64 } } },
        { name: "milestone-index", type: "uint128" },
        { name: "token", type: "trait_reference" },
      ],
      outputs: { type: { response: { ok: "bool", error: "uint128" } } },
    },
    {
      name: "trigger-arb-timeout",
      access: "public",
      args: [
        { name: "agreement-id", type: { "string-ascii": { length: 64 } } },
        { name: "milestone-index", type: "uint128" },
        { name: "token", type: "trait_reference" },
      ],
      outputs: { type: { response: { ok: "bool", error: "uint128" } } },
    },
    {
      name: "cancel-agreement",
      access: "public",
      args: [
        { name: "agreement-id", type: { "string-ascii": { length: 64 } } },
      ],
      outputs: { type: { response: { ok: "bool", error: "uint128" } } },
    },
  ],
  variables: [],
  maps: [],
  fungible_tokens: [],
  non_fungible_tokens: [],
};

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

function usdToSats(usd: number): bigint {
  if (NETWORK === "mainnet") {
    throw new Error("usdToSats: mainnet price feed not configured.");
  }
  return BigInt(Math.max(1000, Math.round(usd * 1000)));
}

export function usdToSatsPreview(usd: number): number {
  if (NETWORK === "mainnet") return 0;
  return Math.max(1000, Math.round(usd * 1000));
}

function sbtcSendEq(sender: string, sats: bigint) {
  return Pc.principal(sender)
    .willSendEq(sats)
    .ft(SBTC_CONTRACT_PRINCIPAL, SBTC_ASSET_NAME);
}

function sbtcContractSendLte(sats: bigint) {
  return Pc.principal(`${CONTRACT_ADDRESS}.${CONTRACT_NAME}`)
    .willSendLte(sats)
    .ft(SBTC_CONTRACT_PRINCIPAL, SBTC_ASSET_NAME);
}

function validateAddress(address: string, label: string) {
  if (!address || address.trim() === "") {
    throw new Error(`${label} address is empty.`);
  }
  const expectedPrefix = NETWORK_NAME === "mainnet" ? "SP" : "ST";
  if (!address.startsWith(expectedPrefix)) {
    throw new Error(
      `${label} address "${address.slice(0, 8)}..." is invalid for ${NETWORK_NAME.toUpperCase()}.`,
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
    throw new Error(`Milestone percentages must sum to 10000. Got ${total}.`);
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

const TOKEN_CV = contractPrincipalCV(SBTC_CONTRACT_ADDRESS, SBTC_CONTRACT_NAME);

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
    postConditionMode: PostConditionMode.Deny,
    postConditions: [],
  });
}

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
    functionArgs: [stringAsciiCV(agreementId), TOKEN_CV],
    postConditionMode: PostConditionMode.Deny,
    postConditions: [sbtcSendEq(payerAddress, satoshiAmount)],
  });
}

export async function callCompleteMilestone(
  agreementId: string,
  milestoneIndex: number,
  milestoneAmountSats: bigint,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "complete-milestone",
    functionArgs: [
      stringAsciiCV(agreementId),
      uintCV(BigInt(milestoneIndex)),
      TOKEN_CV,
    ],
    postConditionMode: PostConditionMode.Deny,
    postConditions: [sbtcContractSendLte(milestoneAmountSats)],
  });
}

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

export async function callResolveToReceiver(
  agreementId: string,
  milestoneIndex: number,
  milestoneAmountSats: bigint,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "resolve-to-receiver",
    functionArgs: [
      stringAsciiCV(agreementId),
      uintCV(BigInt(milestoneIndex)),
      TOKEN_CV,
    ],
    postConditionMode: PostConditionMode.Deny,
    postConditions: [sbtcContractSendLte(milestoneAmountSats)],
  });
}

export async function callResolveToPayer(
  agreementId: string,
  milestoneIndex: number,
  milestoneAmountSats: bigint,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "resolve-to-payer",
    functionArgs: [
      stringAsciiCV(agreementId),
      uintCV(BigInt(milestoneIndex)),
      TOKEN_CV,
    ],
    postConditionMode: PostConditionMode.Deny,
    postConditions: [sbtcContractSendLte(milestoneAmountSats)],
  });
}

export async function callTriggerMilestoneTimeout(
  agreementId: string,
  milestoneIndex: number,
  milestoneAmountSats: bigint,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "trigger-milestone-timeout",
    functionArgs: [
      stringAsciiCV(agreementId),
      uintCV(BigInt(milestoneIndex)),
      TOKEN_CV,
    ],
    postConditionMode: PostConditionMode.Deny,
    postConditions: [sbtcContractSendLte(milestoneAmountSats)],
  });
}

export async function callTriggerArbTimeout(
  agreementId: string,
  milestoneIndex: number,
  milestoneAmountSats: bigint,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "trigger-arb-timeout",
    functionArgs: [
      stringAsciiCV(agreementId),
      uintCV(BigInt(milestoneIndex)),
      TOKEN_CV,
    ],
    postConditionMode: PostConditionMode.Deny,
    postConditions: [sbtcContractSendLte(milestoneAmountSats)],
  });
}

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
