// ============================================================
// api/PresenceaApi.ts  (matches the import name in your codebase)
// Handles presence registration, polling, and SSE subscription.
// ============================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

// ── Types ─────────────────────────────────────────────────────

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

// ── REST helpers ──────────────────────────────────────────────

/** Register a party (partyA or partyB) for an agreement */
export async function registerParty(
  agreementId: string,
  role: "partyA" | "partyB",
  address: string,
  termsHash?: string,
  termsSnapshot?: Record<string, unknown>,
): Promise<PresenceState> {
  const res = await fetch(`${API_BASE}/agreement/${agreementId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, address, termsHash, termsSnapshot }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Presence register failed: ${res.status}`);
  }
  return res.json();
}

/** One-shot poll of current presence state */
export async function getPresence(agreementId: string): Promise<PresenceState> {
  const res = await fetch(`${API_BASE}/agreement/${agreementId}`);
  if (!res.ok) {
    throw new Error(`Presence fetch failed: ${res.status}`);
  }
  return res.json();
}

/** Delete presence entry (cleanup) */
export async function deletePresence(agreementId: string): Promise<void> {
  await fetch(`${API_BASE}/agreement/${agreementId}`, { method: "DELETE" });
}

// ── SSE subscription ──────────────────────────────────────────

/**
 * Subscribe to real-time presence updates via Server-Sent Events.
 *
 * @param agreementId  The agreement ID to watch
 * @param onUpdate     Called with fresh PresenceState on every event
 * @param onError      Called on connection errors (non-fatal — auto-reconnects)
 * @returns            Unsubscribe function — call it to close the SSE connection
 *
 * @example
 * const unsub = subscribePresence(id, (p) => dispatch(applyPresenceUpdate(p)));
 * // later:
 * unsub();
 */
export function subscribePresence(
  agreementId: string,
  onUpdate: (state: PresenceState) => void,
  onError?: (err: Event) => void,
): () => void {
  let es: EventSource | null = null;
  let closed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = 2_000; // start at 2s, back off to 30s max

  function connect() {
    if (closed) return;

    es = new EventSource(`${API_BASE}/agreement/${agreementId}/events`);

    es.onmessage = (event) => {
      retryDelay = 2_000; // reset backoff on successful message
      try {
        const data = JSON.parse(event.data) as PresenceState;
        onUpdate(data);
      } catch {
        // malformed event — ignore
      }
    };

    es.onerror = (err) => {
      onError?.(err);
      es?.close();
      es = null;

      if (!closed) {
        // exponential backoff: 2s → 4s → 8s → … → 30s
        retryTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 30_000);
          connect();
        }, retryDelay);
      }
    };
  }

  connect();

  // Return unsubscribe function
  return () => {
    closed = true;
    if (retryTimer !== null) clearTimeout(retryTimer);
    es?.close();
    es = null;
  };
}

// ── Utility ───────────────────────────────────────────────────

/**
 * Stable hash of the parsed terms — used to detect if Party B
 * is viewing the same version of the agreement Party A created.
 */
export function hashTerms(terms: Record<string, unknown>): string {
  const stable = JSON.stringify(terms, Object.keys(terms).sort());
  let hash = 0;
  for (let i = 0; i < stable.length; i++) {
    const chr = stable.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // convert to 32-bit int
  }
  return Math.abs(hash).toString(16);
}

/**
 * Returns a human-readable "joined X ago" string.
 */
export function timeAgo(ts: number | null): string {
  if (!ts) return "just now";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
