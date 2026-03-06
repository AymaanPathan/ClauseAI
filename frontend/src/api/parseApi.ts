// ============================================================
// api/parseApi.ts
// ============================================================

import axiosInstance from "@/lib/axiosSetup";

export type AgreementType =
  | "freelance"
  | "rental"
  | "trade"
  | "bet"
  | "multi-phase";

export interface ParseRequest {
  type: AgreementType;
  text: string;
}

// ── V1 schema — rental / bet (single payment) ─────────────────
export interface ParsedAgreement {
  partyA: string;
  partyB: string;
  amount_usd: string;
  deadline: string;
  condition: string;
  arbitrator: string;
  confidence: "high" | "medium" | "low";
  missing_fields: string[];
  notes: string;
}

// ── V2 schema — freelance / trade / multi-phase (milestones) ──
export interface Milestone {
  title: string;
  percentage: number; // integer 0–100, all milestones must sum to 100
  deadline: string; // ISO 8601 or ""
  condition: string;
}

export interface ParsedAgreementV2 {
  payer: string;
  receiver: string;
  total_usd: string;
  milestones: Milestone[];
  arbitrator: string;
  confidence: "high" | "medium" | "low";
  missing_fields: string[];
  notes: string;
}

// ── Type guard ────────────────────────────────────────────────
export function isV2(p: unknown): p is ParsedAgreementV2 {
  return (
    typeof p === "object" &&
    p !== null &&
    "milestones" in p &&
    Array.isArray((p as ParsedAgreementV2).milestones)
  );
}

// ── Response ──────────────────────────────────────────────────
export interface ParseResponse {
  success: boolean;
  data?: ParsedAgreement | ParsedAgreementV2;
  error?: string;
  meta: {
    provider: string;
    model: string;
    type: AgreementType;
    schema?: "v1" | "v2";
    milestone_count?: number | null;
    latency_ms: number;
  };
}

export interface ParserHealthResponse {
  status: string;
  config: { provider: string; model: string };
}

// ── API calls ─────────────────────────────────────────────────
export const parseAgreement = async (
  payload: ParseRequest,
): Promise<ParseResponse> => {
  const { data } = await axiosInstance.post<ParseResponse>(
    "/api/parse",
    payload,
  );
  return data;
};

export const getParserHealth = async (): Promise<ParserHealthResponse> => {
  const { data } = await axiosInstance.get<ParserHealthResponse>("/api/parse");
  return data;
};
