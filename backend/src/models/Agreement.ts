// ============================================================
// models/Agreement.ts — ADD partyBWallet field
//
// The existing partyB field stores a NAME (e.g. "Bob") because
// that's what the payer typed. We need a separate field for
// Party B's actual Stacks wallet address so we can query by it.
// ============================================================

import mongoose, { Schema, Document } from "mongoose";

export interface IMilestone {
  index: number;
  title: string;
  percentage: number;
  condition: string;
  deadline?: string;
  deadline_dt?: string;
  amountUsd: string;
  amountSats: number;
  status:
    | "locked"
    | "pending"
    | "complete"
    | "disputed"
    | "refunded"
    | "failed";
  txId?: string | null;
  txUrl?: string | null;
  onChainStatus?: number;
  completedAt?: Date | null;
  disputedAt?: Date | null;
}

export interface IAgreement extends Document {
  agreementId: string;
  partyA: string | null; // Party A wallet address (ST…)
  partyB: string | null; // Party B display name ("Bob")
  partyBWallet: string | null; // ← NEW: Party B actual wallet address (ST…)
  arbitrator: string | null;
  totalAmountUsd: number;
  totalAmountSats: number;
  terms: Record<string, unknown>;
  milestones: IMilestone[];
  fundState: "idle" | "locked" | "released" | "refunded" | "disputed";
  fundsLocked: boolean;
  amountLocked: string | null;
  depositTxId: string | null;
  onChainCreateTxId: string | null;
  partyAApproved: boolean;
  partyBApproved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MilestoneSchema = new Schema<IMilestone>(
  {
    index: { type: Number, required: true },
    title: { type: String, required: true },
    percentage: { type: Number, required: true },
    condition: { type: String, default: "" },
    deadline: { type: String },
    deadline_dt: { type: String, default: null },
    amountUsd: { type: String, default: "0" },
    amountSats: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["locked", "pending", "complete", "disputed", "refunded", "failed"],
      default: "locked",
    },
    txId: { type: String, default: null },
    txUrl: { type: String, default: null },
    onChainStatus: { type: Number },
    completedAt: { type: Date, default: null },
    disputedAt: { type: Date, default: null },
  },
  { _id: false },
);

const AgreementSchema = new Schema<IAgreement>(
  {
    agreementId: { type: String, required: true, unique: true, index: true },
    partyA: { type: String, default: null, index: true },
    partyB: { type: String, default: null }, // display name
    partyBWallet: { type: String, default: null, index: true }, // ← NEW wallet field
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
    onChainCreateTxId: { type: String, default: null },
    partyAApproved: { type: Boolean, default: false },
    partyBApproved: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.models.Agreement ||
  mongoose.model<IAgreement>("Agreement", AgreementSchema);
