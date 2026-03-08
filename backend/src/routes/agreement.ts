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
  termsSnapshot: Record<string, unknown> | null;
  createdAt: number | null;
  partyAApproved: boolean;
  partyBApproved: boolean;
}

export interface PresenceResponse extends PresenceEntry {
  bothConnected: boolean;
}

// ── Persistence helpers ───────────────────────────────────────

async function readPresence(id: string): Promise<PresenceEntry | null> {
  if (isRedisAvailable()) {
    const redis = getRedisClient();
    const raw = await redis.get(`presence:${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PresenceEntry;
    // Backfill approval flags for entries written before this version
    parsed.partyAApproved = parsed.partyAApproved ?? false;
    parsed.partyBApproved = parsed.partyBApproved ?? false;
    return parsed;
  }
  const entry = memStore.get(id) ?? null;
  if (entry) {
    entry.partyAApproved = entry.partyAApproved ?? false;
    entry.partyBApproved = entry.partyBApproved ?? false;
  }
  return entry;
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
    partyAApproved: entry.partyAApproved ?? false,
    partyBApproved: entry.partyBApproved ?? false,
    bothConnected: !!entry.partyA && !!entry.partyB,
  };
}

const EMPTY_ENTRY = (): PresenceEntry => ({
  partyA: null,
  partyB: null,
  partyAJoinedAt: null,
  partyBJoinedAt: null,
  termsHash: null,
  termsSnapshot: null,
  createdAt: Date.now(),
  partyAApproved: false,
  partyBApproved: false,
});

// ── SSE client registry ───────────────────────────────────────
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
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  if (!sseClients.has(id)) sseClients.set(id, new Set());
  sseClients.get(id)!.add(res);

  try {
    const entry = await readPresence(id);
    res.write(
      `data: ${JSON.stringify(makeResponse(entry ?? EMPTY_ENTRY()))}\n\n`,
    );
  } catch (err) {
    console.error("[SSE] initial state error:", err);
  }

  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.get(id)?.delete(res);
    if (sseClients.get(id)?.size === 0) sseClients.delete(id);
  });
});

// ── GET /api/agreement/:id ────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const entry = await readPresence(req.params.id);
    res.json(makeResponse(entry ?? EMPTY_ENTRY()));
  } catch (err) {
    console.error("[agreement GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/agreement/:id — register party ──────────────────
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
    if (!entry) entry = EMPTY_ENTRY();

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
    notifySSE(req.params.id, response);
    res.json(response);
  } catch (err) {
    console.error("[agreement POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/agreement/:id/approve ──────────────────────────
router.post("/:id/approve", async (req: Request, res: Response) => {
  const { role, address } = req.body as {
    role: "partyA" | "partyB";
    address: string;
  };

  if (!role || !["partyA", "partyB"].includes(role)) {
    return res.status(400).json({ error: 'role must be "partyA" or "partyB"' });
  }
  if (!address || typeof address !== "string") {
    return res.status(400).json({ error: "address is required" });
  }

  try {
    const entry = await readPresence(req.params.id);
    if (!entry) {
      return res.status(404).json({ error: "Agreement not found" });
    }

    if (role === "partyA" && entry.partyA && entry.partyA !== address) {
      return res.status(403).json({ error: "Address does not match Party A" });
    }
    if (role === "partyB" && entry.partyB && entry.partyB !== address) {
      return res.status(403).json({ error: "Address does not match Party B" });
    }

    if (role === "partyA") entry.partyAApproved = true;
    else entry.partyBApproved = true;

    await writePresence(req.params.id, entry);
    const response = makeResponse(entry);
    notifySSE(req.params.id, response);
    res.json(response);
  } catch (err) {
    console.error("[agreement /approve]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/agreement/:id ─────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await deletePresenceStore(req.params.id);
    notifySSE(req.params.id, makeResponse(EMPTY_ENTRY()));
    res.json({ deleted: true });
  } catch (err) {
    console.error("[agreement DELETE]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
