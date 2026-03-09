  // ============================================================
  // lib/stacksConfig.ts
  // ============================================================

  import { STACKS_TESTNET, STACKS_MAINNET } from "@stacks/network";

  // ── Network ───────────────────────────────────────────────────
  export const NETWORK_NAME: "testnet" | "mainnet" = "testnet";

  export const STACKS_NETWORK =
    NETWORK_NAME === ("mainnet" as any) ? STACKS_MAINNET : STACKS_TESTNET;

  // ── Deployed escrow contract ──────────────────────────────────
  export const CONTRACT_ADDRESS = "ST2BRZZ2514G61W0VVHAXC4ZHCWPS897Z030TXWEY";
  export const CONTRACT_NAME = "clauseai-escrow-v3";
  export const CONTRACT_PRINCIPAL =
    `${CONTRACT_ADDRESS}.${CONTRACT_NAME}` as const;

  // ── sBTC token contract (testnet) ─────────────────────────────
  export const SBTC_CONTRACT_ADDRESS =
    "ST17RSQ4ZNZP43FE1HW30KQZHJKBM6XCRMB8NR7C9";

  export const SBTC_CONTRACT_NAME = "sbtc-token";

  // Full principal used in Pc post condition builder
  export const SBTC_CONTRACT_PRINCIPAL =
    `${SBTC_CONTRACT_ADDRESS}.${SBTC_CONTRACT_NAME}` as const;

  // Asset name as defined in the SIP-010 contract
  export const SBTC_ASSET_NAME = "sbtc";

  // ── sBTC unit constants ───────────────────────────────────────
  export const SATOSHIS_PER_BTC = 100_000_000;

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

  // ── Display helpers ───────────────────────────────────────────

  /**
   * Format satoshis for human-readable display.
   * e.g. 100000 → "0.00100000 sBTC"
   */
  export function formatSats(sats: number): string {
    const btc = sats / SATOSHIS_PER_BTC;
    return `${btc.toFixed(8)} sBTC`;
  }
