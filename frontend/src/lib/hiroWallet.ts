// ============================================================
// lib/hiroWallet.ts
// Hiro Wallet connect / disconnect / address helpers
// ============================================================

import { AppConfig, UserSession, showConnect } from "@stacks/connect";

// ── App config ────────────────────────────────────────────────
const appConfig = new AppConfig(["store_write", "publish_data"]);
export const userSession = new UserSession({ appConfig });

export interface WalletUser {
  address: string; // STX testnet address
  mainnetAddress: string; // STX mainnet address
  publicKey: string;
}

// ── Connect wallet ────────────────────────────────────────────
export function connectHiroWallet(onSuccess: (user: WalletUser) => void): void {
  showConnect({
    appDetails: {
      name: "ClauseAi",
      icon:
        typeof window !== "undefined"
          ? `${window.location.origin}/logo.png`
          : "",
    },
    userSession,
    onFinish: () => {
      const user = getConnectedUser();
      if (user) onSuccess(user);
    },
    onCancel: () => {
      console.log("[ClauseAi] Wallet connect cancelled");
    },
  });
}

// ── Get connected user ────────────────────────────────────────
export function getConnectedUser(): WalletUser | null {
  if (!userSession.isUserSignedIn()) return null;
  const data = userSession.loadUserData();
  return {
    address: data.profile.stxAddress.testnet,
    mainnetAddress: data.profile.stxAddress.mainnet,
    publicKey: data.appPrivateKey ?? "",
  };
}

// ── Is connected ──────────────────────────────────────────────
export function isWalletConnected(): boolean {
  return userSession.isUserSignedIn();
}

// ── Disconnect ────────────────────────────────────────────────
export function disconnectHiroWallet(): void {
  userSession.signUserOut();
}
