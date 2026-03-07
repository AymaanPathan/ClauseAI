// ============================================================
// src/routes/arbitrate.ts — Full Arbitration Engine
//
// Endpoints:
//   POST /api/arbitrate/open             — open a dispute record
//   POST /api/arbitrate/submit           — party submits statement + evidence URLs
//   POST /api/arbitrate/upload           — upload evidence files to Cloudinary
//   POST /api/arbitrate/verdict          — manually trigger AI arbitration
//   POST /api/arbitrate/resolve          — arbitrator confirms or overrides verdict
//   GET  /api/arbitrate/dashboard/:addr  — all disputes for an arbitrator wallet
//   GET  /api/arbitrate/:id/:index       — get single dispute state
//   GET  /api/arbitrate/:id/:index/events — SSE live updates for a dispute
//
// ENV VARS:
//   GROQ_API_KEY            (required)
//   CLOUDINARY_CLOUD_NAME   (optional — falls back to placeholder URLs)
//   CLOUDINARY_API_KEY      (optional)
//   CLOUDINARY_API_SECRET   (optional)
//   MONGODB_URI             (optional — falls back to in-memory)
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

// ── DB helpers (Mongo with in-memory fallback) ────────────────

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

// ── SSE registry (dispute live updates) ──────────────────────

const disputeSSE = new Map<string, Set<Response>>();

function sseKey(agreementId: string, milestoneIndex: number): string {
  return `${agreementId}:${milestoneIndex}`;
}

function notifyDisputeSSE(
  agreementId: string,
  milestoneIndex: number,
  data: unknown,
): void {
  const clients = disputeSSE.get(sseKey(agreementId, milestoneIndex));
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

// ── GET /api/arbitrate/:id/:index/events — SSE stream ────────
router.get("/:id/:index/events", async (req: Request, res: Response) => {
  const { id, index } = req.params;
  const milestoneIndex = parseInt(index, 10);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const key = sseKey(id, milestoneIndex);
  if (!disputeSSE.has(key)) disputeSSE.set(key, new Set());
  disputeSSE.get(key)!.add(res);

  // Send current state immediately on connect
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

// ── GET /api/arbitrate/dashboard/:arbitratorAddress ───────────
// Returns all disputes assigned to this arbitrator wallet
// Used to populate the arbitrator dashboard
router.get("/dashboard/:address", async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!address) {
    return res.status(400).json({ error: "arbitrator address is required" });
  }

  try {
    let disputes: IDispute[];

    if (isMongoAvailable()) {
      disputes = await Dispute.find({
        "contract_terms.arbitrator": address,
      }).sort({ updated_at: -1 });
    } else {
      disputes = DisputeMemStore.findByArbitrator(address);
    }

    // Summary counts for dashboard header
    const summary = {
      total: disputes.length,
      needs_decision: disputes.filter((d) => d.status === "ai_complete").length,
      pending: disputes.filter((d) =>
        [
          "awaiting_statements",
          "party_a_submitted",
          "party_b_submitted",
          "ai_pending",
        ].includes(d.status),
      ).length,
      resolved: disputes.filter((d) =>
        ["resolved", "auto_refunded"].includes(d.status),
      ).length,
    };

    res.json({ success: true, summary, disputes });
  } catch (err) {
    console.error("[dashboard GET]", err);
    res.status(500).json({ error: "Failed to fetch disputes" });
  }
});

// ── GET /api/arbitrate/:id/:index — single dispute ────────────
router.get("/:id/:index", async (req: Request, res: Response) => {
  const { id, index } = req.params;
  const milestoneIndex = parseInt(index, 10);

  if (isNaN(milestoneIndex)) {
    return res.status(400).json({ error: "milestone index must be a number" });
  }

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

// ── POST /api/arbitrate/open ──────────────────────────────────
// Called when a milestone is disputed on-chain.
// Body: { agreement_id, milestone_index, contract_terms }
router.post("/open", async (req: Request, res: Response) => {
  const { agreement_id, milestone_index, contract_terms } = req.body as {
    agreement_id: string;
    milestone_index: number;
    contract_terms: IDispute["contract_terms"];
  };

  if (!agreement_id || milestone_index === undefined || !contract_terms) {
    return res.status(400).json({
      error: "agreement_id, milestone_index, and contract_terms are required",
    });
  }

  if (
    !contract_terms.payer ||
    !contract_terms.receiver ||
    !contract_terms.arbitrator ||
    !contract_terms.milestone_description
  ) {
    return res.status(400).json({
      error:
        "contract_terms must include: payer, receiver, arbitrator, milestone_description",
    });
  }

  try {
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
// Uploads evidence files to Cloudinary, returns URLs.
// Body: multipart/form-data, field name: "files" (up to 10)
router.post(
  "/upload",
  upload.array("files", 10),
  async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    // Dev fallback when Cloudinary is not configured
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      console.warn("[Cloudinary] Not configured — returning placeholder URLs");
      const placeholderUrls = files.map(
        (f, i) =>
          `https://placeholder.clauseai.xyz/evidence/${Date.now()}_${i}_${f.originalname}`,
      );
      return res.json({ success: true, urls: placeholderUrls });
    }

    try {
      const uploadPromises = files.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
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
                public_id: `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9]/g, "_")}`,
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result!.secure_url);
              },
            );
            stream.end(file.buffer);
          }),
      );

      const urls = await Promise.all(uploadPromises);
      res.json({ success: true, urls });
    } catch (err) {
      console.error("[Cloudinary upload]", err);
      res.status(500).json({ error: "Evidence upload failed" });
    }
  },
);

// ── POST /api/arbitrate/submit ────────────────────────────────
// A party submits their statement and evidence URLs.
// Body: { agreement_id, milestone_index, party, statement, evidence_urls? }
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
      return res
        .status(404)
        .json({ error: "Dispute not found. Call /open first." });
    }

    // Prevent re-submission
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

    if (aSubmitted && bSubmitted) {
      updateData.status = "ai_pending";
    } else if (aSubmitted) {
      updateData.status = "party_a_submitted";
    } else if (bSubmitted) {
      updateData.status = "party_b_submitted";
    }

    dispute = await saveDispute(agreement_id, milestone_index, updateData);
    notifyDisputeSSE(agreement_id, milestone_index, dispute);

    // Auto-trigger AI when both parties have submitted
    if (updateData.status === "ai_pending") {
      runAIArbitration(dispute).catch((err) =>
        console.error("[AI auto-trigger error]", err),
      );
    }

    res.json({
      success: true,
      dispute,
      next:
        updateData.status === "ai_pending"
          ? "Both parties submitted. AI arbitration running..."
          : `Waiting for Party ${party === "A" ? "B" : "A"} to submit.`,
    });
  } catch (err) {
    console.error("[/submit]", err);
    res.status(500).json({ error: "Failed to save statement" });
  }
});

// ── POST /api/arbitrate/verdict ───────────────────────────────
// Manually trigger AI verdict (also fires automatically after both submit).
// Body: { agreement_id, milestone_index }
router.post("/verdict", async (req: Request, res: Response) => {
  const { agreement_id, milestone_index } = req.body as {
    agreement_id: string;
    milestone_index: number;
  };

  if (!agreement_id || milestone_index === undefined) {
    return res
      .status(400)
      .json({ error: "agreement_id and milestone_index are required" });
  }

  try {
    const dispute = await findDispute(agreement_id, milestone_index);
    if (!dispute) {
      return res.status(404).json({ error: "Dispute not found" });
    }
    if (!dispute.party_a_submitted_at || !dispute.party_b_submitted_at) {
      return res.status(400).json({
        error:
          "Both parties must submit statements before AI arbitration can run",
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
// Arbitrator confirms or overrides AI verdict.
// Body: { agreement_id, milestone_index, arbitrator_address, action, override_reason? }
//   action: "confirm" | "override_release" | "override_refund"
//
// Response includes `on_chain_action` telling the frontend which
// Clarity function to call: "resolve-to-receiver" | "resolve-to-payer"
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
    return res.status(400).json({
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
      return res.status(400).json({
        error: "AI verdict must be generated before arbitrator can decide",
      });
    }

    // Verify this wallet is actually the arbitrator for this dispute
    if (
      dispute.contract_terms.arbitrator &&
      dispute.contract_terms.arbitrator !== arbitrator_address &&
      dispute.contract_terms.arbitrator !== "TBD"
    ) {
      return res.status(403).json({
        error: "This wallet is not the designated arbitrator for this dispute",
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
      // Frontend uses this to know which on-chain function to call
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

  const systemPrompt = `You are a neutral AI arbitration engine for ClauseAI — a Bitcoin-enforced smart contract escrow platform on Stacks.

Your role is to analyze a commercial dispute and output a structured verdict. You must be:
- STRICTLY impartial — analyze only what was agreed in writing
- Evidence-focused — weight submitted proof heavily
- Contract-literal — do not infer obligations not in written terms
- Conservative — in genuine doubt, default to refund_to_payer (buyer protection)

CRITICAL RULES:
1. Award based on contractual deliverables ONLY, not subjective quality unless quality standards were specified
2. Award based on completion, not effort
3. Deadlines are binding UNLESS both parties agreed to extension (look for evidence of this)
4. Partial completion → consider "split" verdict with reasoned percentage to receiver
5. Missing evidence from a party weakens their claim significantly
6. If Party B (receiver) claims delivery, look for proof of delivery in their evidence

You must respond ONLY with valid JSON. No markdown fences, no preamble, nothing outside the JSON object.

Required JSON shape:
{
  "verdict": "release_to_receiver" | "refund_to_payer" | "split",
  "confidence": <integer 0-100>,
  "reasoning": "<2-4 clear sentences explaining your decision>",
  "key_factors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "warnings": ["<any warnings, e.g. missing evidence, ambiguous deadline>"],
  "split_percentage": <integer 0-100, receiver gets this %, ONLY include if verdict is "split">
}`;

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

Party A Evidence (${dispute.party_a_evidence?.length ?? 0} file(s)):
${
  dispute.party_a_evidence?.length
    ? dispute.party_a_evidence
        .map((url, i) => `  [A-${i + 1}] ${url}`)
        .join("\n")
    : "  No evidence submitted"
}

=== PARTY B STATEMENT (Receiver — claiming delivery and payment) ===
${dispute.party_b_statement || "[Party B did not submit a statement]"}

Party B Evidence (${dispute.party_b_evidence?.length ?? 0} file(s)):
${
  dispute.party_b_evidence?.length
    ? dispute.party_b_evidence
        .map((url, i) => `  [B-${i + 1}] ${url}`)
        .join("\n")
    : "  No evidence submitted"
}

=== YOUR TASK ===
Based strictly on the contract terms and submitted evidence, determine:
1. Milestone deliverable was completed as specified → release_to_receiver
2. Deliverable was NOT completed or conditions not met → refund_to_payer
3. Partial completion that warrants splitting payment → split

The human arbitrator will review your recommendation and can override it.`;

  let verdictData: AIVerdict;

  try {
    const completion = await client.chat.completions.create({
      model: AI_CONFIG.model,
      max_tokens: 800,
      temperature: 0.1,
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
    // Safe fallback when AI fails — require manual review
    verdictData = {
      verdict: "refund_to_payer",
      confidence: 0,
      reasoning:
        "AI arbitration encountered a technical error. Human arbitrator must review this case manually.",
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
