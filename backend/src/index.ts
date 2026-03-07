// ============================================================
// src/server.ts — Updated with MongoDB + Arbitration route
// ============================================================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import parseRouter from "./routes/parse";
import agreementRouter from "./routes/agreement";
import arbitrateRouter from "./routes/arbitrate";
import { initRedis } from "./lib/redis";
import { connectMongoDB } from "./lib/db";

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" })); // larger limit for base64 evidence

// ── Routes ────────────────────────────────────────────────────
app.use("/api/parse", parseRouter);
app.use("/api/agreement", agreementRouter);
app.use("/api/arbitrate", arbitrateRouter); // ← NEW

// ── Root health check ─────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "ClauseAi Backend",
    routes: ["/api/parse", "/api/agreement", "/api/arbitrate"],
  });
});

// ── Startup ───────────────────────────────────────────────────
async function start() {
  // Redis (presence store — existing)
  await initRedis();

  // MongoDB (disputes — new)
  await connectMongoDB();

  app.listen(PORT, () => {
    console.log(`✅ ClauseAi backend running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
