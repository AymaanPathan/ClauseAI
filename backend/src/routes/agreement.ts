// ============================================================
// src/routes/agreement.ts  (add to your Express backend)
// Lightweight presence store for counterparty sync.
// In production, replace the in-memory Map with Redis.
// ============================================================

import { Router, Request, Response } from "express";

const router = Router();

// ── In-memory store ───────────────────────────────────────────
const store = new Map<
  string,
  {
    partyA: string | null;
    partyB: string | null;
    partyAJoinedAt: number | null;
    partyBJoinedAt: number | null;
    termsHash: string | null;
  }
>();

function getOrCreate(id: string) {
  if (!store.has(id)) {
    store.set(id, {
      partyA: null,
      partyB: null,
      partyAJoinedAt: null,
      partyBJoinedAt: null,
      termsHash: null,
    });
  }
  return store.get(id)!;
}

// GET /api/agreement/:id — poll for current presence state
router.get("/:id", (req: Request, res: Response) => {
  const entry = store.get(req.params.id);
  if (!entry) {
    return res.json({ partyA: null, partyB: null, bothConnected: false });
  }
  res.json({ ...entry, bothConnected: !!entry.partyA && !!entry.partyB });
});

// POST /api/agreement/:id — register a party's wallet address
// Body: { role: "partyA" | "partyB", address: string, termsHash?: string }
router.post("/:id", (req: Request, res: Response) => {
  const { role, address, termsHash } = req.body as {
    role: "partyA" | "partyB";
    address: string;
    termsHash?: string;
  };

  if (!role || !address) {
    return res.status(400).json({ error: "role and address required" });
  }

  const entry = getOrCreate(req.params.id);

  if (role === "partyA") {
    entry.partyA = address;
    entry.partyAJoinedAt = Date.now();
    if (termsHash) entry.termsHash = termsHash;
  } else {
    entry.partyB = address;
    entry.partyBJoinedAt = Date.now();
  }

  store.set(req.params.id, entry);

  res.json({ ...entry, bothConnected: !!entry.partyA && !!entry.partyB });
});

// DELETE /api/agreement/:id — clean up
router.delete("/:id", (req: Request, res: Response) => {
  store.delete(req.params.id);
  res.json({ deleted: true });
});

export default router;
