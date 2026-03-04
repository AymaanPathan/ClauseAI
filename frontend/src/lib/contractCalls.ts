// ============================================================
// lib/contractCalls.ts — CONDITIONAL ESCROW v2
// Matches clauseai-escrow.clar v2.
//
// Key changes from v1:
//   • callDeposit() — payer only, no senderAddress for party B
//   • callComplete() — called by PAYER to release to receiver
//   • callRefund()   — called by PAYER to reclaim funds
//   • callResolveToReceiver() — replaces callResolveToB()
//   • callResolveToPayer()    — replaces callResolveToA()
//   • callCancelAgreement()   — replaces callCancelDeposit()
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

// ── Helper: resolve tx promise ────────────────────────────────
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

// ── Address validation ────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// create-agreement()
// Called once by the PAYER to register the escrow on-chain.
// Registers payer (party-a), receiver (party-b), arbitrator, amount.
// Does NOT transfer funds — payer deposits in a separate tx.
// ─────────────────────────────────────────────────────────────
export async function callCreateAgreement(
  agreementId: string,
  payer: string, // party-a
  receiver: string, // party-b
  arbitrator: string,
  amountUsd: number,
): Promise<string> {
  const microStxAmount = usdToMicroStx(amountUsd);
  validateAddress(payer, "Payer");
  validateAddress(receiver, "Receiver");
  validateAddress(arbitrator, "Arbitrator");

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
    ],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}

// ─────────────────────────────────────────────────────────────
// deposit()
// Called ONLY by the PAYER (party-a).
// Locks the full escrow amount in the contract.
// Transitions the agreement from PENDING → ACTIVE.
// ─────────────────────────────────────────────────────────────
export async function callDeposit(
  agreementId: string,
  amountUsd: number,
  payerAddress: string,
): Promise<string> {
  const microStxAmount = usdToMicroStx(amountUsd);

  const postConditions = [
    Pc.principal(payerAddress).willSendEq(microStxAmount).ustx(),
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
// complete()
// Called by the PAYER (party-a) to confirm conditions are met.
// Releases the escrowed funds to the RECEIVER (party-b).
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
// refund()
// Called by the PAYER (party-a) to reclaim their locked funds.
// Use when conditions won't be met or payer wants to cancel.
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
// dispute()
// Called by EITHER party to escalate to arbitration.
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
// trigger-timeout()
// Can be called by anyone after the 72hr deadline passes.
// Auto-refunds locked funds to the PAYER.
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
// resolve-to-receiver()
// Called by ARBITRATOR to rule in favor of the RECEIVER.
// Releases funds to party-b (receiver fulfilled conditions).
// Replaces old resolve-to-b().
// ─────────────────────────────────────────────────────────────
export async function callResolveToReceiver(
  agreementId: string,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "resolve-to-receiver",
    functionArgs: [stringAsciiCV(agreementId)],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}

// ─────────────────────────────────────────────────────────────
// resolve-to-payer()
// Called by ARBITRATOR to rule in favor of the PAYER.
// Refunds funds to party-a (receiver did not fulfill).
// Replaces old resolve-to-a().
// ─────────────────────────────────────────────────────────────
export async function callResolveToPayer(agreementId: string): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "resolve-to-payer",
    functionArgs: [stringAsciiCV(agreementId)],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}

// ─────────────────────────────────────────────────────────────
// cancel-agreement()
// Called by PAYER while still PENDING (before deposit).
// Marks agreement as cancelled — no funds to return since
// deposit hasn't happened yet.
// Replaces old cancel-deposit() which handled the dual-deposit case.
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// trigger-arb-timeout()
// Can be called by anyone if arbitrator is inactive for 48hrs.
// Refunds locked funds to the PAYER.
// ─────────────────────────────────────────────────────────────
export async function callTriggerArbTimeout(
  agreementId: string,
): Promise<string> {
  return callContract({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "trigger-arb-timeout",
    functionArgs: [stringAsciiCV(agreementId)],
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
}
