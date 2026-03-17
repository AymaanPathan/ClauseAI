// ============================================================
// BACKEND PATCH — routes/agreement.ts
// The only change is in the /milestone POST handler:
// ① milestone:updated now includes fundState in its payload
// ② join:agreement ack now returns full milestone data from DB
//    (not just presence store) so reconnects get full state
//
// Everything else in the file stays identical to your existing code.
// ============================================================

// ── POST /api/agreement/:id/milestone — update milestone status ──
// Replace the milestonePayload block inside this route with:

/*

    const milestonePayload = {
      agreementId: req.params.id,
      milestoneIndex,
      action,
      txId,
      txUrl,
      status: targetStatus,
      txVerified: txInfo.status,
      blockHeight: txInfo.blockHeight,
      blockTime: txInfo.blockTime,
      allComplete,
      // ← ADD fundState so clients can update without a REST round-trip
      fundState: agreement.fundState,
      milestones: agreement.milestones,
    };

*/

// ── src/index.ts — join:agreement ack ────────────────────────
// Replace the join:agreement socket handler with the version below.
// Key change: the ack now returns FULL DB state including milestones
// (the original only returned presenceEntry which has no milestones).

/*

  socket.on("join:agreement", async (agreementId: string, ack?: Function) => {
    if (!agreementId || typeof agreementId !== "string") return;

    socket.join(`agreement:${agreementId}`);
    console.log(`[socket.io] ${socket.id} joined agreement:${agreementId}`);

    if (typeof ack !== "function") return;

    try {
      // Query MongoDB for full agreement state (includes milestones)
      const agreement = await Agreement.findOne({ agreementId }).lean();
      if (agreement) {
        ack({
          agreementId,
          milestones: (agreement as any).milestones ?? [],
          fundState: (agreement as any).fundState ?? "idle",
          fundsLocked:
            (agreement as any).fundState === "locked" ||
            (agreement as any).fundsLocked,
          amountLocked: (agreement as any).amountLocked ?? null,
          partyA: (agreement as any).partyA ?? null,
          partyB: (agreement as any).partyBWallet ?? (agreement as any).partyB ?? null,
          partyAApproved: (agreement as any).partyAApproved ?? false,
          partyBApproved: (agreement as any).partyBApproved ?? false,
          totalAmountUsd: (agreement as any).totalAmountUsd ?? 0,
          totalAmountSats: (agreement as any).totalAmountSats ?? 0,
          arbitrator: (agreement as any).arbitrator ?? null,
          terms: (agreement as any).terms ?? null,
        });
      } else {
        ack(null);
      }
    } catch (err) {
      console.error("[socket.io] join:agreement ack error:", err);
      ack(null);
    }
  });

*/

// ── FULL updated agreement.ts (routes/agreement.ts) ──────────
// Copy this entire file to replace your current routes/agreement.ts

import { Router, Request, Response } from "express";
import { Server as SocketIOServer } from "socket.io";
import { getRedisClient, isRedisAvailable } from "../lib/redis";
import Agreement from "../models/Agreement";

const router = Router();
const PRESENCE_TTL_SECONDS = 60 * 60 * 24;

let _io: SocketIOServer | null = null;
export function setSocketIO(io: SocketIOServer) {
  _io = io;
}
function emit(agreementId: string, event: string, data: unknown) {
  _io?.to(`agreement:${agreementId}`).emit(event, data);
}

const STACKS_API =
  process.env.STACKS_NETWORK === "mainnet"
    ? "https://api.mainnet.hiro.so"
    : "https://api.testnet.hiro.so";

async function verifyStacksTx(txId: string): Promise<{
  status: "success" | "pending" | "failed";
  blockHeight?: number;
  blockTime?: number;
}> {
  try {
    const res = await fetch(`${STACKS_API}/extended/v1/tx/${txId}`);
    if (!res.ok) return { status: "pending" };
    const data: any = await res.json();
    const s = data.tx_status;
    if (s === "success") {
      return {
        status: "success",
        blockHeight: data.block_height,
        blockTime: data.block_time,
      };
    }
    if (s === "abort_by_response" || s === "abort_by_post_condition") {
      return { status: "failed" };
    }
    return { status: "pending" };
  } catch {
    return { status: "pending" };
  }
}

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
  fundsLocked: boolean;
  fundState: "idle" | "locked" | "released" | "refunded" | "disputed";
  amountLocked: string | null;
  depositTxId: string | null;
}

export interface PresenceResponse extends PresenceEntry {
  bothConnected: boolean;
}

async function readPresence(id: string): Promise<PresenceEntry | null> {
  if (isRedisAvailable()) {
    const redis = getRedisClient();
    const raw = await redis.get(`presence:${id}`);
    if (!raw) return null;
    const p = JSON.parse(raw) as PresenceEntry;
    p.partyAApproved ??= false;
    p.partyBApproved ??= false;
    p.fundsLocked ??= false;
    p.fundState ??= "idle";
    p.amountLocked ??= null;
    p.depositTxId ??= null;
    return p;
  }
  const entry = memStore.get(id) ?? null;
  if (entry) {
    entry.partyAApproved ??= false;
    entry.partyBApproved ??= false;
    entry.fundsLocked ??= false;
    entry.fundState ??= "idle";
    entry.amountLocked ??= null;
    entry.depositTxId ??= null;
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
    fundsLocked: entry.fundsLocked ?? false,
    fundState: entry.fundState ?? "idle",
    amountLocked: entry.amountLocked ?? null,
    depositTxId: entry.depositTxId ?? null,
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
  fundsLocked: false,
  fundState: "idle",
  amountLocked: null,
  depositTxId: null,
});

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

router.post("/:id/partyb-wallet", async (req: Request, res: Response) => {
  const { walletAddress } = req.body as { walletAddress?: string };
  if (!walletAddress || typeof walletAddress !== "string") {
    return res.status(400).json({ error: "walletAddress is required" });
  }
  try {
    await Agreement.findOneAndUpdate(
      { agreementId: req.params.id },
      { partyBWallet: walletAddress, partyBApproved: true },
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[partyb-wallet]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  const { partyA, partyB } = req.query as { partyA?: string; partyB?: string };
  if (!partyA && !partyB) {
    return res
      .status(400)
      .json({ error: "partyA or partyB query param required" });
  }
  try {
    const query: Record<string, unknown> = {};
    if (partyA)
      query.partyA = {
        $regex: new RegExp(
          `^${partyA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i",
        ),
      };
    if (partyB)
      query.partyB = {
        $regex: new RegExp(
          `^${partyB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i",
        ),
      };
    const agreements = await Agreement.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(agreements);
  } catch (err) {
    console.error("[GET /api/agreement]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

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

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const entry = await readPresence(req.params.id);
    res.json(makeResponse(entry ?? EMPTY_ENTRY()));
  } catch (err) {
    console.error("[agreement GET]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/status", async (req: Request, res: Response) => {
  try {
    const entry = await readPresence(req.params.id);
    if (!entry) return res.status(404).json({ error: "Agreement not found" });
    res.json({
      fundState: entry.fundState ?? "idle",
      fundsLocked: entry.fundsLocked ?? false,
      amountLocked: entry.amountLocked ?? null,
      depositTxId: entry.depositTxId ?? null,
    });
  } catch (err) {
    console.error("[agreement GET /status]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/milestones", async (req: Request, res: Response) => {
  try {
    const agreement = await Agreement.findOne({ agreementId: req.params.id });
    if (!agreement)
      return res.status(404).json({ error: "Agreement not found" });
    res.json({
      agreementId: agreement.agreementId,
      milestones: agreement.milestones,
      fundState: agreement.fundState,
      totalAmountUsd: agreement.totalAmountUsd,
      totalAmountSats: agreement.totalAmountSats,
      partyA: agreement.partyA,
      partyB: agreement.partyB,
      partyBWallet: agreement.partyBWallet,
      arbitrator: agreement.arbitrator,
      amountLocked: agreement.amountLocked,
      terms: agreement.terms,
      createdAt: agreement.createdAt,
    });
  } catch (err) {
    console.error("[agreement GET /milestones]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/create", async (req: Request, res: Response) => {
  const {
    partyA,
    partyB,
    arbitrator,
    totalAmountUsd,
    totalAmountSats,
    terms,
    milestones,
    onChainCreateTxId,
  } = req.body as {
    partyA?: string;
    partyB?: string;
    arbitrator?: string;
    totalAmountUsd?: number;
    totalAmountSats?: number;
    terms?: Record<string, unknown>;
    milestones?: Array<{
      index: number;
      title: string;
      percentage: number;
      condition: string;
      deadline?: string;
      deadline_dt?: string;
      amountUsd: string;
      amountSats: number;
    }>;
    onChainCreateTxId?: string;
  };
  try {
    const normalizedMilestones = (milestones ?? []).map((ms) => ({
      index: ms.index,
      title: ms.title,
      percentage: ms.percentage,
      condition: ms.condition,
      deadline: ms.deadline ?? "",
      deadline_dt: ms.deadline_dt ?? "",
      amountUsd: ms.amountUsd,
      amountSats: ms.amountSats,
      status: "locked" as const,
      txId: null,
      txUrl: null,
      completedAt: null,
      disputedAt: null,
    }));
    const agreement = await Agreement.findOneAndUpdate(
      { agreementId: req.params.id },
      {
        $set: {
          ...(partyA && { partyA }),
          ...(partyB && { partyB }),
          ...(arbitrator && { arbitrator }),
          ...(totalAmountUsd !== undefined && { totalAmountUsd }),
          ...(totalAmountSats !== undefined && { totalAmountSats }),
          ...(terms && Object.keys(terms).length > 0 && { terms }),
          ...(normalizedMilestones.length > 0 && {
            milestones: normalizedMilestones,
          }),
          ...(onChainCreateTxId && { onChainCreateTxId }),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    emit(req.params.id, "funds:locked", {
      agreementId: req.params.id,
      milestones: agreement.milestones,
    });
    res.json({ ok: true, agreementId: req.params.id });
  } catch (err) {
    console.error("[agreement POST /create]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/agreement/:id/milestone ────────────────────────
// KEY CHANGE: milestonePayload now includes fundState
router.post("/:id/milestone", async (req: Request, res: Response) => {
  const { milestoneIndex, action, txId, txUrl, callerAddress } = req.body as {
    milestoneIndex: number;
    action: "complete" | "dispute" | "timeout";
    txId: string;
    txUrl?: string;
    callerAddress?: string;
  };

  if (milestoneIndex === undefined || !action || !txId) {
    return res
      .status(400)
      .json({ error: "milestoneIndex, action, and txId are required" });
  }

  try {
    const txInfo = await verifyStacksTx(txId);

    const targetStatus = (() => {
      if (txInfo.status === "failed") return "failed";
      if (action === "complete")
        return txInfo.status === "success" ? "complete" : "pending";
      if (action === "dispute")
        return txInfo.status === "success" ? "disputed" : "pending";
      if (action === "timeout")
        return txInfo.status === "success" ? "refunded" : "pending";
      return "pending";
    })() as "complete" | "disputed" | "refunded" | "failed" | "pending";

    const agreement = await Agreement.findOne({ agreementId: req.params.id });
    if (!agreement) {
      return res
        .status(404)
        .json({ error: "Agreement not found in DB. Call /create first." });
    }

    const ms = agreement.milestones.find(
      (m: { index: number }) => m.index === milestoneIndex,
    );

    if (!ms) {
      return res
        .status(404)
        .json({ error: `Milestone ${milestoneIndex} not found` });
    }

    if (
      action === "dispute" &&
      (ms.status === "complete" || ms.status === "refunded")
    ) {
      return res
        .status(409)
        .json({ error: "Cannot dispute an already settled milestone" });
    }

    ms.status = targetStatus;
    ms.txId = txId;
    ms.txUrl = txUrl ?? null;
    ms.onChainStatus = txInfo.status === "success" ? 2 : undefined;
    if (targetStatus === "complete") ms.completedAt = new Date();
    if (targetStatus === "disputed") ms.disputedAt = new Date();

    const allComplete = agreement.milestones.every((m: { status: string }) =>
      ["complete", "refunded"].includes(m.status),
    );
    if (allComplete) agreement.fundState = "released";

    await agreement.save();

    // ← KEY FIX: include fundState in the socket payload
    const milestonePayload = {
      agreementId: req.params.id,
      milestoneIndex,
      action,
      txId,
      txUrl,
      status: targetStatus,
      txVerified: txInfo.status,
      blockHeight: txInfo.blockHeight,
      blockTime: txInfo.blockTime,
      allComplete,
      fundState: agreement.fundState, // ← ADDED
      milestones: agreement.milestones, // full array — clients replace their state
    };

    emit(req.params.id, "milestone:updated", milestonePayload);
    console.log(
      `[agreement /milestone] #${req.params.id} ms[${milestoneIndex}] → ${targetStatus} tx:${txId}`,
    );

    res.json({ ok: true, ...milestonePayload });
  } catch (err) {
    console.error("[agreement POST /milestone]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/status", async (req: Request, res: Response) => {
  const { fundState, fundsLocked, amountLocked, txId } = req.body as {
    fundState?: string;
    fundsLocked?: boolean;
    amountLocked?: string;
    txId?: string;
  };
  if (fundsLocked !== true && fundState !== "locked") {
    return res
      .status(400)
      .json({ error: "fundsLocked must be true or fundState must be locked" });
  }
  try {
    const entry = await readPresence(req.params.id);
    if (!entry) return res.status(404).json({ error: "Agreement not found" });
    entry.fundsLocked = true;
    entry.fundState = "locked";
    if (amountLocked) entry.amountLocked = amountLocked;
    if (txId) entry.depositTxId = txId;
    await writePresence(req.params.id, entry);
    await Agreement.findOneAndUpdate(
      { agreementId: req.params.id },
      {
        fundsLocked: true,
        fundState: "locked",
        ...(amountLocked && { amountLocked }),
        ...(txId && { depositTxId: txId }),
      },
    );
    const response = makeResponse(entry);
    notifySSE(req.params.id, response);
    emit(req.params.id, "funds:locked", {
      agreementId: req.params.id,
      amountLocked,
      txId,
    });
    res.json(response);
  } catch (err) {
    console.error("[agreement POST /status]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

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
    await Agreement.findOneAndUpdate(
      { agreementId: req.params.id },
      {
        ...(role === "partyA" && { partyA: address }),
        ...(role === "partyB" && { partyB: address }),
        ...(termsSnapshot && { terms: termsSnapshot }),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const response = makeResponse(entry);
    notifySSE(req.params.id, response);
    emit(req.params.id, "presence:updated", response);
    res.json(response);
  } catch (err) {
    console.error("[agreement POST]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

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
    if (!entry) return res.status(404).json({ error: "Agreement not found" });
    if (role === "partyA" && entry.partyA && entry.partyA !== address) {
      return res.status(403).json({ error: "Address does not match Party A" });
    }
    if (role === "partyB" && entry.partyB && entry.partyB !== address) {
      return res.status(403).json({ error: "Address does not match Party B" });
    }
    if (role === "partyA") entry.partyAApproved = true;
    else entry.partyBApproved = true;
    await writePresence(req.params.id, entry);
    await Agreement.findOneAndUpdate(
      { agreementId: req.params.id },
      {
        ...(role === "partyA" && { partyAApproved: true }),
        ...(role === "partyB" && { partyBApproved: true }),
      },
    );
    const response = makeResponse(entry);
    notifySSE(req.params.id, response);
    emit(req.params.id, "approval:updated", response);
    res.json(response);
  } catch (err) {
    console.error("[agreement /approve]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await deletePresenceStore(req.params.id);
    notifySSE(req.params.id, makeResponse(EMPTY_ENTRY()));
    emit(req.params.id, "agreement:deleted", { agreementId: req.params.id });
    res.json({ deleted: true });
  } catch (err) {
    console.error("[agreement DELETE]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
