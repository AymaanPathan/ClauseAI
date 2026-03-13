"use client";
// ============================================================
// components/arbitrator/ArbitratorDashboard.tsx
//
// WHAT'S REAL HERE:
//   1. Arbitrator calls callResolveToReceiver / callResolveToPayer
//      which are ACTUAL Clarity contract calls via @stacks/connect.
//      sBTC physically moves on-chain when confirmed.
//   2. After the tx is broadcast, we POST to /api/arbitrate/:id/:idx/decide
//      to record the decision in MongoDB and trigger socket events.
//   3. The tx is polled via /extended/v1/tx/:txId until confirmed.
//
// WHAT STAYS OFF-CHAIN:
//   - The AI verdict (just advisory, no on-chain component)
//   - The statement/evidence storage (MongoDB)
//   - The "override reason" text (MongoDB only)
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { callResolveToReceiver, callResolveToPayer } from "@/lib/contractCalls";
import { explorerTxUrl, NETWORK_NAME } from "@/lib/stacksConfig";
import { getConnectedUser, connectHiroWallet } from "@/lib/hiroWallet";
import { getSocket, joinDisputeRoom, leaveDisputeRoom } from "@/lib/socket";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────

type VerdictOutcome = "release_to_receiver" | "refund_to_payer" | "split";
type DisputeStatus =
  | "awaiting_statements"
  | "party_a_submitted"
  | "party_b_submitted"
  | "ai_pending"
  | "ai_complete"
  | "resolved"
  | "auto_refunded";

interface AIVerdict {
  verdict: VerdictOutcome;
  confidence: number;
  reasoning: string;
  key_factors: string[];
  warnings: string[];
  split_percentage?: number;
  generated_at: string;
  model?: string;
  latency_ms?: number;
}

interface ArbitratorDecision {
  outcome: VerdictOutcome;
  followed_ai: boolean;
  override_reason?: string;
  decided_at: string;
  arbitrator_address: string;
}

interface DisputeData {
  agreement_id: string;
  milestone_index: number;
  status: DisputeStatus;
  contract_terms: {
    payer: string;
    receiver: string;
    arbitrator: string;
    total_amount: number;
    milestone_description: string;
    milestone_percentage: number;
    milestone_deadline?: string;
    agreement_type?: string;
  };
  party_a_statement: string;
  party_a_evidence: string[];
  party_a_submitted_at?: string;
  party_b_statement: string;
  party_b_evidence: string[];
  party_b_submitted_at?: string;
  ai_verdict?: AIVerdict;
  arbitrator_decision?: ArbitratorDecision;
  opened_at: string;
  resolved_at?: string;
  updated_at: string;
}

type TxPhase = "idle" | "broadcasting" | "polling" | "confirmed" | "failed";

interface TxState {
  phase: TxPhase;
  txId: string | null;
  error: string | null;
}

// ── Helpers ───────────────────────────────────────────────────

function verdictColor(v?: string) {
  if (v === "release_to_receiver") return "#4ade80";
  if (v === "refund_to_payer") return "#f87171";
  if (v === "split") return "#fbbf24";
  return "rgba(255,255,255,0.4)";
}

function verdictLabel(v?: string) {
  if (v === "release_to_receiver") return "Release to Receiver";
  if (v === "refund_to_payer") return "Refund to Payer";
  if (v === "split") return "Split Payment";
  return "—";
}

function truncate(addr: string) {
  if (!addr || addr === "TBD") return addr;
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-5)}`;
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Poll Stacks API until tx is confirmed or failed
async function pollTx(
  txId: string,
  maxAttempts = 60,
): Promise<"success" | "failed"> {
  const baseUrl =
    NETWORK_NAME === "mainnet"
      ? "https://api.hiro.so"
      : "https://api.testnet.hiro.so";
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const res = await fetch(`${baseUrl}/extended/v1/tx/${txId}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.tx_status === "success") return "success";
      if (
        data.tx_status === "abort_by_response" ||
        data.tx_status === "abort_by_post_condition"
      )
        return "failed";
    } catch {
      // keep polling
    }
  }
  return "failed";
}

// ── Main Component ────────────────────────────────────────────

export default function ArbitratorDashboard() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // disputes assigned to this arbitrator
  const [disputes, setDisputes] = useState<DisputeData[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeDispute, setActiveDispute] = useState<DisputeData | null>(null);

  // per-dispute tx state
  const [txState, setTxState] = useState<TxState>({
    phase: "idle",
    txId: null,
    error: null,
  });

  // decision form
  const [chosenOutcome, setChosenOutcome] = useState<VerdictOutcome | null>(
    null,
  );
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverrideField, setShowOverrideField] = useState(false);

  // ── Wallet ──
  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const user = await connectHiroWallet();
      setWalletAddress(user.address);
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }, []);

  useEffect(() => {
    const user = getConnectedUser();
    if (user) setWalletAddress(user.address);
  }, []);

  // ── Fetch disputes for this arbitrator ──
  const fetchDisputes = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/arbitrate/by-arbitrator/${walletAddress}`,
      );
      if (res.ok) {
        const json = await res.json();
        setDisputes(json.disputes ?? []);
      }
    } catch {
      // swallow
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchDisputes();
    const iv = setInterval(fetchDisputes, 15_000);
    return () => clearInterval(iv);
  }, [fetchDisputes]);

  // ── Socket: refresh when dispute updates ──
  useEffect(() => {
    if (!activeDispute) return;
    const socket = getSocket();
    joinDisputeRoom(activeDispute.agreement_id, activeDispute.milestone_index);
    socket.on("dispute:updated", (payload: DisputeData) => {
      if (
        payload.agreement_id === activeDispute.agreement_id &&
        payload.milestone_index === activeDispute.milestone_index
      ) {
        setActiveDispute(payload);
      }
      fetchDisputes();
    });
    return () => {
      socket.off("dispute:updated");
      leaveDisputeRoom(
        activeDispute.agreement_id,
        activeDispute.milestone_index,
      );
    };
  }, [activeDispute, fetchDisputes]);

  // ── THE REAL ON-CHAIN RESOLUTION ──
  // This is what makes the arbitrator logic real:
  // 1. call the Clarity contract (sBTC moves)
  // 2. poll for confirmation
  // 3. record in MongoDB
  const handleResolve = useCallback(async () => {
    if (!activeDispute || !chosenOutcome || !walletAddress) return;

    const { agreement_id, milestone_index, contract_terms, ai_verdict } =
      activeDispute;

    // We need the milestone's sats amount. Try to derive it.
    const milestoneAmountSats = BigInt(
      Math.round(
        ((contract_terms.total_amount * contract_terms.milestone_percentage) /
          100) *
          1000, // testnet: 1000 sats per $1
      ),
    );

    // --- STEP 1: Broadcast on-chain tx ---
    setTxState({ phase: "broadcasting", txId: null, error: null });

    let txId: string;
    try {
      if (chosenOutcome === "release_to_receiver") {
        txId = await callResolveToReceiver(
          agreement_id,
          milestone_index,
          milestoneAmountSats,
        );
      } else if (chosenOutcome === "refund_to_payer") {
        txId = await callResolveToPayer(
          agreement_id,
          milestone_index,
          milestoneAmountSats,
        );
      } else {
        // "split" — not yet in the Clarity contract, treat as release for now
        // You'd need to call both with split amounts
        throw new Error(
          "Split is not yet implemented on-chain. Choose Release or Refund.",
        );
      }
    } catch (e: unknown) {
      setTxState({ phase: "failed", txId: null, error: (e as Error).message });
      return;
    }

    // --- STEP 2: Poll for confirmation ---
    setTxState({ phase: "polling", txId, error: null });
    const result = await pollTx(txId);

    if (result === "failed") {
      setTxState({
        phase: "failed",
        txId,
        error: "Transaction aborted on-chain. Check post conditions.",
      });
      return;
    }

    setTxState({ phase: "confirmed", txId, error: null });

    // --- STEP 3: Record decision in MongoDB ---
    // This is purely informational — the sBTC already moved on chain above.
    const followed_ai = ai_verdict?.verdict === chosenOutcome;
    try {
      await fetch(
        `${API_BASE}/api/arbitrate/${agreement_id}/${milestone_index}/decide`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outcome: chosenOutcome,
            followed_ai,
            override_reason: !followed_ai ? overrideReason : undefined,
            arbitrator_address: walletAddress,
            tx_id: txId,
          }),
        },
      );
    } catch {
      // DB write failing doesn't matter — sBTC already moved
      console.warn("Failed to record decision in DB (chain tx succeeded)");
    }

    // Refresh
    await fetchDisputes();
  }, [
    activeDispute,
    chosenOutcome,
    walletAddress,
    overrideReason,
    fetchDisputes,
  ]);

  // ── Derived ──
  const isResolved =
    activeDispute?.status === "resolved" ||
    activeDispute?.status === "auto_refunded" ||
    !!activeDispute?.arbitrator_decision;

  const canDecide =
    activeDispute?.status === "ai_complete" ||
    (activeDispute?.status === "party_b_submitted" && !isResolved);

  const actionable = disputes.filter(
    (d) =>
      d.status === "ai_complete" ||
      d.status === "party_b_submitted" ||
      d.status === "party_a_submitted",
  );
  const resolved = disputes.filter(
    (d) => d.status === "resolved" || d.status === "auto_refunded",
  );

  // ── Render ────────────────────────────────────────────────
  return (
    <div>
      <style>{css}</style>

      {/* Topbar */}
      <header className="arb-topbar">
        <div className="arb-topbar-left">
          <a className="arb-brand" href="/">
            <span className="arb-brand-mark">⚖</span>
            <span className="arb-brand-name">ClauseAI</span>
          </a>
          <div className="arb-topbar-sep" />
          <span className="arb-topbar-label">Arbitrator Portal</span>
          <span className="arb-network-badge">{NETWORK_NAME}</span>
        </div>
        <div className="arb-topbar-right">
          {walletAddress ? (
            <div className="arb-wallet-pill">
              <span className="arb-wallet-dot" />
              <span className="arb-wallet-addr">{truncate(walletAddress)}</span>
            </div>
          ) : (
            <button
              className="arb-connect-btn"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? <span className="arb-spinner" /> : "Connect Wallet"}
            </button>
          )}
        </div>
      </header>

      <div className="arb-shell">
        {/* Sidebar: dispute list */}
        <aside className="arb-sidebar">
          <div className="arb-sidebar-head">
            <span className="arb-sidebar-label">Your Disputes</span>
            {loading && <span className="arb-spinner-xs" />}
          </div>

          {!walletAddress && (
            <div className="arb-empty">
              Connect your wallet to see assigned disputes.
            </div>
          )}

          {walletAddress && !loading && disputes.length === 0 && (
            <div className="arb-empty">
              No disputes assigned to your address.
            </div>
          )}

          {actionable.length > 0 && (
            <div className="arb-group">
              <div className="arb-group-label">Needs Action</div>
              {actionable.map((d) => (
                <DisputeRow
                  key={`${d.agreement_id}:${d.milestone_index}`}
                  dispute={d}
                  active={
                    activeDispute?.agreement_id === d.agreement_id &&
                    activeDispute?.milestone_index === d.milestone_index
                  }
                  onClick={() => {
                    setActiveDispute(d);
                    setTxState({ phase: "idle", txId: null, error: null });
                    setChosenOutcome(null);
                    setOverrideReason("");
                    setShowOverrideField(false);
                  }}
                />
              ))}
            </div>
          )}

          {resolved.length > 0 && (
            <div className="arb-group">
              <div className="arb-group-label">Resolved</div>
              {resolved.map((d) => (
                <DisputeRow
                  key={`${d.agreement_id}:${d.milestone_index}`}
                  dispute={d}
                  active={
                    activeDispute?.agreement_id === d.agreement_id &&
                    activeDispute?.milestone_index === d.milestone_index
                  }
                  onClick={() => {
                    setActiveDispute(d);
                    setTxState({ phase: "idle", txId: null, error: null });
                    setChosenOutcome(null);
                  }}
                />
              ))}
            </div>
          )}
        </aside>

        {/* Main panel */}
        <main className="arb-main">
          {!activeDispute ? (
            <div className="arb-placeholder">
              <div className="arb-placeholder-icon">⚖</div>
              <div className="arb-placeholder-title">Select a dispute</div>
              <div className="arb-placeholder-body">
                Choose a dispute from the sidebar to review statements and issue
                a binding on-chain resolution.
              </div>
            </div>
          ) : (
            <DisputePanel
              dispute={activeDispute}
              walletAddress={walletAddress}
              txState={txState}
              chosenOutcome={chosenOutcome}
              setChosenOutcome={setChosenOutcome}
              overrideReason={overrideReason}
              setOverrideReason={setOverrideReason}
              showOverrideField={showOverrideField}
              setShowOverrideField={setShowOverrideField}
              canDecide={canDecide}
              isResolved={isResolved}
              onResolve={handleResolve}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ── Dispute Row (sidebar) ─────────────────────────────────────

function DisputeRow({
  dispute,
  active,
  onClick,
}: {
  dispute: DisputeData;
  active: boolean;
  onClick: () => void;
}) {
  const needsAction =
    dispute.status === "ai_complete" || dispute.status === "party_b_submitted";
  const resolved =
    dispute.status === "resolved" || dispute.status === "auto_refunded";

  return (
    <button
      className={`arb-dispute-row${active ? " arb-dispute-row--active" : ""}`}
      onClick={onClick}
    >
      <div
        className="arb-row-dot"
        style={{
          background: resolved
            ? "#4ade80"
            : needsAction
              ? "#fbbf24"
              : "rgba(255,255,255,0.15)",
        }}
      />
      <div className="arb-row-body">
        <div className="arb-row-id">#{dispute.agreement_id.slice(0, 14)}…</div>
        <div className="arb-row-ms">
          MS {dispute.milestone_index} ·{" "}
          {dispute.contract_terms.milestone_percentage}%
        </div>
      </div>
      {needsAction && !resolved && <span className="arb-row-action-dot" />}
    </button>
  );
}

// ── Main dispute panel ────────────────────────────────────────

function DisputePanel({
  dispute,
  walletAddress,
  txState,
  chosenOutcome,
  setChosenOutcome,
  overrideReason,
  setOverrideReason,
  showOverrideField,
  setShowOverrideField,
  canDecide,
  isResolved,
  onResolve,
}: {
  dispute: DisputeData;
  walletAddress: string | null;
  txState: TxState;
  chosenOutcome: VerdictOutcome | null;
  setChosenOutcome: (v: VerdictOutcome | null) => void;
  overrideReason: string;
  setOverrideReason: (s: string) => void;
  showOverrideField: boolean;
  setShowOverrideField: (b: boolean) => void;
  canDecide: boolean;
  isResolved: boolean;
  onResolve: () => void;
}) {
  const ct = dispute.contract_terms;
  const aiV = dispute.ai_verdict;
  const arbD = dispute.arbitrator_decision;
  const isOverride = chosenOutcome && aiV && chosenOutcome !== aiV.verdict;

  return (
    <div className="arb-panel">
      {/* Header */}
      <div className="arb-panel-header">
        <div>
          <div className="arb-panel-eyebrow">Dispute Review</div>
          <div className="arb-panel-title">
            Agreement{" "}
            <span className="arb-panel-id">#{dispute.agreement_id}</span>
          </div>
          <div className="arb-panel-sub">
            Milestone {dispute.milestone_index}
          </div>
        </div>
        <StatusBadge status={dispute.status} />
      </div>

      {/* Contract terms */}
      <div className="arb-terms-grid">
        {[
          { k: "Payer", v: truncate(ct.payer) },
          { k: "Receiver", v: truncate(ct.receiver) },
          { k: "Milestone", v: `${ct.milestone_percentage}%` },
          {
            k: "Value",
            v: `≈ $${((ct.total_amount * ct.milestone_percentage) / 100).toFixed(2)}`,
          },
          { k: "Type", v: ct.agreement_type ?? "freelance" },
          { k: "Opened", v: fmtDate(dispute.opened_at) },
        ].map(({ k, v }) => (
          <div key={k} className="arb-terms-cell">
            <div className="arb-terms-key">{k}</div>
            <div className="arb-terms-val">{v}</div>
          </div>
        ))}
      </div>

      {/* Milestone description */}
      <div className="arb-desc-block">
        <div className="arb-desc-label">Milestone Description</div>
        <p className="arb-desc-text">{ct.milestone_description}</p>
      </div>

      {/* Statements */}
      <div className="arb-stmts-head">Statements</div>
      <div className="arb-stmts-grid">
        <StatementBlock
          label="Payer (Party A)"
          accent="#60a5fa"
          statement={dispute.party_a_statement}
          evidence={dispute.party_a_evidence ?? []}
          submittedAt={dispute.party_a_submitted_at}
        />
        <StatementBlock
          label="Receiver (Party B)"
          accent="#4ade80"
          statement={dispute.party_b_statement}
          evidence={dispute.party_b_evidence ?? []}
          submittedAt={dispute.party_b_submitted_at}
        />
      </div>

      {/* AI Verdict */}
      {aiV && <AIVerdictBlock verdict={aiV} />}

      {/* Awaiting both statements */}
      {!dispute.party_a_submitted_at && !dispute.party_b_submitted_at && (
        <div className="arb-notice arb-notice--warn">
          Neither party has submitted their statement yet.
        </div>
      )}
      {(dispute.party_a_submitted_at || dispute.party_b_submitted_at) &&
        !(dispute.party_a_submitted_at && dispute.party_b_submitted_at) && (
          <div className="arb-notice arb-notice--warn">
            Only one party has submitted. You may decide now or wait for both
            statements.
          </div>
        )}

      {/* ── DECISION SECTION ── */}
      {!isResolved && canDecide && (
        <div className="arb-decision-section">
          <div className="arb-decision-title">
            <span>⚖</span> Issue Binding On-Chain Decision
          </div>
          <p className="arb-decision-body">
            Your decision will call the smart contract directly. sBTC will be
            transferred immediately when the transaction confirms on Stacks.
            This action is irreversible.
          </p>

          {/* Outcome picker */}
          <div className="arb-outcome-grid">
            {(
              [
                {
                  v: "release_to_receiver" as VerdictOutcome,
                  label: "Release to Receiver",
                  sub: "sBTC → Party B",
                  color: "#4ade80",
                },
                {
                  v: "refund_to_payer" as VerdictOutcome,
                  label: "Refund to Payer",
                  sub: "sBTC → Party A",
                  color: "#f87171",
                },
              ] as const
            ).map(({ v, label, sub, color }) => {
              const isAI = aiV?.verdict === v;
              const selected = chosenOutcome === v;
              return (
                <button
                  key={v}
                  className={`arb-outcome-btn${selected ? " arb-outcome-btn--selected" : ""}`}
                  style={
                    selected
                      ? {
                          borderColor: color,
                          background: color + "12",
                          color,
                        }
                      : {}
                  }
                  onClick={() => {
                    setChosenOutcome(v);
                    setShowOverrideField(isAI ? false : true);
                  }}
                >
                  <div className="arb-outcome-label">{label}</div>
                  <div className="arb-outcome-sub">{sub}</div>
                  {isAI && <span className="arb-ai-rec">AI Recommends</span>}
                  {selected && (
                    <div className="arb-outcome-check" style={{ color }}>
                      ✓
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Override reason */}
          {isOverride && showOverrideField && (
            <div className="arb-override-wrap">
              <label className="arb-override-label">
                Override Reason{" "}
                <span className="arb-override-hint">
                  (required when overriding AI)
                </span>
              </label>
              <textarea
                className="arb-override-input"
                placeholder="Explain why you're overriding the AI recommendation…"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
              />
            </div>
          )}

          {/* TX status */}
          {txState.phase !== "idle" && <TxStatusBlock txState={txState} />}

          {/* Confirm button */}
          {txState.phase === "idle" || txState.phase === "failed" ? (
            <button
              className="arb-confirm-btn"
              disabled={
                !chosenOutcome ||
                !walletAddress ||
                (!!isOverride && showOverrideField && !overrideReason.trim())
              }
              onClick={onResolve}
            >
              {txState.phase === "failed" ? (
                "Retry On-Chain Resolution"
              ) : chosenOutcome ? (
                <>
                  Confirm: {verdictLabel(chosenOutcome)} →{" "}
                  <span style={{ opacity: 0.65, fontSize: 12 }}>
                    broadcasts on Stacks
                  </span>
                </>
              ) : (
                "Select an outcome above"
              )}
            </button>
          ) : null}
        </div>
      )}

      {/* Already resolved */}
      {isResolved && arbD && <ResolvedBlock decision={arbD} aiVerdict={aiV} />}

      {/* Pending AI */}
      {dispute.status === "ai_pending" && (
        <div className="arb-notice arb-notice--info">
          <span className="arb-spinner-amber" />
          AI is analyzing statements… Usually 5–15 seconds.
        </div>
      )}

      {/* Awaiting statements */}
      {(dispute.status === "awaiting_statements" ||
        dispute.status === "party_a_submitted") && (
        <div className="arb-notice arb-notice--info">
          Waiting for both parties to submit statements before AI analysis can
          begin.
        </div>
      )}
    </div>
  );
}

// ── Sub-blocks ────────────────────────────────────────────────

function StatementBlock({
  label,
  accent,
  statement,
  evidence,
  submittedAt,
}: {
  label: string;
  accent: string;
  statement: string;
  evidence: string[];
  submittedAt?: string;
}) {
  return (
    <div className="arb-stmt" style={{ borderColor: accent + "25" }}>
      <div
        className="arb-stmt-head"
        style={{ background: accent + "08", borderColor: accent + "18" }}
      >
        <div
          className="arb-stmt-avatar"
          style={{
            background: accent + "15",
            border: `1px solid ${accent}30`,
            color: accent,
          }}
        >
          {label[0]}
        </div>
        <span className="arb-stmt-label">{label}</span>
        {submittedAt ? (
          <span className="arb-stmt-filed">✓ Filed {fmtDate(submittedAt)}</span>
        ) : (
          <span className="arb-stmt-pending">Pending</span>
        )}
      </div>
      <div className="arb-stmt-body">
        {statement ? (
          <p className="arb-stmt-text">{statement}</p>
        ) : (
          <p className="arb-stmt-empty">No statement submitted yet.</p>
        )}
        {evidence.length > 0 && (
          <div className="arb-evidence-list">
            <div className="arb-evidence-label">
              Evidence ({evidence.length})
            </div>
            {evidence.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="arb-evidence-item"
                style={{ borderColor: accent + "20", color: accent }}
              >
                📎 {url.split("/").pop() ?? url} ↗
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AIVerdictBlock({ verdict }: { verdict: AIVerdict }) {
  const vc = verdictColor(verdict.verdict);
  return (
    <div className="arb-ai-block" style={{ borderColor: vc + "30" }}>
      <div
        className="arb-ai-head"
        style={{ background: vc + "06", borderColor: vc + "18" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>🤖</span>
          <span className="arb-ai-title">AI Advisory Verdict</span>
          <span className="arb-ai-advisory">(advisory only — not binding)</span>
        </div>
        <span className="arb-ai-model">
          {verdict.model ?? "claude"}{" "}
          {verdict.latency_ms
            ? `· ${(verdict.latency_ms / 1000).toFixed(1)}s`
            : ""}
        </span>
      </div>
      <div className="arb-ai-body">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span
            className="arb-ai-pill"
            style={{ color: vc, background: vc + "10", borderColor: vc + "28" }}
          >
            {verdictLabel(verdict.verdict)}
          </span>
          <div className="arb-conf-row">
            <span className="arb-conf-label">Confidence</span>
            <div className="arb-conf-track">
              <div
                className="arb-conf-fill"
                style={{
                  width: `${verdict.confidence}%`,
                  background:
                    verdict.confidence >= 70
                      ? "#4ade80"
                      : verdict.confidence >= 40
                        ? "#fbbf24"
                        : "#f87171",
                }}
              />
            </div>
            <span className="arb-conf-label">{verdict.confidence}%</span>
          </div>
        </div>

        <p className="arb-ai-reasoning">{verdict.reasoning}</p>

        {verdict.key_factors.length > 0 && (
          <div>
            <div className="arb-ai-sublabel">Key Factors</div>
            {verdict.key_factors.map((f, i) => (
              <div key={i} className="arb-ai-factor">
                <span style={{ color: vc }}>→</span> {f}
              </div>
            ))}
          </div>
        )}

        {verdict.warnings.length > 0 && (
          <div>
            <div className="arb-ai-sublabel" style={{ color: "#fbbf24" }}>
              ⚠ Warnings
            </div>
            {verdict.warnings.map((w, i) => (
              <div key={i} className="arb-ai-factor arb-ai-warn">
                ⚠ {w}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TxStatusBlock({ txState }: { txState: TxState }) {
  const { phase, txId, error } = txState;
  return (
    <div className={`arb-tx-status arb-tx-status--${phase}`}>
      {phase === "broadcasting" && (
        <>
          <span className="arb-spinner-sm" />
          <span>Broadcasting transaction via Leather wallet…</span>
        </>
      )}
      {phase === "polling" && txId && (
        <>
          <span className="arb-spinner-sm" />
          <span>
            Confirming on Stacks…{" "}
            <a
              href={explorerTxUrl(txId)}
              target="_blank"
              rel="noopener noreferrer"
              className="arb-tx-link"
            >
              {txId.slice(0, 14)}… ↗
            </a>
          </span>
        </>
      )}
      {phase === "confirmed" && txId && (
        <>
          <span style={{ color: "#4ade80" }}>✓</span>
          <span>
            Confirmed.{" "}
            <a
              href={explorerTxUrl(txId)}
              target="_blank"
              rel="noopener noreferrer"
              className="arb-tx-link"
            >
              View on Explorer ↗
            </a>
          </span>
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
            sBTC has been transferred on-chain.
          </span>
        </>
      )}
      {phase === "failed" && (
        <>
          <span style={{ color: "#f87171" }}>⚠</span>
          <span style={{ color: "#f87171" }}>
            {error ?? "Transaction failed"}
          </span>
          {txId && (
            <a
              href={explorerTxUrl(txId)}
              target="_blank"
              rel="noopener noreferrer"
              className="arb-tx-link"
            >
              View details ↗
            </a>
          )}
        </>
      )}
    </div>
  );
}

function ResolvedBlock({
  decision,
  aiVerdict,
}: {
  decision: ArbitratorDecision;
  aiVerdict?: AIVerdict;
}) {
  const dc = verdictColor(decision.outcome);
  return (
    <div
      className="arb-resolved"
      style={{ borderColor: dc + "30", background: dc + "06" }}
    >
      <div className="arb-resolved-title">⚖ Dispute Resolved On-Chain</div>
      <div className="arb-resolved-outcome" style={{ color: dc }}>
        {verdictLabel(decision.outcome)}
      </div>
      <div className="arb-resolved-meta">
        <span>
          {decision.followed_ai
            ? "✓ Followed AI recommendation"
            : "↺ Overrode AI recommendation"}
        </span>
        <span>·</span>
        <span>{fmtDate(decision.decided_at)}</span>
        <span>·</span>
        <span>{truncate(decision.arbitrator_address)}</span>
      </div>
      {decision.override_reason && (
        <p className="arb-resolved-reason">
          Override reason: {decision.override_reason}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: DisputeStatus }) {
  const map: Record<DisputeStatus, { label: string; color: string }> = {
    awaiting_statements: {
      label: "Awaiting Statements",
      color: "rgba(255,255,255,0.35)",
    },
    party_a_submitted: { label: "Payer Filed", color: "#60a5fa" },
    party_b_submitted: { label: "Both Filed", color: "#fbbf24" },
    ai_pending: { label: "AI Analyzing…", color: "#fbbf24" },
    ai_complete: { label: "AI Ready · Action Required", color: "#fbbf24" },
    resolved: { label: "Resolved", color: "#4ade80" },
    auto_refunded: { label: "Auto-Refunded", color: "#4ade80" },
  };
  const m = map[status] ?? { label: status, color: "rgba(255,255,255,0.35)" };
  return (
    <span
      className="arb-status-badge"
      style={{
        color: m.color,
        borderColor: m.color + "35",
        background: m.color + "10",
      }}
    >
      {status === "ai_pending" && <span className="arb-spinner-xs-amber" />}
      {m.label}
    </span>
  );
}

// ── CSS ───────────────────────────────────────────────────────
const css = `
/* ── Reset / base ── */
* { box-sizing: border-box; }

/* ── Topbar ── */
.arb-topbar {
  position: sticky; top: 0; z-index: 100;
  height: 52px; background: #0c0c0c;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px; gap: 12px;
  font-family: 'DM Mono', 'Roboto Mono', monospace;
}
.arb-topbar-left  { display: flex; align-items: center; gap: 10px; }
.arb-topbar-right { display: flex; align-items: center; gap: 10px; }
.arb-topbar-sep   { width: 1px; height: 14px; background: rgba(255,255,255,0.08); margin: 0 4px; }
.arb-topbar-label { font-size: 11px; color: rgba(255,255,255,0.40); }

.arb-brand { display: flex; align-items: center; gap: 8px; text-decoration: none; }
.arb-brand-mark {
  width: 26px; height: 26px; border-radius: 5px;
  background: #fbbf24; display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: #0c0c0c; font-weight: 900; flex-shrink: 0;
}
.arb-brand-name {
  font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 800;
  color: #ffffff; letter-spacing: -0.02em;
}

.arb-network-badge {
  font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.10em;
  color: #fbbf24; border: 1px solid rgba(251,191,36,0.25);
  border-radius: 3px; padding: 2px 7px;
}

.arb-wallet-pill {
  display: flex; align-items: center; gap: 6px;
  border: 1px solid rgba(255,255,255,0.10); border-radius: 4px; padding: 4px 10px;
}
.arb-wallet-dot  { width: 5px; height: 5px; border-radius: 50%; background: #fbbf24; flex-shrink: 0; }
.arb-wallet-addr { font-size: 10px; color: rgba(255,255,255,0.45); }

.arb-connect-btn {
  padding: 6px 16px; border-radius: 4px; cursor: pointer;
  background: #fbbf24; color: #0c0c0c; border: none;
  font-size: 11px; font-weight: 700; font-family: 'DM Mono', monospace;
  display: flex; align-items: center; gap: 6px;
}
.arb-connect-btn:hover { background: #fcd34d; }
.arb-connect-btn:disabled { opacity: 0.55; cursor: not-allowed; }

/* ── Shell ── */
.arb-shell {
  display: flex; min-height: calc(100vh - 52px); background: #0c0c0c;
}

/* ── Sidebar ── */
.arb-sidebar {
  width: 240px; flex-shrink: 0;
  background: #0e0e0e; border-right: 1px solid rgba(255,255,255,0.07);
  padding: 16px 0;
  position: sticky; top: 52px; height: calc(100vh - 52px); overflow-y: auto;
}
.arb-sidebar-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 14px 10px; margin-bottom: 4px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.arb-sidebar-label {
  font-size: 9px; font-family: 'DM Mono', monospace;
  color: rgba(255,255,255,0.22); text-transform: uppercase; letter-spacing: 0.12em;
}
.arb-empty {
  padding: 16px 14px;
  font-size: 11px; color: rgba(255,255,255,0.28);
  font-family: 'DM Mono', monospace; line-height: 1.6;
}

.arb-group { padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.arb-group-label {
  padding: 0 14px 6px;
  font-size: 8px; font-family: 'DM Mono', monospace;
  color: rgba(255,255,255,0.18); text-transform: uppercase; letter-spacing: 0.12em;
}

.arb-dispute-row {
  width: 100%; display: flex; align-items: center; gap: 10px;
  padding: 8px 14px; text-align: left; background: none; border: none; cursor: pointer;
  transition: background 0.12s;
}
.arb-dispute-row:hover    { background: rgba(255,255,255,0.04); }
.arb-dispute-row--active  { background: rgba(251,191,36,0.07); }

.arb-row-dot  { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.arb-row-body { flex: 1; min-width: 0; }
.arb-row-id   {
  font-size: 10px; font-family: 'DM Mono', monospace;
  color: rgba(255,255,255,0.65); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.arb-row-ms   { font-size: 9px; color: rgba(255,255,255,0.28); font-family: 'DM Mono', monospace; margin-top: 2px; }
.arb-row-action-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #fbbf24;
  flex-shrink: 0; animation: arbPulse 2s ease infinite;
}

/* ── Main ── */
.arb-main {
  flex: 1; min-width: 0; overflow-y: auto;
}

.arb-placeholder {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: calc(100vh - 52px); gap: 12px;
  text-align: center; padding: 32px;
}
.arb-placeholder-icon { font-size: 32px; opacity: 0.2; }
.arb-placeholder-title {
  font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 800;
  color: rgba(255,255,255,0.40); letter-spacing: -0.03em;
}
.arb-placeholder-body { font-size: 12px; color: rgba(255,255,255,0.20); max-width: 340px; line-height: 1.7; }

/* ── Panel ── */
.arb-panel {
  padding: 36px 48px 72px; display: flex; flex-direction: column; gap: 20px;
  max-width: 860px;
}

.arb-panel-header { display: flex; justify-content: space-between; align-items: flex-start; }
.arb-panel-eyebrow {
  font-size: 9px; font-family: 'DM Mono', monospace; color: #fbbf24;
  text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 6px;
}
.arb-panel-title {
  font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 800;
  color: #ffffff; letter-spacing: -0.04em;
}
.arb-panel-id   { color: rgba(255,255,255,0.40); }
.arb-panel-sub  { font-size: 11px; font-family: 'DM Mono', monospace; color: rgba(255,255,255,0.28); margin-top: 4px; }

.arb-status-badge {
  font-size: 9px; font-family: 'DM Mono', monospace; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.07em;
  border: 1px solid; border-radius: 3px; padding: 3px 9px;
  display: flex; align-items: center; gap: 5px; flex-shrink: 0;
  white-space: nowrap;
}

/* Terms grid */
.arb-terms-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  border: 1px solid rgba(255,255,255,0.07);
}
.arb-terms-cell {
  padding: 12px 14px;
  border-right: 1px solid rgba(255,255,255,0.06);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.arb-terms-key { font-size: 8px; font-family: 'DM Mono', monospace; color: rgba(255,255,255,0.25); text-transform: uppercase; letter-spacing: 0.10em; margin-bottom: 4px; }
.arb-terms-val { font-size: 12px; font-family: 'DM Mono', monospace; color: rgba(255,255,255,0.75); font-weight: 600; }

/* Description */
.arb-desc-block { border: 1px solid rgba(255,255,255,0.07); padding: 14px 16px; }
.arb-desc-label {
  font-size: 8px; font-family: 'DM Mono', monospace; color: rgba(255,255,255,0.25);
  text-transform: uppercase; letter-spacing: 0.10em; margin-bottom: 6px;
}
.arb-desc-text { font-size: 13px; color: rgba(255,255,255,0.55); line-height: 1.7; margin: 0; }

/* Statements */
.arb-stmts-head {
  font-size: 9px; font-family: 'DM Mono', monospace;
  color: rgba(255,255,255,0.25); text-transform: uppercase; letter-spacing: 0.10em;
}
.arb-stmts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
@media (max-width: 700px) { .arb-stmts-grid { grid-template-columns: 1fr; } }

.arb-stmt { border: 1px solid; overflow: hidden; }
.arb-stmt-head {
  display: flex; align-items: center; gap: 9px;
  padding: 10px 12px; border-bottom: 1px solid;
}
.arb-stmt-avatar {
  width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-family: 'DM Mono', monospace; font-weight: 800;
}
.arb-stmt-label { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.78); flex: 1; font-family: 'DM Sans', sans-serif; }
.arb-stmt-filed {
  font-size: 9px; font-family: 'DM Mono', monospace; color: #4ade80;
  background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.20);
  border-radius: 3px; padding: 2px 6px; flex-shrink: 0;
}
.arb-stmt-pending {
  font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(255,255,255,0.28);
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 3px; padding: 2px 6px; flex-shrink: 0;
}
.arb-stmt-body  { padding: 12px; }
.arb-stmt-text  { font-size: 12px; color: rgba(255,255,255,0.55); line-height: 1.68; margin: 0; }
.arb-stmt-empty { font-size: 11px; color: rgba(255,255,255,0.20); font-style: italic; margin: 0; }

/* Evidence */
.arb-evidence-list  { margin-top: 10px; }
.arb-evidence-label {
  font-size: 8px; font-family: 'DM Mono', monospace; color: rgba(255,255,255,0.25);
  text-transform: uppercase; letter-spacing: 0.10em; margin-bottom: 4px;
}
.arb-evidence-item {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 8px; border: 1px solid; border-radius: 4px;
  text-decoration: none; font-size: 9px; font-family: 'DM Mono', monospace;
  background: rgba(255,255,255,0.02); margin-bottom: 3px;
  transition: background 0.12s;
}
.arb-evidence-item:hover { background: rgba(255,255,255,0.05); }

/* AI block */
.arb-ai-block { border: 1px solid; overflow: hidden; }
.arb-ai-head  {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 13px; border-bottom: 1px solid;
}
.arb-ai-title    { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.75); font-family: 'DM Sans', sans-serif; }
.arb-ai-advisory { font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(255,255,255,0.25); }
.arb-ai-model    { font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(255,255,255,0.25); }
.arb-ai-body     { padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.arb-ai-pill {
  display: inline-flex; align-items: center;
  font-size: 11px; font-family: 'DM Mono', monospace; font-weight: 700;
  border: 1px solid; border-radius: 4px; padding: 3px 10px;
}
.arb-ai-reasoning { font-size: 12px; color: rgba(255,255,255,0.50); line-height: 1.7; margin: 0; }
.arb-ai-sublabel  {
  font-size: 8px; font-family: 'DM Mono', monospace; color: rgba(255,255,255,0.25);
  text-transform: uppercase; letter-spacing: 0.10em; margin-bottom: 4px;
}
.arb-ai-factor { font-size: 11px; color: rgba(255,255,255,0.45); line-height: 1.6; display: flex; gap: 5px; }
.arb-ai-warn   { color: rgba(251,191,36,0.65); }
.arb-ai-rec    {
  font-size: 8px; font-family: 'DM Mono', monospace; font-weight: 700;
  color: #fbbf24; background: rgba(251,191,36,0.10);
  border: 1px solid rgba(251,191,36,0.22); border-radius: 3px; padding: 1px 6px;
  position: absolute; top: 8px; left: 8px;
}
.arb-conf-row    { display: flex; align-items: center; gap: 6px; }
.arb-conf-label  { font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(255,255,255,0.30); }
.arb-conf-track  { width: 64px; height: 2px; background: rgba(255,255,255,0.07); border-radius: 1px; overflow: hidden; }
.arb-conf-fill   { height: 100%; border-radius: 1px; transition: width 0.8s; }

/* Decision section */
.arb-decision-section {
  border: 1px solid rgba(251,191,36,0.18);
  padding: 20px; display: flex; flex-direction: column; gap: 14px;
  background: rgba(251,191,36,0.02);
}
.arb-decision-title {
  font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 800;
  color: #ffffff; letter-spacing: -0.02em;
  display: flex; align-items: center; gap: 8px;
}
.arb-decision-body { font-size: 12px; color: rgba(255,255,255,0.40); line-height: 1.7; margin: 0; }

/* Outcome grid */
.arb-outcome-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.arb-outcome-btn {
  padding: 14px 16px; border-radius: 4px; text-align: left; cursor: pointer;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.10);
  color: rgba(255,255,255,0.50); transition: all 0.15s; position: relative;
}
.arb-outcome-btn:hover { border-color: rgba(255,255,255,0.22); color: rgba(255,255,255,0.80); }
.arb-outcome-btn--selected { }
.arb-outcome-label { font-size: 13px; font-weight: 600; font-family: 'DM Sans', sans-serif; margin-bottom: 3px; }
.arb-outcome-sub   { font-size: 10px; font-family: 'DM Mono', monospace; opacity: 0.55; }
.arb-outcome-check { position: absolute; top: 12px; right: 12px; font-size: 14px; font-weight: 700; }

/* Override reason */
.arb-override-wrap { display: flex; flex-direction: column; gap: 6px; }
.arb-override-label {
  font-size: 9px; font-family: 'DM Mono', monospace; color: rgba(255,255,255,0.35);
  text-transform: uppercase; letter-spacing: 0.10em;
}
.arb-override-hint { color: rgba(255,255,255,0.22); font-size: 9px; text-transform: none; letter-spacing: 0; }
.arb-override-input {
  width: 100%; padding: 10px 12px; border-radius: 4px; resize: vertical;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.80); font-size: 12px; font-family: 'DM Sans', sans-serif;
  outline: none; line-height: 1.6;
}
.arb-override-input:focus { border-color: rgba(251,191,36,0.35); }

/* TX status */
.arb-tx-status {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 11px 14px; border: 1px solid; border-radius: 4px;
  font-size: 12px; font-family: 'DM Mono', monospace;
}
.arb-tx-status--broadcasting { border-color: rgba(255,255,255,0.10); color: rgba(255,255,255,0.55); }
.arb-tx-status--polling       { border-color: rgba(251,191,36,0.20); color: rgba(255,255,255,0.55); }
.arb-tx-status--confirmed     { border-color: rgba(74,222,128,0.25); color: rgba(255,255,255,0.65); }
.arb-tx-status--failed        { border-color: rgba(248,113,113,0.25); color: rgba(248,113,113,0.80); }
.arb-tx-link {
  color: inherit; text-decoration: underline; opacity: 0.75;
}
.arb-tx-link:hover { opacity: 1; }

/* Confirm button */
.arb-confirm-btn {
  padding: 12px 24px; border-radius: 4px; cursor: pointer;
  background: #fbbf24; color: #0c0c0c; border: none;
  font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 800;
  letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px;
  width: 100%; justify-content: center;
  transition: background 0.14s;
}
.arb-confirm-btn:hover:not(:disabled) { background: #fcd34d; }
.arb-confirm-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* Resolved block */
.arb-resolved { border: 1px solid; border-radius: 6px; padding: 16px; }
.arb-resolved-title  { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.55); margin-bottom: 6px; }
.arb-resolved-outcome {
  font-family: 'DM Mono', monospace; font-size: 16px; font-weight: 700;
  margin-bottom: 8px;
}
.arb-resolved-meta {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  font-size: 10px; font-family: 'DM Mono', monospace; color: rgba(255,255,255,0.30);
}
.arb-resolved-reason {
  font-size: 11px; color: rgba(255,255,255,0.40); margin: 8px 0 0;
  font-style: italic; line-height: 1.6;
}

/* Notices */
.arb-notice {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px; border: 1px solid; border-radius: 4px;
  font-size: 12px; font-family: 'DM Mono', monospace; line-height: 1.7;
}
.arb-notice--warn { border-color: rgba(251,191,36,0.18); color: rgba(255,255,255,0.45); background: rgba(251,191,36,0.02); }
.arb-notice--info { border-color: rgba(255,255,255,0.08); color: rgba(255,255,255,0.35); }

/* Spinners */
.arb-spinner {
  display: inline-block; width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid rgba(0,0,0,0.2); border-top-color: #0c0c0c;
  animation: arbSpin 0.65s linear infinite;
}
.arb-spinner-xs {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.10); border-top-color: rgba(255,255,255,0.55);
  animation: arbSpin 0.65s linear infinite;
}
.arb-spinner-xs-amber {
  display: inline-block; width: 7px; height: 7px; border-radius: 50%;
  border: 1.5px solid rgba(251,191,36,0.15); border-top-color: #fbbf24;
  animation: arbSpin 0.65s linear infinite;
}
.arb-spinner-sm {
  display: inline-block; width: 11px; height: 11px; border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.12); border-top-color: rgba(255,255,255,0.65);
  animation: arbSpin 0.65s linear infinite; flex-shrink: 0;
}
.arb-spinner-amber {
  display: inline-block; width: 11px; height: 11px; border-radius: 50%;
  border: 1.5px solid rgba(251,191,36,0.15); border-top-color: #fbbf24;
  animation: arbSpin 0.65s linear infinite; flex-shrink: 0;
}

@keyframes arbSpin  { to { transform: rotate(360deg); } }
@keyframes arbPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(0.8); } }

/* Responsive */
@media (max-width: 900px) {
  .arb-sidebar { display: none; }
  .arb-panel   { padding: 24px 20px 48px; }
}
@media (max-width: 600px) {
  .arb-terms-grid   { grid-template-columns: 1fr 1fr; }
  .arb-outcome-grid { grid-template-columns: 1fr; }
}
`;
