// ============================================================
// src/index.ts — Entry point (renamed from server.ts)
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
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ── Routes ────────────────────────────────────────────────────
app.use("/api/parse", parseRouter);
app.use("/api/agreement", agreementRouter);
app.use("/api/arbitrate", arbitrateRouter);

// ── Health check ──────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "ClauseAI Backend",
    version: "1.0.0",
    routes: ["/api/parse", "/api/agreement", "/api/arbitrate"],
  });
});

// ── Startup ───────────────────────────────────────────────────
async function start() {
  await initRedis();
  await connectMongoDB();

  app.listen(PORT, () => {
    console.log(`✅ ClauseAI backend running on http://localhost:${PORT}`);
    console.log(`   Routes: /api/parse  /api/agreement  /api/arbitrate`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
