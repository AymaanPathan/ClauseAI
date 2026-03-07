// ============================================================
// api/approvalApi.ts
// Handles per-party agreement approval.
// Mirrors the pattern of PresenceaApi.ts.
// ============================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

// ── Types ─────────────────────────────────────────────────────

export interface ApprovalState {
  partyA: string | null;
  partyB: string | null;
  partyAApproved: boolean;
  partyBApproved: boolean;
  bothConnected: boolean;
  termsSnapshot: Record<string, unknown> | null;
}

// ── REST ──────────────────────────────────────────────────────

/**
 * Record this party's approval for an agreement.
 * Returns the full updated approval state.
 */
export async function approveAgreement(
  agreementId: string,
  role: "partyA" | "partyB",
  address: string,
): Promise<ApprovalState> {
  const res = await fetch(`${API_BASE}/agreement/${agreementId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, address }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Approval failed: ${res.status}`);
  }
  return res.json();
}

/**
 * One-shot poll of current approval state.
 * Reuses the presence GET endpoint — approval flags are included.
 */
export async function getApprovalState(
  agreementId: string,
): Promise<ApprovalState> {
  const res = await fetch(`${API_BASE}/agreement/${agreementId}`);
  if (!res.ok) {
    throw new Error(`Approval state fetch failed: ${res.status}`);
  }
  return res.json();
}

// ── SSE subscription ──────────────────────────────────────────

/**
 * Subscribe to real-time approval updates via Server-Sent Events.
 * Shares the same SSE stream as presence (same endpoint).
 *
 * @param agreementId  The agreement to watch
 * @param onUpdate     Called with fresh ApprovalState on every event
 * @param onError      Called on connection errors (auto-reconnects)
 * @returns            Unsubscribe function
 *
 * @example
 * const unsub = subscribeApproval(id, (s) => dispatch(approvalUpdated(s)));
 * // later:
 * unsub();
 */
export function subscribeApproval(
  agreementId: string,
  onUpdate: (state: ApprovalState) => void,
  onError?: (err: Event) => void,
): () => void {
  let es: EventSource | null = null;
  let closed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = 2_000;

  function connect() {
    if (closed) return;

    es = new EventSource(`${API_BASE}/agreement/${agreementId}/events`);

    es.onmessage = (event) => {
      retryDelay = 2_000; // reset backoff on successful message
      try {
        const data = JSON.parse(event.data) as ApprovalState;
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
        retryTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 30_000);
          connect();
        }, retryDelay);
      }
    };
  }

  connect();

  return () => {
    closed = true;
    if (retryTimer !== null) clearTimeout(retryTimer);
    es?.close();
    es = null;
  };
}
