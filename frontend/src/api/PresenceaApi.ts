// ============================================================
// lib/presenceApi.ts
// All calls go to Express backend via axiosInstance.
// NEXT_PUBLIC_BACKEND_URL must point to your backend (e.g. http://localhost:3001)
// ============================================================

import axiosInstance from "@/lib/axiosSetup";

export interface PresenceState {
  partyA: string | null;
  partyB: string | null;
  partyAJoinedAt: number | null;
  partyBJoinedAt: number | null;
  termsHash: string | null;
  bothConnected: boolean;
}

// ── Register yourself as a party ─────────────────────────────
export async function registerParty(
  agreementId: string,
  role: "partyA" | "partyB",
  address: string,
  termsHash?: string,
): Promise<PresenceState> {
  const { data } = await axiosInstance.post<PresenceState>(
    `/api/agreement/${agreementId}`,
    { role, address, termsHash },
  );
  return data;
}

// ── Poll for current presence state ──────────────────────────
export async function getPresence(agreementId: string): Promise<PresenceState> {
  const { data } = await axiosInstance.get<PresenceState>(
    `/api/agreement/${agreementId}`,
  );
  return data;
}

// ── Delete agreement presence (cleanup) ──────────────────────
export async function deletePresence(agreementId: string): Promise<void> {
  await axiosInstance.delete(`/api/agreement/${agreementId}`);
}

// ── Simple hash of terms for verification ────────────────────
export function hashTerms(terms: object): string {
  const str = JSON.stringify(terms, Object.keys(terms).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
