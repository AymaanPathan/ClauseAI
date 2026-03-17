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
import Agreement from "./models/Agreement";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 8000;

export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
  },
});

setSocketIO(io);
setArbitrateSocketIO(io);

const API_BASE = process.env.API_BASE_URL ?? `http://localhost:${PORT}`;

io.on("connection", (socket) => {
  console.log(`[socket.io] client connected: ${socket.id}`);

  // ── join:agreement ──────────────────────────────────────────
  // Supports optional ack callback — server sends full current state
  // immediately. Fires on initial connect AND every reconnect.
  socket.on("join:agreement", async (agreementId: string, ack?: Function) => {
    if (!agreementId || typeof agreementId !== "string") return;

    socket.join(`agreement:${agreementId}`);
    console.log(`[socket.io] ${socket.id} joined agreement:${agreementId}`);

    if (typeof ack !== "function") return;

    try {
      const agreement = await Agreement.findOne({ agreementId }).lean();
      if (agreement) {
        ack({
          agreementId,
          milestones: agreement.milestones ?? [],
          fundState: agreement.fundState ?? "idle",
          fundsLocked:
            agreement.fundState === "locked" || (agreement as any).fundsLocked,
          amountLocked: (agreement as any).amountLocked ?? null,
          partyA: agreement.partyA ?? null,
          partyB: (agreement as any).partyBWallet ?? agreement.partyB ?? null,
          partyAApproved: (agreement as any).partyAApproved ?? false,
          partyBApproved: (agreement as any).partyBApproved ?? false,
          totalAmountUsd: (agreement as any).totalAmountUsd ?? 0,
          totalAmountSats: (agreement as any).totalAmountSats ?? 0,
          arbitrator: (agreement as any).arbitrator ?? null,
          terms: (agreement as any).terms ?? null,
        });
      } else {
        // Not in DB yet (agreement still being created)
        ack(null);
      }
    } catch (err) {
      console.error("[socket.io] join:agreement ack error:", err);
      ack(null);
    }
  });

  // ── join:dispute ────────────────────────────────────────────
  // Supports optional ack callback — server sends current dispute state.
  socket.on(
    "join:dispute",
    async (
      payload: { agreementId: string; milestoneIndex: number },
      ack?: Function,
    ) => {
      if (!payload?.agreementId) return;

      const room = `dispute:${payload.agreementId}:${payload.milestoneIndex}`;
      socket.join(room);
      console.log(`[socket.io] ${socket.id} joined ${room}`);

      if (typeof ack !== "function") return;

      try {
        const res = await fetch(
          `${API_BASE}/arbitrate/${payload.agreementId}/${payload.milestoneIndex}`,
        );
        if (res.ok) {
          const data = (await res.json()) as {
            dispute?: { status: string; arbitrator_decision?: unknown } | null;
          };
          ack(
            data.dispute
              ? {
                  agreement_id: payload.agreementId,
                  milestone_index: payload.milestoneIndex,
                  status: data.dispute.status,
                  arbitrator_decision: data.dispute.arbitrator_decision ?? null,
                }
              : null,
          );
        } else {
          ack(null);
        }
      } catch (err) {
        console.error("[socket.io] join:dispute ack error:", err);
        ack(null);
      }
    },
  );

  // ── leave:dispute ───────────────────────────────────────────
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

app.use("/parse", parseRouter);
app.use("/agreement", agreementRouter);
app.use("/arbitrate", arbitrateRouter);

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "ClauseAI Backend", version: "2.0.0" });
});

async function start() {
  await initRedis();
  await connectMongoDB();
  httpServer.listen(PORT, () => {
    console.log(`✅ ClauseAI backend on http://localhost:${PORT}`);
    console.log(`   Socket.io: agreement rooms + dispute rooms (ack sync)`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
