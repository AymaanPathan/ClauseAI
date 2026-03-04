import { Router, Request, Response } from "express";
import { AI_CONFIG } from "../lib/ai-config";
import {
  getSystemPrompt,
  AgreementType,
  ParsedAgreement,
} from "../lib/prompts";
import { getGroqClient } from "../lib/groq-client";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    config: {
      provider: AI_CONFIG.provider,
      model: AI_CONFIG.model,
    },
  });
});

router.post("/", async (req: Request, res: Response) => {
  const start = Date.now();

  const { type, text } = req.body as {
    type: AgreementType;
    text: string;
  };

  if (!type || !["freelance", "rental", "trade", "bet"].includes(type)) {
    return res.status(400).json({
      success: false,
      error: 'type must be "freelance", "rental", "trade", or "bet"',
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

    rawText = completion.choices?.[0]?.message?.content || "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown AI error";
    return res.status(502).json({ success: false, error: msg });
  }

  let parsed: ParsedAgreement;

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

  return res.json({
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
