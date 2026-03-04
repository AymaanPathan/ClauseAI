// ============================================================
// lib/hiroWallet.ts — FIXED
// ============================================================

import { request } from "@stacks/connect";
import { NETWORK_NAME } from "./stacksConfig";

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

  console.log("[hiroWallet] All addresses returned:", addresses);

  // ★ FIX: pick address based on current network
  // testnet → ST... address
  // mainnet → SP... address
  const expectedPrefix = NETWORK_NAME === "mainnet" ? "SP" : "ST";

  const stxEntry = addresses.find(
    (a: { symbol?: string; address: string }) =>
      a.symbol === "STX" && a.address.startsWith(expectedPrefix),
  );

  // Fallback: any STX address if prefix match fails
  const fallbackEntry = addresses.find(
    (a: { symbol?: string; address: string }) => a.symbol === "STX",
  );

  const chosen = stxEntry ?? fallbackEntry;

  if (!chosen) throw new Error("No STX address found in wallet");

  console.log("[hiroWallet] Using address:", chosen.address);

  // Warn if wrong network
  if (NETWORK_NAME === "testnet" && chosen.address.startsWith("SP")) {
    console.warn(
      "[hiroWallet] ⚠️ Got mainnet SP address on testnet config.",
      "Make sure Leather is switched to Testnet4.",
    );
  }

  const mainnetEntry = addresses.find(
    (a: { symbol?: string; address: string }) =>
      a.symbol === "STX" && a.address.startsWith("SP"),
  );

  const user: WalletUser = {
    address: chosen.address,
    mainnetAddress: mainnetEntry?.address ?? "",
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
