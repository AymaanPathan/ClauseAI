// ============================================================
// lib/contractCalls.ts
// All WRITE contract calls via Hiro Wallet popup.
// Uses new @stacks/connect SIP-030 API (v7+).
// No more userSession or network class in openContractCall.
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

// New connect API takes "mainnet" | "testnet" string, not a class instance
const NETWORK = NETWORK_NAME;

// ── Helper: resolve tx promise ────────────────────────────────
// Cast to `any` to sidestep the ContractCallRegular / ContractCallSponsored
// union — the new SIP-030 API is fully compatible at runtime.
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

// ── STX amount helper ─────────────────────────────────────────
// Converts USD amount to microSTX (mock rate: $0.80 per STX)
// Replace with real price feed on mainnet
function usdToMicroStx(usd: number): bigint {
  const STX_PRICE_USD = 0.8;
  const stx = usd / STX_PRICE_USD;
  return BigInt(Math.round(stx * MICRO_STX));
}

// ─────────────────────────────────────────────────────────────
// deposit()
// Called by BOTH parties individually on Screen 7
// ─────────────────────────────────────────────────────────────
export async function callDeposit(
  agreementId: string,
  amountUsd: number,
  senderAddress: string,
): Promise<string> {
  const microStxAmount = usdToMicroStx(amountUsd);

  const postConditions = [
    Pc.principal(senderAddress).willSendEq(microStxAmount).ustx(),
  ];

  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "deposit",
    functionArgs: [stringAsciiCV(agreementId)],
    postConditionMode: PostConditionMode.Deny,
    postConditions,
  });
}

// ─────────────────────────────────────────────────────────────
// create-agreement()
// Called once by Party A to register the agreement on-chain
// ─────────────────────────────────────────────────────────────
export async function callCreateAgreement(
  agreementId: string,
  partyA: string,
  partyB: string,
  arbitrator: string,
  amountUsd: number,
): Promise<string> {
  const microStxAmount = usdToMicroStx(amountUsd);

  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "create-agreement",
    functionArgs: [
      stringAsciiCV(agreementId),
      principalCV(partyA),
      principalCV(partyB),
      principalCV(arbitrator),
      uintCV(microStxAmount),
    ],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}

// ─────────────────────────────────────────────────────────────
// complete()
// Called by Party B to release funds to Party A
// ─────────────────────────────────────────────────────────────
export async function callComplete(agreementId: string): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "complete",
    functionArgs: [stringAsciiCV(agreementId)],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}

// ─────────────────────────────────────────────────────────────
// dispute()
// Called by either party to enter disputed state
// ─────────────────────────────────────────────────────────────
export async function callDispute(agreementId: string): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "dispute",
    functionArgs: [stringAsciiCV(agreementId)],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}

// ─────────────────────────────────────────────────────────────
// refund()
// Called by Party A to send funds back to Party B
// ─────────────────────────────────────────────────────────────
export async function callRefund(agreementId: string): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "refund",
    functionArgs: [stringAsciiCV(agreementId)],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}

// ─────────────────────────────────────────────────────────────
// trigger-timeout()
// Can be called by anyone after 72hr timeout
// ─────────────────────────────────────────────────────────────
export async function callTriggerTimeout(agreementId: string): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "trigger-timeout",
    functionArgs: [stringAsciiCV(agreementId)],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}

// ─────────────────────────────────────────────────────────────
// cancel-deposit()
// Called by a party to pull their deposit back while PENDING
// ─────────────────────────────────────────────────────────────
export async function callCancelDeposit(agreementId: string): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "cancel-deposit",
    functionArgs: [stringAsciiCV(agreementId)],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}
