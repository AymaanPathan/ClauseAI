// ============================================================
// src/index.ts
// ============================================================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";

import parseRouter from "./routes/parse";
import agreementRouter, { setSocketIO } from "./routes/agreement";
import arbitrateRouter, { setArbitrateSocketIO } from "./routes/arbitrate";
import { initRedis } from "./lib/redis";
import { connectMongoDB } from "./lib/db";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 8000;

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
  },
});

setSocketIO(io);
setArbitrateSocketIO(io); // ← wire socket into arbitrate router

io.on("connection", (socket) => {
  console.log(`[socket.io] client connected: ${socket.id}`);

  // Existing: agreement milestone updates
  socket.on("join:agreement", (agreementId: string) => {
    socket.join(`agreement:${agreementId}`);
    console.log(`[socket.io] ${socket.id} joined agreement:${agreementId}`);
  });

  // New: dispute statement/evidence/verdict updates
  socket.on(
    "join:dispute",
    ({
      agreementId,
      milestoneIndex,
    }: {
      agreementId: string;
      milestoneIndex: number;
    }) => {
      const room = `dispute:${agreementId}:${milestoneIndex}`;
      socket.join(room);
      console.log(`[socket.io] ${socket.id} joined ${room}`);
    },
  );

  socket.on(
    "leave:dispute",
    ({
      agreementId,
      milestoneIndex,
    }: {
      agreementId: string;
      milestoneIndex: number;
    }) => {
      socket.leave(`dispute:${agreementId}:${milestoneIndex}`);
    },
  );

  socket.on("disconnect", () => {
    console.log(`[socket.io] client disconnected: ${socket.id}`);
  });
});

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/api/parse", parseRouter);
app.use("/api/agreement", agreementRouter);
app.use("/api/arbitrate", arbitrateRouter);

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "ClauseAI Backend", version: "2.0.0" });
});

async function start() {
  await initRedis();
  await connectMongoDB();
  httpServer.listen(PORT, () => {
    console.log(`✅ ClauseAI backend on http://localhost:${PORT}`);
    console.log(`   Socket.io: agreement rooms + dispute rooms`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
