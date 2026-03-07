// ============================================================
// src/lib/db.ts — MongoDB connection + Dispute schema
//
// WHY MONGODB (not Redis):
//   Redis: perfect for presence (short-lived, 24hr TTL, key-value)
//   MongoDB: needed for disputes because:
//     - Disputes must persist permanently (audit trail)
//     - AI verdicts need to be queryable/auditable
//     - Evidence links, statements, arbitrator decisions = structured docs
//     - Disputes outlive server restarts
//
// INSTALL: npm install mongoose
// ENV:     MONGODB_URI=mongodb://localhost:27017/clauseai
//          (or MongoDB Atlas URI)
// ============================================================

import mongoose, { Schema, Document, Model } from "mongoose";

// ── Connection ────────────────────────────────────────────────

let isConnected = false;

export async function connectMongoDB(): Promise<void> {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("[MongoDB] MONGODB_URI not set — disputes will not persist.");
    return;
  }

  try {
    await mongoose.connect(uri, {
      dbName: "clauseai",
    });
    isConnected = true;
    console.log("[MongoDB] Connected");

    mongoose.connection.on("error", (err: any) => {
      console.error("[MongoDB] Error:", err.message);
      isConnected = false;
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("[MongoDB] Disconnected");
      isConnected = false;
    });
  } catch (err) {
    console.error("[MongoDB] Failed to connect:", err);
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

// ── Types ─────────────────────────────────────────────────────

export type DisputeStatus =
  | "awaiting_statements" // dispute opened, waiting for both parties to submit
  | "party_a_submitted" // Party A submitted, waiting for Party B
  | "party_b_submitted" // Party B submitted, waiting for Party A
  | "ai_pending" // both submitted, AI verdict being generated
  | "ai_complete" // AI verdict ready, waiting for arbitrator
  | "resolved" // arbitrator made final decision
  | "auto_refunded"; // arb timeout — auto-refunded to payer

export type VerdictOutcome =
  | "release_to_receiver"
  | "refund_to_payer"
  | "split";

export interface AIVerdict {
  verdict: VerdictOutcome;
  confidence: number; // 0–100
  reasoning: string;
  key_factors: string[];
  warnings: string[];
  split_percentage?: number; // if split: % to receiver (0-100)
  generated_at: Date;
  model: string; // e.g. "llama-3.3-70b-versatile"
  latency_ms: number;
}

export interface ArbitratorDecision {
  outcome: VerdictOutcome;
  followed_ai: boolean; // did arbitrator follow AI recommendation?
  override_reason?: string; // if overriding, why
  decided_at: Date;
  arbitrator_address: string;
}

// ── Dispute Schema ────────────────────────────────────────────

export interface IDispute extends Document {
  // Identifiers
  agreement_id: string; // ClauseAI agreement ID (e.g. "ABC123")
  milestone_index: number; // which milestone is disputed

  // Contract context (snapshot at time of dispute)
  contract_terms: {
    payer: string; // wallet address
    receiver: string; // wallet address
    arbitrator: string; // wallet address
    total_amount: number; // in sBTC
    milestone_description: string;
    milestone_percentage: number;
    milestone_deadline?: string;
    agreement_type: string;
  };

  // Statement submission
  status: DisputeStatus;
  party_a_statement: string;
  party_a_evidence: string[]; // Cloudinary URLs
  party_a_submitted_at?: Date;

  party_b_statement: string;
  party_b_evidence: string[]; // Cloudinary URLs
  party_b_submitted_at?: Date;

  // AI verdict
  ai_verdict?: AIVerdict;

  // Arbitrator final decision
  arbitrator_decision?: ArbitratorDecision;

  // Timestamps
  opened_at: Date;
  resolved_at?: Date;
  updated_at: Date;
}

const AIVerdictSchema = new Schema<AIVerdict>(
  {
    verdict: {
      type: String,
      enum: ["release_to_receiver", "refund_to_payer", "split"],
      required: true,
    },
    confidence: { type: Number, min: 0, max: 100, required: true },
    reasoning: { type: String, required: true },
    key_factors: [{ type: String }],
    warnings: [{ type: String }],
    split_percentage: { type: Number, min: 0, max: 100 },
    generated_at: { type: Date, default: Date.now },
    model: { type: String, required: true },
    latency_ms: { type: Number },
  },
  { _id: false },
);

const ArbitratorDecisionSchema = new Schema<ArbitratorDecision>(
  {
    outcome: {
      type: String,
      enum: ["release_to_receiver", "refund_to_payer", "split"],
      required: true,
    },
    followed_ai: { type: Boolean, required: true },
    override_reason: { type: String },
    decided_at: { type: Date, default: Date.now },
    arbitrator_address: { type: String, required: true },
  },
  { _id: false },
);

const DisputeSchema = new Schema<IDispute>(
  {
    agreement_id: { type: String, required: true, index: true },
    milestone_index: { type: Number, required: true, min: 0 },

    contract_terms: {
      payer: { type: String, required: true },
      receiver: { type: String, required: true },
      arbitrator: { type: String, required: true },
      total_amount: { type: Number, required: true },
      milestone_description: { type: String, required: true },
      milestone_percentage: { type: Number, required: true },
      milestone_deadline: { type: String },
      agreement_type: { type: String, default: "freelance" },
    },

    status: {
      type: String,
      enum: [
        "awaiting_statements",
        "party_a_submitted",
        "party_b_submitted",
        "ai_pending",
        "ai_complete",
        "resolved",
        "auto_refunded",
      ],
      default: "awaiting_statements",
      index: true,
    },

    party_a_statement: { type: String, default: "" },
    party_a_evidence: [{ type: String }],
    party_a_submitted_at: { type: Date },

    party_b_statement: { type: String, default: "" },
    party_b_evidence: [{ type: String }],
    party_b_submitted_at: { type: Date },

    ai_verdict: { type: AIVerdictSchema },
    arbitrator_decision: { type: ArbitratorDecisionSchema },

    opened_at: { type: Date, default: Date.now },
    resolved_at: { type: Date },
    updated_at: { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: "opened_at", updatedAt: "updated_at" },
    collection: "disputes",
  },
);

// Compound index: one dispute per agreement + milestone
DisputeSchema.index({ agreement_id: 1, milestone_index: 1 }, { unique: true });

export const Dispute: Model<IDispute> =
  mongoose.models.Dispute || mongoose.model<IDispute>("Dispute", DisputeSchema);

// ── In-memory fallback (when MongoDB is unavailable) ──────────
// Mirrors the Dispute document structure for dev/testing

const memDisputeStore = new Map<string, IDispute>();

function disputeKey(agreementId: string, milestoneIndex: number): string {
  return `${agreementId}:${milestoneIndex}`;
}

export const DisputeMemStore = {
  async find(
    agreementId: string,
    milestoneIndex: number,
  ): Promise<IDispute | null> {
    return memDisputeStore.get(disputeKey(agreementId, milestoneIndex)) ?? null;
  },

  async upsert(
    agreementId: string,
    milestoneIndex: number,
    data: Partial<IDispute>,
  ): Promise<IDispute> {
    const key = disputeKey(agreementId, milestoneIndex);
    const existing = memDisputeStore.get(key);
    const updated = {
      ...(existing ?? {
        agreement_id: agreementId,
        milestone_index: milestoneIndex,
        status: "awaiting_statements",
        party_a_statement: "",
        party_a_evidence: [],
        party_b_statement: "",
        party_b_evidence: [],
        opened_at: new Date(),
        updated_at: new Date(),
      }),
      ...data,
      updated_at: new Date(),
    } as IDispute;
    memDisputeStore.set(key, updated);
    return updated;
  },

  list(): IDispute[] {
    return Array.from(memDisputeStore.values());
  },
};
