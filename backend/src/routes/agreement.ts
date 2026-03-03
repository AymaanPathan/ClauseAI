// ============================================================
// src/routes/agreement.ts — PRODUCTION
// Redis-backed presence store + SSE real-time push.
// Falls back to in-memory if Redis unavailable (dev mode).
// ============================================================

import { Router, Request, Response } from "express";
import { getRedisClient, isRedisAvailable } from "../lib/redis";

const router = Router();
const PRESENCE_TTL_SECONDS = 60 * 60 * 24; // 24h TTL per agreement

// ── In-memory fallback (dev / Redis-down) ─────────────────────
const memStore = new Map<string, PresenceEntry>();

export interface PresenceEntry {
  partyA: string | null;
  partyB: string | null;
  partyAJoinedAt: number | null;
  partyBJoinedAt: number | null;
  termsHash: string | null;
  termsSnapshot: Record<string, unknown> | null; // Party A's parsed terms
  createdAt: number | null;
}

export interface PresenceResponse extends PresenceEntry {
  bothConnected: boolean;
}

// ── Persistence helpers ───────────────────────────────────────

async function readPresence(id: string): Promise<PresenceEntry | null> {
  if (isRedisAvailable()) {
    const redis = getRedisClient();
    const raw = await redis.get(`presence:${id}`);
    return raw ? (JSON.parse(raw) as PresenceEntry) : null;
  }
  return memStore.get(id) ?? null;
}

async function writePresence(id: string, entry: PresenceEntry): Promise<void> {
  if (isRedisAvailable()) {
    const redis = getRedisClient();
    await redis.setEx(
      `presence:${id}`,
      PRESENCE_TTL_SECONDS,
      JSON.stringify(entry),
    );
  } else {
    memStore.set(id, entry);
  }
}

async function deletePresenceStore(id: string): Promise<void> {
  if (isRedisAvailable()) {
    const redis = getRedisClient();
    await redis.del(`presence:${id}`);
  } else {
    memStore.delete(id);
  }
}

function makeResponse(entry: PresenceEntry): PresenceResponse {
  return {
    ...entry,
    bothConnected: !!entry.partyA && !!entry.partyB,
  };
}

// ── SSE client registry ───────────────────────────────────────
// Maps agreementId → Set of SSE response objects
const sseClients = new Map<string, Set<Response>>();

function notifySSE(id: string, data: PresenceResponse) {
  const clients = sseClients.get(id);
  if (!clients || clients.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

// ── GET /api/agreement/:id/events — SSE stream ────────────────
router.get("/:id/events", async (req: Request, res: Response) => {
  const { id } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // nginx passthrough
  res.flushHeaders();

  // Register client
  if (!sseClients.has(id)) sseClients.set(id, new Set());
  sseClients.get(id)!.add(res);

  // Send current state immediately on connect
  try {
    const entry = await readPresence(id);
    if (entry) {
      res.write(`data: ${JSON.stringify(makeResponse(entry))}\n\n`);
    } else {
      const empty: PresenceResponse = {
        partyA: null,
        partyB: null,
        partyAJoinedAt: null,
        partyBJoinedAt: null,
        termsHash: null,
        termsSnapshot: null,
        createdAt: Date.now(),
        bothConnected: false,
      };
      res.write(`data: ${JSON.stringify(empty)}\n\n`);
    }
  } catch (err) {
    console.error("[SSE] initial state error:", err);
  }

  // Heartbeat every 25s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 25_000);

  // Cleanup on disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.get(id)?.delete(res);
    if (sseClients.get(id)?.size === 0) sseClients.delete(id);
  });
});

// ── GET /api/agreement/:id — poll (fallback / initial load) ───
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const entry = await readPresence(req.params.id);
    if (!entry) {
      return res.json({
        partyA: null,
        partyB: null,
        partyAJoinedAt: null,
        partyBJoinedAt: null,
        termsHash: null,
        termsSnapshot: null,
        bothConnected: false,
        createdAt: null,
      } satisfies PresenceResponse);
    }
    res.json(makeResponse(entry));
  } catch (err) {
    console.error("[agreement GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/agreement/:id — register party ─────────────────
// Body: { role, address, termsHash?, termsSnapshot? }
router.post("/:id", async (req: Request, res: Response) => {
  const { role, address, termsHash, termsSnapshot } = req.body as {
    role: "partyA" | "partyB";
    address: string;
    termsHash?: string;
    termsSnapshot?: Record<string, unknown>;
  };

  if (!role || !["partyA", "partyB"].includes(role)) {
    return res.status(400).json({ error: 'role must be "partyA" or "partyB"' });
  }
  if (!address || typeof address !== "string") {
    return res.status(400).json({ error: "address is required" });
  }

  try {
    let entry = await readPresence(req.params.id);
    if (!entry) {
      entry = {
        partyA: null,
        partyB: null,
        partyAJoinedAt: null,
        partyBJoinedAt: null,
        termsHash: null,
        termsSnapshot: null,
        createdAt: Date.now(),
      };
    }

    if (role === "partyA") {
      entry.partyA = address;
      entry.partyAJoinedAt = Date.now();
      if (termsHash) entry.termsHash = termsHash;
      if (termsSnapshot) entry.termsSnapshot = termsSnapshot;
    } else {
      entry.partyB = address;
      entry.partyBJoinedAt = Date.now();
    }

    await writePresence(req.params.id, entry);

    const response = makeResponse(entry);

    // Push to any SSE listeners immediately
    notifySSE(req.params.id, response);

    res.json(response);
  } catch (err) {
    console.error("[agreement POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/agreement/:id — cleanup ───────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await deletePresenceStore(req.params.id);
    notifySSE(req.params.id, {
      partyA: null,
      partyB: null,
      partyAJoinedAt: null,
      partyBJoinedAt: null,
      termsHash: null,
      termsSnapshot: null,
      createdAt: Date.now(),
      bothConnected: false,
    });
    res.json({ deleted: true });
  } catch (err) {
    console.error("[agreement DELETE]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
