// ============================================================
// lib/presenceApi.ts — PRODUCTION UPDATE
// Adds SSE subscription on top of HTTP poll fallback.
// NEXT_PUBLIC_BACKEND_URL must point to your backend.
// ============================================================

import axiosInstance from "@/lib/axiosSetup";

export interface PresenceState {
  partyA: string | null;
  partyB: string | null;
  partyAJoinedAt: number | null;
  partyBJoinedAt: number | null;
  termsHash: string | null;
  termsSnapshot: Record<string, unknown> | null;
  bothConnected: boolean;
  createdAt: number | null;
}

// ── Register yourself as a party ─────────────────────────────
export async function registerParty(
  agreementId: string,
  role: "partyA" | "partyB",
  address: string,
  termsHash?: string,
  termsSnapshot?: Record<string, unknown>,
): Promise<PresenceState> {
  const { data } = await axiosInstance.post<PresenceState>(
    `/api/agreement/${agreementId}`,
    { role, address, termsHash, termsSnapshot },
  );
  return data;
}

// ── Poll for current presence state (HTTP fallback) ───────────
export async function getPresence(agreementId: string): Promise<PresenceState> {
  const { data } = await axiosInstance.get<PresenceState>(
    `/api/agreement/${agreementId}`,
  );
  return data;
}

// ── Subscribe via SSE for real-time updates ───────────────────
// Returns an unsubscribe function. Falls back to polling on error.
export function subscribePresence(
  agreementId: string,
  onUpdate: (state: PresenceState) => void,
  onError?: (err: Event) => void,
): () => void {
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";
  const url = `${backendUrl}/api/agreement/${agreementId}/events`;

  let es: EventSource | null = null;
  let pollFallback: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  function startSSE() {
    try {
      es = new EventSource(url);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as PresenceState;
          onUpdate(data);
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = (err) => {
        console.warn("[SSE] Connection error — falling back to polling", err);
        onError?.(err);
        es?.close();
        es = null;
        if (!closed) startPollingFallback();
      };
    } catch {
      startPollingFallback();
    }
  }

  function startPollingFallback() {
    if (pollFallback) return;
    pollFallback = setInterval(async () => {
      if (closed) {
        clearInterval(pollFallback!);
        return;
      }
      try {
        const state = await getPresence(agreementId);
        onUpdate(state);
        // If SSE becomes available again, switch back
        if (typeof EventSource !== "undefined" && !es) {
          clearInterval(pollFallback!);
          pollFallback = null;
          startSSE();
        }
      } catch {
        // keep retrying
      }
    }, 3_000);
  }

  // Start with SSE, fall back to polling if unavailable
  if (typeof EventSource !== "undefined") {
    startSSE();
  } else {
    startPollingFallback();
  }

  // Return unsubscribe
  return () => {
    closed = true;
    es?.close();
    if (pollFallback) clearInterval(pollFallback);
  };
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
