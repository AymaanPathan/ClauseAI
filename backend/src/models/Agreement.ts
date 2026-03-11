// ============================================================
// src/models/Agreement.ts — Mongoose Agreement model
// Persists full agreement lifecycle: creation → milestones → completion
// ============================================================

import mongoose, { Schema, Document } from "mongoose";

export interface IMilestone {
  index: number;
  title: string;
  percentage: number;
  condition: string;
  deadline?: string;
  amountUsd: string;
  amountSats: number;
  status:
    | "locked"
    | "pending"
    | "complete"
    | "disputed"
    | "refunded"
    | "failed";
  txId?: string;
  txUrl?: string;
  onChainStatus?: number;
  completedAt?: Date;
  disputedAt?: Date;
}

export interface IAgreement extends Document {
  agreementId: string;
  partyA: string | null;
  partyB: string | null;
  arbitrator: string | null;
  totalAmountUsd: number;
  totalAmountSats: number;
  terms: Record<string, unknown>;
  milestones: IMilestone[];
  fundState: "idle" | "locked" | "released" | "refunded" | "disputed";
  fundsLocked: boolean;
  amountLocked: string | null;
  depositTxId: string | null;
  partyAApproved: boolean;
  partyBApproved: boolean;
  onChainCreateTxId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const MilestoneSchema = new Schema<IMilestone>(
  {
    index: { type: Number, required: true },
    title: { type: String, default: "" },
    percentage: { type: Number, required: true },
    condition: { type: String, default: "" },
    deadline: { type: String },
    amountUsd: { type: String, default: "0" },
    amountSats: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["locked", "pending", "complete", "disputed", "refunded", "failed"],
      default: "locked",
    },
    txId: { type: String },
    txUrl: { type: String },
    onChainStatus: { type: Number },
    completedAt: { type: Date },
    disputedAt: { type: Date },
  },
  { _id: false },
);

const AgreementSchema = new Schema<IAgreement>(
  {
    agreementId: { type: String, required: true, unique: true, index: true },
    partyA: { type: String, default: null },
    partyB: { type: String, default: null },
    arbitrator: { type: String, default: null },
    totalAmountUsd: { type: Number, default: 0 },
    totalAmountSats: { type: Number, default: 0 },
    terms: { type: Schema.Types.Mixed, default: {} },
    milestones: { type: [MilestoneSchema], default: [] },
    fundState: {
      type: String,
      enum: ["idle", "locked", "released", "refunded", "disputed"],
      default: "idle",
    },
    fundsLocked: { type: Boolean, default: false },
    amountLocked: { type: String, default: null },
    depositTxId: { type: String, default: null },
    partyAApproved: { type: Boolean, default: false },
    partyBApproved: { type: Boolean, default: false },
    onChainCreateTxId: { type: String, default: null },
  },
  {
    timestamps: true, // adds createdAt + updatedAt
  },
);

// Prevent model recompilation in dev
export const Agreement =
  mongoose.models.Agreement ||
  mongoose.model<IAgreement>("Agreement", AgreementSchema);

export default Agreement;
