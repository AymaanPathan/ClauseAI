// ============================================================
// lib/hiroWallet.ts
// Leather wallet connect using new SIP-030 request API
// ============================================================

import { request } from "@stacks/connect";

export interface WalletUser {
  address: string; // testnet STX address  ST...
  mainnetAddress: string; // mainnet STX address  SP...
}

// ── Connect wallet ────────────────────────────────────────────
export async function connectHiroWallet(): Promise<WalletUser> {
  const response = await request("getAddresses");

  const addresses = response?.addresses;
  if (!addresses || addresses.length === 0) {
    throw new Error("Wallet returned no addresses");
  }

  // Find the STX entry by symbol (works for both mainnet SP... and testnet ST...)
  const stxEntry = addresses.find(
    (a) => a.symbol !== undefined && a.symbol === "STX"
  );

  if (!stxEntry) throw new Error("No STX address found in wallet");

  const user: WalletUser = {
    address:        stxEntry.address,   // SP23RJ8... (your mainnet address)
    mainnetAddress: stxEntry.address,
  };

  if (typeof window !== "undefined") {
    localStorage.setItem("clauseai_wallet_address", user.address);
    localStorage.setItem("clauseai_wallet_mainnet", user.mainnetAddress);
  }

  return user;
}


// ── Is connected ──────────────────────────────────────────────
export function isWalletConnected(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("clauseai_wallet_address");
}

// ── Get connected user (from persisted session) ───────────────
export function getConnectedUser(): WalletUser | null {
  if (typeof window === "undefined") return null;
  const address = localStorage.getItem("clauseai_wallet_address");
  if (!address) return null;
  return {
    address,
    mainnetAddress: localStorage.getItem("clauseai_wallet_mainnet") ?? "",
  };
}

// ── Save session ──────────────────────────────────────────────
export function saveWalletSession(user: WalletUser): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("clauseai_wallet_address", user.address);
  localStorage.setItem("clauseai_wallet_mainnet", user.mainnetAddress);
}

// ── Disconnect ────────────────────────────────────────────────
export function disconnectHiroWallet(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("clauseai_wallet_address");
  localStorage.removeItem("clauseai_wallet_mainnet");
}
