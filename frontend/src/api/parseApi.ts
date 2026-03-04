// ============================================================
// api/parseApi.ts
// ============================================================

import axiosInstance from "@/lib/axiosSetup";

export type AgreementType = "freelance" | "rental" | "trade" | "bet";

export interface ParseRequest {
  type: AgreementType;
  text: string;
}

export interface ParsedAgreement {
  partyA: string; // Payer
  partyB: string; // Receiver
  amount_usd: string;
  deadline: string;
  condition: string;
  arbitrator: string;
  confidence: "high" | "medium" | "low";
  missing_fields: string[];
  notes: string;
}

export interface ParseResponse {
  success: boolean;
  data?: ParsedAgreement;
  error?: string;
  meta: {
    provider: string;
    model: string;
    type: AgreementType;
    latency_ms: number;
  };
}

export interface ParserHealthResponse {
  status: string;
  config: { provider: string; model: string };
}

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
