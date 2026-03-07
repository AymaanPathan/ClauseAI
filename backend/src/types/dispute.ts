// ============================================================
// src/types/dispute.ts — All dispute-related TypeScript types
// ============================================================

export type DisputeStatus =
  | "awaiting_statements" // dispute opened, waiting for both parties
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

export interface ContractTerms {
  payer: string; // Stacks wallet address
  receiver: string; // Stacks wallet address
  arbitrator: string; // Stacks wallet address
  total_amount: number; // in sBTC
  milestone_description: string;
  milestone_percentage: number; // 0–100
  milestone_deadline?: string; // ISO 8601 or undefined
  agreement_type: string; // "freelance" | "trade" | "rental" | "bet"
}

export interface AIVerdict {
  verdict: VerdictOutcome;
  confidence: number; // 0–100
  reasoning: string;
  key_factors: string[];
  warnings: string[];
  split_percentage?: number; // only if verdict === "split", % to receiver
  generated_at: Date;
  model: string;
  latency_ms: number;
}

export interface ArbitratorDecision {
  outcome: VerdictOutcome;
  followed_ai: boolean;
  override_reason?: string;
  decided_at: Date;
  arbitrator_address: string;
}
