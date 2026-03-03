// ============================================================
// lib/stacksConfig.ts
// All Stacks network + contract constants live here.
// Swap NETWORK to "mainnet" when going live.
// ============================================================

import { STACKS_TESTNET, STACKS_MAINNET } from "@stacks/network";

// ── Network ───────────────────────────────────────────────────
export const NETWORK_NAME: "testnet" | "mainnet" = "testnet";

export const STACKS_NETWORK =
  NETWORK_NAME === ("mainnet" as any) ? STACKS_MAINNET : STACKS_TESTNET;

// ── Deployed contract ─────────────────────────────────────────
// Update CONTRACT_ADDRESS after you deploy the Clarity contract
export const CONTRACT_ADDRESS = "ST2BRZZ2514G61W0VVHAXC4ZHCWPS897Z030TXWEY";
export const CONTRACT_NAME = "clauseai-escrow";

// Full principal used in contract calls
export const CONTRACT_PRINCIPAL =
  `${CONTRACT_ADDRESS}.${CONTRACT_NAME}` as const;

// ── sBTC token contract (testnet) ─────────────────────────────
export const SBTC_CONTRACT_ADDRESS =
  "ST1F7QA2MDF17S807EPA36TSS8AMEFY4KDYQ8DXJD";
export const SBTC_CONTRACT_NAME = "sbtc-token";

// ── Block explorer ────────────────────────────────────────────
export const EXPLORER_BASE =
  NETWORK_NAME === ("mainnet" as any)
    ? "https://explorer.stacks.co"
    : "https://explorer.hiro.so";

export function explorerTxUrl(txId: string) {
  return `${EXPLORER_BASE}/txid/${txId}?chain=${NETWORK_NAME}`;
}

export function explorerAddressUrl(address: string) {
  return `${EXPLORER_BASE}/address/${address}?chain=${NETWORK_NAME}`;
}

// ── STX per microSTX ─────────────────────────────────────────
export const MICRO_STX = 1_000_000;

// ── Agreement state constants (mirror Clarity contract) ───────
export const CONTRACT_STATE = {
  PENDING: 0,
  ACTIVE: 1,
  COMPLETE: 2,
  REFUNDED: 3,
  DISPUTED: 4,
} as const;

export type ContractState =
  (typeof CONTRACT_STATE)[keyof typeof CONTRACT_STATE];
