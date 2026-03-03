import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import parseRouter from "./routes/parse";

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────
app.use("/api/parse", parseRouter);

// ── Root health check ─────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "ClauseAi Backend" });
});

app.listen(PORT, () => {
  console.log(`✅ ClauseAi backend running on http://localhost:${PORT}`);
});
