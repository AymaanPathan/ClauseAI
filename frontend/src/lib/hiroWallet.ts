// ============================================================
// lib/hiroWallet.ts
// Leather wallet connect using SIP-030 request API
// ============================================================

import { request } from "@stacks/connect";

export interface WalletUser {
  address: string;
  mainnetAddress: string;
}

export async function connectHiroWallet(): Promise<WalletUser> {
  const response = await request("getAddresses");

  const addresses = response?.addresses;
  if (!addresses || addresses.length === 0) {
    throw new Error("Wallet returned no addresses");
  }

  const stxEntry = addresses.find(
    (a: { symbol?: string; address: string }) => a.symbol === "STX",
  );

  if (!stxEntry) throw new Error("No STX address found in wallet");

  const user: WalletUser = {
    address: stxEntry.address,
    mainnetAddress: stxEntry.address.startsWith("SP") ? stxEntry.address : "",
  };

  if (typeof window !== "undefined") {
    localStorage.setItem("clauseai_wallet_address", user.address);
    localStorage.setItem("clauseai_wallet_mainnet", user.mainnetAddress);
  }

  return user;
}

export function isWalletConnected(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("clauseai_wallet_address");
}

export function getConnectedUser(): WalletUser | null {
  if (typeof window === "undefined") return null;
  const address = localStorage.getItem("clauseai_wallet_address");
  if (!address) return null;
  return {
    address,
    mainnetAddress: localStorage.getItem("clauseai_wallet_mainnet") ?? "",
  };
}

export function saveWalletSession(user: WalletUser): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("clauseai_wallet_address", user.address);
  localStorage.setItem("clauseai_wallet_mainnet", user.mainnetAddress);
}

export function disconnectHiroWallet(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("clauseai_wallet_address");
  localStorage.removeItem("clauseai_wallet_mainnet");
}
