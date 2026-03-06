// ============================================================
// src/routes/parse.ts — UPDATED for milestone extraction
// ============================================================

import { Router, Request, Response } from "express";
import { AI_CONFIG } from "../lib/ai-config";
import {
  getSystemPrompt,
  isMultiMilestoneType,
  isV2,
  AgreementType,
  ParsedAgreementV1,
  ParsedAgreementV2,
  Milestone,
} from "../lib/prompts";
import { getGroqClient } from "../lib/groq-client";

const router = Router();

const VALID_TYPES: AgreementType[] = [
  "freelance",
  "rental",
  "trade",
  "bet",
  "multi-phase",
];

// ── Validation helpers ────────────────────────────────────────

/**
 * Ensures milestone percentages sum to exactly 100.
 * If off due to rounding, adjusts the last milestone.
 */
function normalizeMilestones(milestones: Milestone[]): Milestone[] {
  if (!milestones.length) return milestones;

  const total = milestones.reduce((sum, m) => sum + (m.percentage ?? 0), 0);
  if (total === 100) return milestones;

  // Adjust last milestone to fix rounding drift
  const adjusted = [...milestones];
  const lastIndex = adjusted.length - 1;
  adjusted[lastIndex] = {
    ...adjusted[lastIndex],
    percentage: adjusted[lastIndex].percentage + (100 - total),
  };
  return adjusted;
}

/**
 * If the AI returns a V1 response for a multi-milestone type,
 * coerce it into a V2 with a single 100% milestone.
 */
function coerceV1toV2(
  raw: ParsedAgreementV1,
  type: AgreementType,
): ParsedAgreementV2 {
  return {
    payer: raw.partyA,
    receiver: raw.partyB,
    total_usd: raw.amount_usd,
    arbitrator: raw.arbitrator,
    confidence: raw.confidence,
    missing_fields: raw.missing_fields,
    notes: `[Auto-coerced from single-milestone response] ${raw.notes}`,
    milestones: [
      {
        title: "Full Payment",
        percentage: 100,
        deadline: raw.deadline ?? "",
        condition: raw.condition ?? "",
      },
    ],
  };
}

/**
 * Validate and sanitize a V2 response from the AI.
 */
function validateV2(parsed: ParsedAgreementV2): {
  valid: boolean;
  error?: string;
} {
  if (!Array.isArray(parsed.milestones) || parsed.milestones.length === 0) {
    return { valid: false, error: "milestones must be a non-empty array" };
  }

  for (const [i, m] of parsed.milestones.entries()) {
    if (
      typeof m.percentage !== "number" ||
      m.percentage < 0 ||
      m.percentage > 100
    ) {
      return {
        valid: false,
        error: `milestone[${i}].percentage out of range: ${m.percentage}`,
      };
    }
  }

  return { valid: true };
}

// ── Routes ────────────────────────────────────────────────────

router.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    config: {
      provider: AI_CONFIG.provider,
      model: AI_CONFIG.model,
    },
    supported_types: VALID_TYPES,
    schemas: {
      "multi-phase": "V2 (milestones array)",
      freelance: "V2 (milestones array, single fallback)",
      trade: "V2 (milestones array, single fallback)",
      rental: "V1 (single payment)",
      bet: "V1 (single payment)",
    },
  });
});

router.post("/", async (req: Request, res: Response) => {
  const start = Date.now();

  const { type, text } = req.body as {
    type: AgreementType;
    text: string;
  };

  // ── Input validation ────────────────────────────────────────

  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({
      success: false,
      error: `type must be one of: ${VALID_TYPES.join(", ")}`,
    });
  }

  if (!text || typeof text !== "string" || text.trim().length < 5) {
    return res.status(400).json({
      success: false,
      error: "text is required (min 5 characters)",
    });
  }

  const apiKey = process.env[AI_CONFIG.apiKeyEnvVar];
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: `Missing env var: ${AI_CONFIG.apiKeyEnvVar}`,
    });
  }

  // ── AI call ─────────────────────────────────────────────────

  let rawText = "";

  try {
    const client = getGroqClient();

    const completion = await client.chat.completions.create({
      model: AI_CONFIG.model,
      max_tokens: AI_CONFIG.maxTokens,
      temperature: 0.1,
      messages: [
        { role: "system", content: getSystemPrompt(type) },
        { role: "user", content: text.trim() },
      ],
    });

    rawText = completion.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown AI error";
    return res.status(502).json({ success: false, error: msg });
  }

  // ── Parse JSON ──────────────────────────────────────────────

  let parsed: ParsedAgreementV1 | ParsedAgreementV2;

  try {
    const clean = rawText
      .replace(/```json\n?/gi, "")
      .replace(/```\n?/gi, "")
      .trim();

    parsed = JSON.parse(clean);
  } catch {
    return res.status(500).json({
      success: false,
      error: "AI returned non-JSON response",
      raw: rawText,
    });
  }

  // ── Schema handling ─────────────────────────────────────────

  const usesMilestones = isMultiMilestoneType(type);

  if (usesMilestones) {
    // If AI returned V1 shape for a milestone type, coerce it
    if (!isV2(parsed)) {
      parsed = coerceV1toV2(parsed as ParsedAgreementV1, type);
    }

    const v2 = parsed as ParsedAgreementV2;

    // Validate milestone structure
    const validation = validateV2(v2);
    if (!validation.valid) {
      return res.status(500).json({
        success: false,
        error: `Invalid milestone data: ${validation.error}`,
        raw: rawText,
      });
    }

    // Normalize percentages to sum to 100
    v2.milestones = normalizeMilestones(v2.milestones);

    // Single-milestone fallback: if multi-phase returned 0 milestones somehow
    if (v2.milestones.length === 0) {
      v2.milestones = [
        {
          title: "Full Payment",
          percentage: 100,
          deadline: "",
          condition: "Payer confirms work is complete.",
        },
      ];
    }
  }

  // ── Response ────────────────────────────────────────────────

  return res.json({
    success: true,
    data: parsed,
    meta: {
      provider: AI_CONFIG.provider,
      model: AI_CONFIG.model,
      type,
      schema: usesMilestones ? "v2" : "v1",
      milestone_count: usesMilestones
        ? (parsed as ParsedAgreementV2).milestones.length
        : null,
      latency_ms: Date.now() - start,
    },
  });
});

export default router;
