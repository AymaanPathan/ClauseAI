// ============================================================
// lib/presenceApi.ts
// ============================================================

import axiosInstance from "@/lib/axiosSetup";

export interface PresenceState {
  partyA: string | null; // Payer address
  partyB: string | null; // Receiver address
  partyAJoinedAt: number | null;
  partyBJoinedAt: number | null;
  termsHash: string | null;
  termsSnapshot: Record<string, unknown> | null;
  bothConnected: boolean;
  createdAt: number | null;
}

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

export async function getPresence(agreementId: string): Promise<PresenceState> {
  const { data } = await axiosInstance.get<PresenceState>(
    `/api/agreement/${agreementId}`,
  );
  return data;
}

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

  if (typeof EventSource !== "undefined") {
    startSSE();
  } else {
    startPollingFallback();
  }

  return () => {
    closed = true;
    es?.close();
    if (pollFallback) clearInterval(pollFallback);
  };
}

export async function deletePresence(agreementId: string): Promise<void> {
  await axiosInstance.delete(`/api/agreement/${agreementId}`);
}

export function hashTerms(terms: object): string {
  const str = JSON.stringify(terms, Object.keys(terms).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
