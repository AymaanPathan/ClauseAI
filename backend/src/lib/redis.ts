// ============================================================
// src/lib/redis.ts
// Redis client with graceful in-memory fallback.
// Set REDIS_URL env var to enable (e.g. redis://localhost:6379)
// ============================================================

import { createClient, RedisClientType } from "redis";

let client: RedisClientType | null = null;
let connected = false;

export function getRedisClient(): RedisClientType {
  if (!client) {
    throw new Error("Redis not initialized. Call initRedis() first.");
  }
  return client;
}

export function isRedisAvailable(): boolean {
  return connected && client !== null;
}

export async function initRedis(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn(
      "[Redis] REDIS_URL not set — using in-memory store (dev mode)",
    );
    return;
  }

  try {
    client = createClient({ url }) as RedisClientType;

    client.on("error", (err) => {
      console.error("[Redis] Client error:", err.message);
      connected = false;
    });

    client.on("connect", () => {
      console.log("[Redis] Connected");
      connected = true;
    });

    client.on("reconnecting", () => {
      console.warn("[Redis] Reconnecting...");
    });

    await client.connect();
    connected = true;
    console.log("[Redis] Ready");
  } catch (err) {
    console.error(
      "[Redis] Failed to connect — falling back to in-memory:",
      err,
    );
    connected = false;
    client = null;
  }
}

export async function closeRedis(): Promise<void> {
  if (client && connected) {
    await client.quit();
    connected = false;
    client = null;
  }
}
