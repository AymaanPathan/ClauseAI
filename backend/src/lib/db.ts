// ============================================================
// src/lib/db.ts — MongoDB connection ONLY
// Schemas live in src/models/
// ============================================================

import mongoose from "mongoose";

let isConnected = false;

export async function connectMongoDB(): Promise<void> {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn(
      "[MongoDB] MONGODB_URI not set — disputes will use in-memory fallback.",
    );
    return;
  }

  try {
    await mongoose.connect(uri, { dbName: "clauseai" });
    isConnected = true;
    console.log("[MongoDB] Connected");

    mongoose.connection.on("error", (err) => {
      console.error("[MongoDB] Error:", err.message);
      isConnected = false;
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("[MongoDB] Disconnected");
      isConnected = false;
    });
  } catch (err) {
    console.error(
      "[MongoDB] Failed to connect — using in-memory fallback:",
      err,
    );
    isConnected = false;
  }
}

export function isMongoAvailable(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}

export async function closeMongoDB(): Promise<void> {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    console.log("[MongoDB] Disconnected cleanly");
  }
}
