import { Router, Request, Response } from "express";
import { AI_CONFIG } from "../lib/ai-config";
import {
  getSystemPrompt,
  AgreementType,
  ParsedAgreement,
} from "../lib/prompts";

const router = Router();

// ── GET /api/parse — health check ────────────────────────────
router.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    config: {
      provider: AI_CONFIG.provider,
      model: AI_CONFIG.model,
    },
  });
});

// ── POST /api/parse ───────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  const start = Date.now();

  const { type, text } = req.body as { type: AgreementType; text: string };

  // 1. Validate
  if (!type || !["freelance", "rental", "bet"].includes(type)) {
    res.status(400).json({
      success: false,
      error: 'type must be "freelance", "rental", or "bet"',
    });
    return;
  }

  if (!text || typeof text !== "string" || text.trim().length < 5) {
    res.status(400).json({
      success: false,
      error: "text is required (min 5 characters)",
    });
    return;
  }

  // 2. Get API key
  const apiKey = process.env[AI_CONFIG.apiKeyEnvVar];
  if (!apiKey) {
    res.status(500).json({
      success: false,
      error: `Missing env var: ${AI_CONFIG.apiKeyEnvVar}`,
    });
    return;
  }

  // 3. Call AI
  let rawText: string;
  try {
    const response = await fetch(`${AI_CONFIG.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_CONFIG.model,
        max_tokens: AI_CONFIG.maxTokens,
        temperature: 0.1,
        messages: [
          { role: "system", content: getSystemPrompt(type) },
          { role: "user", content: text.trim() },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`AI API ${response.status}: ${errBody}`);
    }

    const completion = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    rawText = completion.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown AI error";
    res.status(502).json({ success: false, error: msg });
    return;
  }

  // 4. Parse JSON
  let parsed: ParsedAgreement;
  try {
    const clean = rawText
      .replace(/```json\n?/gi, "")
      .replace(/```\n?/gi, "")
      .trim();
    parsed = JSON.parse(clean);
  } catch {
    res.status(500).json({
      success: false,
      error: "AI returned non-JSON response",
      raw: rawText,
    });
    return;
  }

  // 5. Respond
  res.json({
    success: true,
    data: parsed,
    meta: {
      provider: AI_CONFIG.provider,
      model: AI_CONFIG.model,
      type,
      latency_ms: Date.now() - start,
    },
  });
});

export default router;
