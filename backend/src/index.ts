// ============================================================
// src/index.ts — Entry point with Socket.io for real-time sync
// ============================================================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";

import parseRouter from "./routes/parse";
import agreementRouter, { setSocketIO } from "./routes/agreement";
import arbitrateRouter from "./routes/arbitrate";
import { initRedis } from "./lib/redis";
import { connectMongoDB } from "./lib/db";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 8000;

// ── Socket.io ─────────────────────────────────────────────────
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
  },
});

// Inject io into the agreement router so it can emit events
setSocketIO(io);

io.on("connection", (socket) => {
  console.log(`[socket.io] client connected: ${socket.id}`);

  // Party B joins a room for their agreement
  socket.on("join:agreement", (agreementId: string) => {
    socket.join(`agreement:${agreementId}`);
    console.log(
      `[socket.io] ${socket.id} joined room agreement:${agreementId}`,
    );
  });

  socket.on("disconnect", () => {
    console.log(`[socket.io] client disconnected: ${socket.id}`);
  });
});

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
    version: "2.0.0",
    routes: ["/api/parse", "/api/agreement", "/api/arbitrate"],
  });
});

// ── Startup ───────────────────────────────────────────────────
async function start() {
  await initRedis();
  await connectMongoDB();

  httpServer.listen(PORT, () => {
    console.log(`✅ ClauseAI backend running on http://localhost:${PORT}`);
    console.log(`   Routes: /api/parse  /api/agreement  /api/arbitrate`);
    console.log(`   Socket.io: enabled`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
