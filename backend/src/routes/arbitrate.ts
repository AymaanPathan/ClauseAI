// ============================================================
// src/routes/arbitrate.ts — Full Arbitration Engine
//
// Endpoints:
//   POST /api/arbitrate/open          — open a dispute (on-chain event triggers this)
//   POST /api/arbitrate/submit        — party submits statement + evidence URLs
//   POST /api/arbitrate/upload        — upload evidence files to Cloudinary
//   GET  /api/arbitrate/:id/:index    — get dispute state (for UI polling)
//   POST /api/arbitrate/verdict       — run AI arbitration (auto after both submit)
//   POST /api/arbitrate/resolve       — arbitrator confirms or overrides verdict
//
// INSTALL:
//   npm install multer cloudinary mongoose
//   npm install --save-dev @types/multer
//
// ENV VARS:
//   GROQ_API_KEY
//   CLOUDINARY_CLOUD_NAME
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET
//   MONGODB_URI
// ============================================================

import { Router, Request, Response } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import {
  Dispute,
  DisputeMemStore,
  isMongoAvailable,
  IDispute,
  AIVerdict,
  VerdictOutcome,
} from "../lib/db";
import { getGroqClient } from "../lib/groq-client";
import { AI_CONFIG } from "../lib/ai-config";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ── Cloudinary config ─────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── DB helpers (Mongo with mem fallback) ──────────────────────

async function findDispute(
  agreementId: string,
  milestoneIndex: number,
): Promise<IDispute | null> {
  if (isMongoAvailable()) {
    return Dispute.findOne({
      agreement_id: agreementId,
      milestone_index: milestoneIndex,
    });
  }
  return DisputeMemStore.find(agreementId, milestoneIndex);
}

async function saveDispute(
  agreementId: string,
  milestoneIndex: number,
  data: Partial<IDispute>,
): Promise<IDispute> {
  if (isMongoAvailable()) {
    const updated = await Dispute.findOneAndUpdate(
      { agreement_id: agreementId, milestone_index: milestoneIndex },
      { $set: { ...data, updated_at: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return updated!;
  }
  return DisputeMemStore.upsert(agreementId, milestoneIndex, data);
}

// ── SSE for dispute state push ────────────────────────────────
const disputeSSE = new Map<string, Set<Response>>();

function disputeSSEKey(agreementId: string, milestoneIndex: number) {
  return `${agreementId}:${milestoneIndex}`;
}

function notifyDisputeSSE(
  agreementId: string,
  milestoneIndex: number,
  data: unknown,
) {
  const key = disputeSSEKey(agreementId, milestoneIndex);
  const clients = disputeSSE.get(key);
  if (!clients || clients.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

// ── SSE endpoint for dispute live updates ─────────────────────
// GET /api/arbitrate/:id/:index/events
router.get("/:id/:index/events", async (req: Request, res: Response) => {
  const { id, index } = req.params;
  const milestoneIndex = parseInt(index, 10);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const key = disputeSSEKey(id, milestoneIndex);
  if (!disputeSSE.has(key)) disputeSSE.set(key, new Set());
  disputeSSE.get(key)!.add(res);

  // Send current state immediately
  try {
    const dispute = await findDispute(id, milestoneIndex);
    if (dispute) res.write(`data: ${JSON.stringify(dispute)}\n\n`);
  } catch (err) {
    console.error("[Dispute SSE] initial state error:", err);
  }

  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    disputeSSE.get(key)?.delete(res);
    if (disputeSSE.get(key)?.size === 0) disputeSSE.delete(key);
  });
});

// ── POST /api/arbitrate/open ──────────────────────────────────
// Called when a dispute is opened on-chain (from your dashboard)
// Body: { agreement_id, milestone_index, contract_terms }
router.post("/open", async (req: Request, res: Response) => {
  const { agreement_id, milestone_index, contract_terms } = req.body;

  if (!agreement_id || milestone_index === undefined || !contract_terms) {
    return res
      .status(400)
      .json({
        error: "agreement_id, milestone_index, and contract_terms are required",
      });
  }

  try {
    // Check if dispute already exists
    const existing = await findDispute(agreement_id, milestone_index);
    if (existing) {
      return res.json({
        success: true,
        dispute: existing,
        already_exists: true,
      });
    }

    const dispute = await saveDispute(agreement_id, milestone_index, {
      agreement_id,
      milestone_index,
      contract_terms,
      status: "awaiting_statements",
      party_a_statement: "",
      party_a_evidence: [],
      party_b_statement: "",
      party_b_evidence: [],
      opened_at: new Date(),
    } as Partial<IDispute>);

    notifyDisputeSSE(agreement_id, milestone_index, dispute);

    res.json({ success: true, dispute });
  } catch (err) {
    console.error("[/open]", err);
    res.status(500).json({ error: "Failed to open dispute" });
  }
});

// ── POST /api/arbitrate/upload ────────────────────────────────
// Uploads evidence files to Cloudinary, returns URLs
// Body: multipart/form-data with files[] field
// Returns: { urls: string[] }
router.post(
  "/upload",
  upload.array("files", 10),
  async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    // Check Cloudinary is configured
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      // Dev fallback: return placeholder URLs
      console.warn("[Cloudinary] Not configured — returning placeholder URLs");
      const placeholderUrls = files.map(
        (f, i) =>
          `https://placeholder.clauseai.xyz/evidence/${Date.now()}_${i}_${f.originalname}`,
      );
      return res.json({ success: true, urls: placeholderUrls });
    }

    try {
      const uploadPromises = files.map((file) => {
        return new Promise<string>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: "clauseai/evidence",
              resource_type: "auto",
              allowed_formats: [
                "jpg",
                "jpeg",
                "png",
                "pdf",
                "webp",
                "gif",
                "mp4",
              ],
              // Tag with original filename for reference
              public_id: `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9]/g, "_")}`,
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result!.secure_url);
            },
          );
          stream.end(file.buffer);
        });
      });

      const urls = await Promise.all(uploadPromises);
      res.json({ success: true, urls });
    } catch (err) {
      console.error("[Cloudinary upload]", err);
      res.status(500).json({ error: "Evidence upload failed" });
    }
  },
);

// ── POST /api/arbitrate/submit ────────────────────────────────
// A party submits their dispute statement + evidence URLs
// Body: { agreement_id, milestone_index, party, statement, evidence_urls }
//   party: "A" | "B"
router.post("/submit", async (req: Request, res: Response) => {
  const {
    agreement_id,
    milestone_index,
    party,
    statement,
    evidence_urls = [],
  } = req.body as {
    agreement_id: string;
    milestone_index: number;
    party: "A" | "B";
    statement: string;
    evidence_urls?: string[];
  };

  if (!agreement_id || milestone_index === undefined || !party || !statement) {
    return res.status(400).json({
      error:
        "agreement_id, milestone_index, party (A|B), and statement are required",
    });
  }
  if (!["A", "B"].includes(party)) {
    return res.status(400).json({ error: 'party must be "A" or "B"' });
  }
  if (statement.trim().length < 10) {
    return res
      .status(400)
      .json({ error: "Statement must be at least 10 characters" });
  }

  try {
    let dispute = await findDispute(agreement_id, milestone_index);
    if (!dispute) {
      return res.status(404).json({
        error: "Dispute not found. Call /open first.",
      });
    }

    // Don't allow re-submission
    if (party === "A" && dispute.party_a_submitted_at) {
      return res
        .status(409)
        .json({ error: "Party A has already submitted their statement" });
    }
    if (party === "B" && dispute.party_b_submitted_at) {
      return res
        .status(409)
        .json({ error: "Party B has already submitted their statement" });
    }

    // Save statement
    const updateData: Partial<IDispute> =
      party === "A"
        ? {
            party_a_statement: statement.trim(),
            party_a_evidence: evidence_urls,
            party_a_submitted_at: new Date(),
          }
        : {
            party_b_statement: statement.trim(),
            party_b_evidence: evidence_urls,
            party_b_submitted_at: new Date(),
          };

    // Determine new status
    const aSubmitted = party === "A" ? true : !!dispute.party_a_submitted_at;
    const bSubmitted = party === "B" ? true : !!dispute.party_b_submitted_at;

    let newStatus = dispute.status;
    if (aSubmitted && bSubmitted) {
      newStatus = "ai_pending"; // Both in — trigger AI
    } else if (aSubmitted) {
      newStatus = "party_a_submitted";
    } else if (bSubmitted) {
      newStatus = "party_b_submitted";
    }

    updateData.status = newStatus;
    dispute = await saveDispute(agreement_id, milestone_index, updateData);
    notifyDisputeSSE(agreement_id, milestone_index, dispute);

    // Auto-trigger AI if both parties have submitted
    if (newStatus === "ai_pending") {
      // Fire async — don't block response
      runAIArbitration(dispute).catch((err) =>
        console.error("[AI Arbitration auto-trigger]", err),
      );
    }

    res.json({
      success: true,
      dispute,
      next:
        newStatus === "ai_pending"
          ? "Both parties submitted. AI arbitration running..."
          : `Waiting for Party ${party === "A" ? "B" : "A"} to submit.`,
    });
  } catch (err) {
    console.error("[/submit]", err);
    res.status(500).json({ error: "Failed to save statement" });
  }
});

// ── GET /api/arbitrate/:id/:index ─────────────────────────────
// Get current dispute state (UI polls this)
router.get("/:id/:index", async (req: Request, res: Response) => {
  const { id, index } = req.params;
  const milestoneIndex = parseInt(index, 10);

  try {
    const dispute = await findDispute(id, milestoneIndex);
    if (!dispute) {
      return res.status(404).json({ error: "Dispute not found" });
    }
    res.json({ success: true, dispute });
  } catch (err) {
    console.error("[GET dispute]", err);
    res.status(500).json({ error: "Failed to fetch dispute" });
  }
});

// ── POST /api/arbitrate/verdict ───────────────────────────────
// Manually trigger AI verdict (also called automatically after both submit)
// Body: { agreement_id, milestone_index }
router.post("/verdict", async (req: Request, res: Response) => {
  const { agreement_id, milestone_index } = req.body;

  try {
    const dispute = await findDispute(agreement_id, milestone_index);
    if (!dispute) {
      return res.status(404).json({ error: "Dispute not found" });
    }
    if (!dispute.party_a_submitted_at || !dispute.party_b_submitted_at) {
      return res
        .status(400)
        .json({
          error: "Both parties must submit before running AI arbitration",
        });
    }
    if (dispute.ai_verdict) {
      return res.json({ success: true, dispute, cached: true });
    }

    const updated = await runAIArbitration(dispute);
    res.json({ success: true, dispute: updated });
  } catch (err) {
    console.error("[/verdict]", err);
    res.status(500).json({ error: "AI arbitration failed" });
  }
});

// ── POST /api/arbitrate/resolve ───────────────────────────────
// Arbitrator confirms AI verdict or overrides it
// Body: { agreement_id, milestone_index, arbitrator_address, action, override_reason? }
//   action: "confirm" | "override_release" | "override_refund"
router.post("/resolve", async (req: Request, res: Response) => {
  const {
    agreement_id,
    milestone_index,
    arbitrator_address,
    action,
    override_reason,
  } = req.body as {
    agreement_id: string;
    milestone_index: number;
    arbitrator_address: string;
    action: "confirm" | "override_release" | "override_refund";
    override_reason?: string;
  };

  if (
    !agreement_id ||
    milestone_index === undefined ||
    !arbitrator_address ||
    !action
  ) {
    return res
      .status(400)
      .json({
        error:
          "agreement_id, milestone_index, arbitrator_address, and action are required",
      });
  }

  const validActions = ["confirm", "override_release", "override_refund"];
  if (!validActions.includes(action)) {
    return res
      .status(400)
      .json({ error: `action must be one of: ${validActions.join(", ")}` });
  }

  try {
    const dispute = await findDispute(agreement_id, milestone_index);
    if (!dispute) {
      return res.status(404).json({ error: "Dispute not found" });
    }
    if (dispute.status === "resolved") {
      return res.status(409).json({ error: "Dispute already resolved" });
    }
    if (!dispute.ai_verdict) {
      return res
        .status(400)
        .json({
          error: "AI verdict must be generated before arbitrator can decide",
        });
    }

    // Map action → outcome
    let outcome: VerdictOutcome;
    let followedAI: boolean;

    if (action === "confirm") {
      outcome = dispute.ai_verdict.verdict;
      followedAI = true;
    } else if (action === "override_release") {
      outcome = "release_to_receiver";
      followedAI = dispute.ai_verdict.verdict === "release_to_receiver";
    } else {
      outcome = "refund_to_payer";
      followedAI = dispute.ai_verdict.verdict === "refund_to_payer";
    }

    const updated = await saveDispute(agreement_id, milestone_index, {
      status: "resolved",
      resolved_at: new Date(),
      arbitrator_decision: {
        outcome,
        followed_ai: followedAI,
        override_reason: followedAI ? undefined : override_reason,
        decided_at: new Date(),
        arbitrator_address,
      },
    } as Partial<IDispute>);

    notifyDisputeSSE(agreement_id, milestone_index, updated);

    res.json({
      success: true,
      dispute: updated,
      // The frontend uses this to know which on-chain call to make:
      // "release_to_receiver" → call resolve-to-receiver()
      // "refund_to_payer"     → call resolve-to-payer()
      on_chain_action:
        outcome === "release_to_receiver"
          ? "resolve-to-receiver"
          : "resolve-to-payer",
    });
  } catch (err) {
    console.error("[/resolve]", err);
    res.status(500).json({ error: "Failed to record resolution" });
  }
});

// ── AI Arbitration Engine ─────────────────────────────────────

async function runAIArbitration(dispute: IDispute): Promise<IDispute> {
  const start = Date.now();
  const client = getGroqClient();

  const { contract_terms } = dispute;
  const totalAmount = contract_terms.total_amount ?? 0;
  const milestoneAmount =
    (totalAmount * contract_terms.milestone_percentage) / 100;

  // ── System prompt ─────────────────────────────────────────
  const systemPrompt = `You are a neutral AI arbitration engine for ClauseAI — a Bitcoin-enforced smart contract escrow platform.

Your role is to analyze a commercial dispute and output a structured verdict. You must be:
- STRICTLY impartial — analyze only what was agreed in writing
- Evidence-focused — weight submitted proof heavily  
- Contract-literal — do not infer obligations not in written terms
- Conservative — in genuine doubt, default to refund_to_payer (buyer protection)

CRITICAL RULES:
1. Award based on contractual deliverables ONLY, not subjective quality (unless quality standards were specified)
2. Award based on completion, not effort
3. Deadlines are binding UNLESS both parties agreed to extension (look for evidence)
4. Partial completion → consider "split" verdict with reasoned percentage to receiver
5. Missing evidence from a party weakens their claim significantly
6. If Party B (receiver) claims delivery, look for proof of delivery in their evidence

You must respond ONLY with a valid JSON object. No markdown, no preamble, nothing outside JSON.

Required JSON shape:
{
  "verdict": "release_to_receiver" | "refund_to_payer" | "split",
  "confidence": <integer 0-100>,
  "reasoning": "<2-4 clear sentences explaining your decision>",
  "key_factors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "warnings": ["<warning if any, e.g. missing evidence, ambiguous deadline>"],
  "split_percentage": <integer 0-100, receiver gets this %, ONLY include if verdict is "split">
}`;

  // ── User prompt (the actual case) ────────────────────────
  const userPrompt = `=== CONTRACT TERMS ===
Agreement Type: ${contract_terms.agreement_type ?? "freelance"}
Payer (Party A — wants refund): ${contract_terms.payer}
Receiver (Party B — wants payment): ${contract_terms.receiver}
Total Contract Value: ${totalAmount} sBTC
Milestone: "${contract_terms.milestone_description}"
Milestone Amount at Stake: ${milestoneAmount.toFixed(6)} sBTC (${contract_terms.milestone_percentage}% of total)
${contract_terms.milestone_deadline ? `Deadline: ${contract_terms.milestone_deadline}` : "No deadline specified for this milestone"}

=== PARTY A STATEMENT (Payer — claiming non-delivery or defect) ===
${dispute.party_a_statement || "[Party A did not submit a statement]"}

Party A Evidence (${dispute.party_a_evidence?.length ?? 0} file(s) submitted):
${
  dispute.party_a_evidence?.length
    ? dispute.party_a_evidence
        .map((url, i) => `  [A-${i + 1}] ${url}`)
        .join("\n")
    : "  No evidence submitted"
}

=== PARTY B STATEMENT (Receiver — claiming delivery and payment) ===
${dispute.party_b_statement || "[Party B did not submit a statement]"}

Party B Evidence (${dispute.party_b_evidence?.length ?? 0} file(s) submitted):
${
  dispute.party_b_evidence?.length
    ? dispute.party_b_evidence
        .map((url, i) => `  [B-${i + 1}] ${url}`)
        .join("\n")
    : "  No evidence submitted"
}

=== YOUR TASK ===
Based strictly on the contract terms and submitted evidence, determine whether:
1. The milestone deliverable was completed as specified → release_to_receiver
2. The deliverable was NOT completed or conditions not met → refund_to_payer  
3. Partial completion that warrants splitting the payment → split

Remember: The arbitrator (human) will review your recommendation and can override it.`;

  let verdictData: AIVerdict;

  try {
    const completion = await client.chat.completions.create({
      model: AI_CONFIG.model,
      max_tokens: 800,
      temperature: 0.1, // Low temp for consistent, deterministic output
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const rawText = completion.choices?.[0]?.message?.content ?? "";
    const clean = rawText
      .replace(/```json\n?/gi, "")
      .replace(/```\n?/gi, "")
      .trim();
    const parsed = JSON.parse(clean);

    // Validate verdict field
    if (
      !["release_to_receiver", "refund_to_payer", "split"].includes(
        parsed.verdict,
      )
    ) {
      throw new Error(`Invalid verdict value: ${parsed.verdict}`);
    }

    verdictData = {
      verdict: parsed.verdict as VerdictOutcome,
      confidence: Math.max(0, Math.min(100, parseInt(parsed.confidence) || 50)),
      reasoning: parsed.reasoning ?? "No reasoning provided.",
      key_factors: Array.isArray(parsed.key_factors) ? parsed.key_factors : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      split_percentage: parsed.split_percentage,
      generated_at: new Date(),
      model: AI_CONFIG.model,
      latency_ms: Date.now() - start,
    };
  } catch (err) {
    console.error("[AI Arbitration] Parse error:", err);
    // Fallback verdict when AI fails
    verdictData = {
      verdict: "refund_to_payer",
      confidence: 0,
      reasoning:
        "AI arbitration encountered a technical error. Human arbitrator must review manually.",
      key_factors: ["AI error — manual review required"],
      warnings: [
        "AI response could not be parsed. Please review evidence manually.",
      ],
      generated_at: new Date(),
      model: AI_CONFIG.model,
      latency_ms: Date.now() - start,
    };
  }

  const updated = await saveDispute(
    dispute.agreement_id,
    dispute.milestone_index,
    {
      ai_verdict: verdictData,
      status: "ai_complete",
    } as Partial<IDispute>,
  );

  notifyDisputeSSE(dispute.agreement_id, dispute.milestone_index, updated);

  return updated;
}

export default router;
