// ============================================================
// src/models/Dispute.ts — Mongoose schema, model, in-memory fallback
// ============================================================

import mongoose, { Schema, Document, Model } from "mongoose";
import {
  DisputeStatus,
  VerdictOutcome,
  ContractTerms,
  AIVerdict,
  ArbitratorDecision,
} from "../types/dispute";

// ── Document interface ────────────────────────────────────────

export interface IDispute extends Document {
  agreement_id: string;
  milestone_index: number;
  contract_terms: ContractTerms;
  status: DisputeStatus;

  party_a_statement: string;
  party_a_evidence: string[];
  party_a_submitted_at?: Date;

  party_b_statement: string;
  party_b_evidence: string[];
  party_b_submitted_at?: Date;

  ai_verdict?: AIVerdict;
  arbitrator_decision?: ArbitratorDecision;

  opened_at: Date;
  resolved_at?: Date;
  updated_at: Date;
}

// ── Sub-schemas ───────────────────────────────────────────────

const ContractTermsSchema = new Schema<ContractTerms>(
  {
    payer: { type: String, required: true },
    receiver: { type: String, required: true },
    arbitrator: { type: String, required: true },
    total_amount: { type: Number, required: true },
    milestone_description: { type: String, required: true },
    milestone_percentage: { type: Number, required: true },
    milestone_deadline: { type: String },
    agreement_type: { type: String, default: "freelance" },
  },
  { _id: false },
);

const AIVerdictSchema = new Schema<AIVerdict>(
  {
    verdict: {
      type: String,
      enum: [
        "release_to_receiver",
        "refund_to_payer",
        "split",
      ] as VerdictOutcome[],
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
      enum: [
        "release_to_receiver",
        "refund_to_payer",
        "split",
      ] as VerdictOutcome[],
      required: true,
    },
    followed_ai: { type: Boolean, required: true },
    override_reason: { type: String },
    decided_at: { type: Date, default: Date.now },
    arbitrator_address: { type: String, required: true },
  },
  { _id: false },
);

// ── Main schema ───────────────────────────────────────────────

const DisputeSchema = new Schema<IDispute>(
  {
    agreement_id: { type: String, required: true, index: true },
    milestone_index: { type: Number, required: true, min: 0 },

    contract_terms: { type: ContractTermsSchema, required: true },

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
      ] as DisputeStatus[],
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

// One dispute per agreement + milestone combination
DisputeSchema.index({ agreement_id: 1, milestone_index: 1 }, { unique: true });

export const Dispute: Model<IDispute> =
  mongoose.models.Dispute || mongoose.model<IDispute>("Dispute", DisputeSchema);

// ── In-memory fallback ────────────────────────────────────────
// Used when MONGODB_URI is not set (dev/testing)

const store = new Map<string, IDispute>();

function key(agreementId: string, milestoneIndex: number): string {
  return `${agreementId}:${milestoneIndex}`;
}

export const DisputeMemStore = {
  async find(
    agreementId: string,
    milestoneIndex: number,
  ): Promise<IDispute | null> {
    return store.get(key(agreementId, milestoneIndex)) ?? null;
  },

  async upsert(
    agreementId: string,
    milestoneIndex: number,
    data: Partial<IDispute>,
  ): Promise<IDispute> {
    const k = key(agreementId, milestoneIndex);
    const existing = store.get(k);
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
    store.set(k, updated);
    return updated;
  },

  findByArbitrator(arbitratorAddress: string): IDispute[] {
    return Array.from(store.values()).filter(
      (d) => d.contract_terms?.arbitrator === arbitratorAddress,
    );
  },

  list(): IDispute[] {
    return Array.from(store.values());
  },

  clear(): void {
    store.clear();
  },
};
