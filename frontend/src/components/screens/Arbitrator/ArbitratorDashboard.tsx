"use client";

import { useEffect, useState, useCallback } from "react";
import { callResolveToReceiver, callResolveToPayer } from "@/lib/contractCalls";
import { explorerTxUrl, NETWORK_NAME } from "@/lib/stacksConfig";
import { getConnectedUser, connectHiroWallet } from "@/lib/hiroWallet";
import { getSocket, joinDisputeRoom, leaveDisputeRoom } from "@/lib/socket";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

function verdictColor(v?: string) {
  if (v === "release_to_receiver") return "#f5c518";
  if (v === "refund_to_payer") return "rgba(245,197,24,0.55)";
  if (v === "split") return "#f5c518";
  return "rgba(255,255,255,0.20)";
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
      /* keep polling */
    }
  }
  return "failed";
}

export default function ArbitratorDashboard() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disputes, setDisputes] = useState<DisputeData[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeDispute, setActiveDispute] = useState<DisputeData | null>(null);
  const [txState, setTxState] = useState<TxState>({
    phase: "idle",
    txId: null,
    error: null,
  });
  const [chosenOutcome, setChosenOutcome] = useState<VerdictOutcome | null>(
    null,
  );
  const [decisionNote, setDecisionNote] = useState("");

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
      /* swallow */
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchDisputes();
    const iv = setInterval(fetchDisputes, 15_000);
    return () => clearInterval(iv);
  }, [fetchDisputes]);

  useEffect(() => {
    if (!activeDispute) return;
    const socket = getSocket();
    joinDisputeRoom(activeDispute.agreement_id, activeDispute.milestone_index);
    socket.on("dispute:updated", (payload: DisputeData) => {
      if (
        payload.agreement_id === activeDispute.agreement_id &&
        payload.milestone_index === activeDispute.milestone_index
      )
        setActiveDispute(payload);
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

  const handleResolve = useCallback(async () => {
    if (
      !activeDispute ||
      !chosenOutcome ||
      !walletAddress ||
      !decisionNote.trim()
    )
      return;
    const { agreement_id, milestone_index, contract_terms, ai_verdict } =
      activeDispute;
    const milestoneAmountSats = BigInt(
      Math.round(
        ((contract_terms.total_amount * contract_terms.milestone_percentage) /
          100) *
          1000,
      ),
    );
    setTxState({ phase: "broadcasting", txId: null, error: null });
    let txId: string;
    try {
      if (chosenOutcome === "release_to_receiver")
        txId = await callResolveToReceiver(
          agreement_id,
          milestone_index,
          milestoneAmountSats,
        );
      else if (chosenOutcome === "refund_to_payer")
        txId = await callResolveToPayer(
          agreement_id,
          milestone_index,
          milestoneAmountSats,
        );
      else throw new Error("Split is not yet implemented on-chain.");
    } catch (e: unknown) {
      setTxState({ phase: "failed", txId: null, error: (e as Error).message });
      return;
    }
    setTxState({ phase: "polling", txId, error: null });
    const result = await pollTx(txId);
    if (result === "failed") {
      setTxState({
        phase: "failed",
        txId,
        error: "Transaction aborted on-chain.",
      });
      return;
    }
    setTxState({ phase: "confirmed", txId, error: null });
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
            override_reason: decisionNote.trim(),
            arbitrator_address: walletAddress,
            tx_id: txId,
          }),
        },
      );
    } catch {
      console.warn("Failed to record decision in DB (chain tx succeeded)");
    }
    await fetchDisputes();
  }, [
    activeDispute,
    chosenOutcome,
    walletAddress,
    decisionNote,
    fetchDisputes,
  ]);

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
  const pending = disputes.filter(
    (d) => d.status === "awaiting_statements" || d.status === "ai_pending",
  );

  return (
    <div>
      <style>{css}</style>

      {/* ── Topbar ── */}
      <header className="a-topbar">
        <div className="a-topbar-l">
          <a className="a-brand" href="/">
            <span className="a-brand-mark">◈</span>
            <span className="a-brand-name">ClauseAI</span>
          </a>
          <div className="a-sep" />
          <span className="a-portal-label">Arbitrator Portal</span>
          <span className="a-net-badge">{NETWORK_NAME}</span>
        </div>
        <div className="a-topbar-r">
          {walletAddress ? (
            <div className="a-wallet">
              <span className="a-wallet-dot" />
              <span className="a-wallet-addr">{truncate(walletAddress)}</span>
            </div>
          ) : (
            <button
              className="a-connect-btn"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? <span className="a-spin" /> : null}
              Connect Wallet
            </button>
          )}
          <div className="a-live">
            <span className="a-live-dot" />
            sBTC Live
          </div>
        </div>
      </header>

      {/* ── App shell ── */}
      <div className="a-shell">
        {/* ── Sidebar ── */}
        <aside className="a-sidebar">
          <div className="a-sb-block">
            <div className="a-sb-heading">Overview</div>
            <div className="a-sb-stats">
              {[
                {
                  k: "Action Required",
                  v: actionable.length,
                  hi: actionable.length > 0,
                },
                { k: "Pending Stmts", v: pending.length, hi: false },
                { k: "Resolved", v: resolved.length, hi: false },
                { k: "Total", v: disputes.length, hi: false },
              ].map(({ k, v, hi }) => (
                <div key={k} className="a-sb-row">
                  <span className="a-sb-key">{k}</span>
                  <span
                    className="a-sb-val"
                    style={hi && v > 0 ? { color: "#f5c518" } : {}}
                  >
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="a-sb-block a-sb-block--grow">
            <div className="a-sb-heading-row">
              <span className="a-sb-heading">Disputes</span>
              {loading && <span className="a-spin-xs" />}
            </div>
            {!walletAddress && (
              <p className="a-sb-empty">
                Connect your wallet to see assigned disputes.
              </p>
            )}
            {walletAddress && !loading && disputes.length === 0 && (
              <p className="a-sb-empty">
                No disputes assigned to your address.
              </p>
            )}

            {actionable.length > 0 && (
              <div className="a-dg">
                <div className="a-dg-label">Needs Action</div>
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
                      setDecisionNote("");
                    }}
                  />
                ))}
              </div>
            )}
            {pending.length > 0 && (
              <div className="a-dg">
                <div className="a-dg-label">Awaiting Statements</div>
                {pending.map((d) => (
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
                      setDecisionNote("");
                    }}
                  />
                ))}
              </div>
            )}
            {resolved.length > 0 && (
              <div className="a-dg">
                <div className="a-dg-label">Resolved</div>
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
                      setDecisionNote("");
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="a-main">
          {!activeDispute ? (
            <div className="a-empty">
              <div className="a-empty-icon">⚖</div>
              <div className="a-empty-title">Select a dispute</div>
              <p className="a-empty-body">
                Choose a dispute from the sidebar to review statements and issue
                a binding on-chain resolution.
              </p>
            </div>
          ) : (
            <DisputePanel
              dispute={activeDispute}
              walletAddress={walletAddress}
              txState={txState}
              chosenOutcome={chosenOutcome}
              setChosenOutcome={setChosenOutcome}
              decisionNote={decisionNote}
              setDecisionNote={setDecisionNote}
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

// ── Dispute Row ─────────────────────────────────────────────────────────────
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
  const isRes =
    dispute.status === "resolved" || dispute.status === "auto_refunded";
  return (
    <button
      className={`a-drow${active ? " a-drow--active" : ""}`}
      onClick={onClick}
    >
      <span
        className="a-drow-dot"
        style={{
          background: isRes
            ? "#f5c518"
            : needsAction
              ? "rgba(245,197,24,0.55)"
              : "rgba(255,255,255,0.12)",
        }}
      />
      <div className="a-drow-body">
        <div className="a-drow-id">#{dispute.agreement_id.slice(0, 13)}…</div>
        <div className="a-drow-sub">
          MS {dispute.milestone_index} ·{" "}
          {dispute.contract_terms.milestone_percentage}%
        </div>
      </div>
      {needsAction && !isRes && <span className="a-drow-pulse" />}
    </button>
  );
}

// ── Dispute Panel ───────────────────────────────────────────────────────────
function DisputePanel({
  dispute,
  walletAddress,
  txState,
  chosenOutcome,
  setChosenOutcome,
  decisionNote,
  setDecisionNote,
  canDecide,
  isResolved,
  onResolve,
}: {
  dispute: DisputeData;
  walletAddress: string | null;
  txState: TxState;
  chosenOutcome: VerdictOutcome | null;
  setChosenOutcome: (v: VerdictOutcome | null) => void;
  decisionNote: string;
  setDecisionNote: (s: string) => void;
  canDecide: boolean;
  isResolved: boolean;
  onResolve: () => void;
}) {
  const ct = dispute.contract_terms;
  const aiV = dispute.ai_verdict;
  const arbD = dispute.arbitrator_decision;
  const isOverride = chosenOutcome && aiV && chosenOutcome !== aiV.verdict;

  return (
    <div className="a-panel">
      {/* Header */}
      <div className="a-panel-hd">
        <div>
          <div className="a-eyebrow">Dispute Review</div>
          <h1 className="a-title">
            Agreement{" "}
            <span className="a-title-dim">#{dispute.agreement_id}</span>
          </h1>
          <div className="a-sub">Milestone {dispute.milestone_index}</div>
        </div>
        <StatusBadge status={dispute.status} />
      </div>

      {/* Terms grid */}
      <div className="a-terms">
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
          <div key={k} className="a-terms-cell">
            <div className="a-terms-k">{k}</div>
            <div className="a-terms-v">{v}</div>
          </div>
        ))}
      </div>

      {/* Description */}
      <div className="a-desc">
        <div className="a-label">Milestone Description</div>
        <p className="a-desc-text">{ct.milestone_description}</p>
      </div>

      {/* Statements */}
      <div>
        <div className="a-label">Statements</div>
        <div className="a-stmts">
          <StatementBlock
            label="Payer — Party A"
            statement={dispute.party_a_statement}
            evidence={dispute.party_a_evidence ?? []}
            submittedAt={dispute.party_a_submitted_at}
          />
          <StatementBlock
            label="Receiver — Party B"
            statement={dispute.party_b_statement}
            evidence={dispute.party_b_evidence ?? []}
            submittedAt={dispute.party_b_submitted_at}
          />
        </div>
      </div>

      {/* AI verdict */}
      {aiV && <AIVerdictBlock verdict={aiV} />}

      {/* Notices */}
      {dispute.status === "ai_pending" && (
        <div className="a-notice a-notice--warn">
          <span className="a-spin-amber" />
          AI is analyzing statements… usually 5–15 seconds.
        </div>
      )}
      {(dispute.status === "awaiting_statements" ||
        dispute.status === "party_a_submitted") && (
        <div className="a-notice a-notice--dim">
          Waiting for both parties to submit statements before AI analysis can
          begin.
        </div>
      )}
      {(dispute.party_a_submitted_at || dispute.party_b_submitted_at) &&
        !(dispute.party_a_submitted_at && dispute.party_b_submitted_at) &&
        canDecide && (
          <div className="a-notice a-notice--warn">
            Only one party has submitted. You may decide now or wait for both
            statements.
          </div>
        )}

      {/* Decision section */}
      {!isResolved && canDecide && (
        <div className="a-decision">
          <div className="a-decision-title">
            Issue Binding On-Chain Decision
          </div>
          <p className="a-decision-body">
            Your decision calls the smart contract directly. sBTC transfers
            immediately on confirmation. A note is required — both parties will
            see it.
          </p>

          <div className="a-outcomes">
            {(
              [
                {
                  v: "release_to_receiver" as VerdictOutcome,
                  label: "Release to Receiver",
                  sub: "sBTC → Party B",
                },
                {
                  v: "refund_to_payer" as VerdictOutcome,
                  label: "Refund to Payer",
                  sub: "sBTC → Party A",
                },
              ] as const
            ).map(({ v, label, sub }) => {
              const isAI = aiV?.verdict === v;
              const sel = chosenOutcome === v;
              return (
                <button
                  key={v}
                  className={`a-outcome${sel ? " a-outcome--sel" : ""}`}
                  onClick={() => setChosenOutcome(v)}
                >
                  {isAI && <span className="a-ai-tag">AI Recommends</span>}
                  <div className="a-outcome-label">{label}</div>
                  <div className="a-outcome-sub">{sub}</div>
                  {sel && <span className="a-outcome-check">✓</span>}
                </button>
              );
            })}
          </div>

          <div className="a-note">
            <label className="a-note-label">
              {isOverride ? "Override Reason" : "Decision Note"}
              <span className="a-note-req">
                {" "}
                * required — shown to both parties
              </span>
            </label>
            <textarea
              className={`a-note-ta${chosenOutcome && !decisionNote.trim() ? " a-note-ta--err" : ""}`}
              placeholder={
                isOverride
                  ? "Explain why you are overriding the AI recommendation…"
                  : "Explain your decision — e.g. 'The receiver provided sufficient proof of delivery. Releasing funds.'"
              }
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              rows={3}
            />
            {chosenOutcome && !decisionNote.trim() && (
              <div className="a-note-hint">
                A note is required before you can confirm.
              </div>
            )}
          </div>

          {txState.phase !== "idle" && <TxStatusBlock txState={txState} />}

          {(txState.phase === "idle" || txState.phase === "failed") && (
            <button
              className="a-confirm"
              disabled={
                !chosenOutcome || !walletAddress || !decisionNote.trim()
              }
              onClick={onResolve}
            >
              {txState.phase === "failed" ? (
                "Retry On-Chain Resolution"
              ) : chosenOutcome ? (
                <>
                  {verdictLabel(chosenOutcome)}{" "}
                  <span className="a-confirm-sub">— broadcasts on Stacks</span>
                </>
              ) : (
                "Select an outcome above"
              )}
            </button>
          )}
        </div>
      )}

      {isResolved && arbD && <ResolvedBlock decision={arbD} />}
    </div>
  );
}

// ── Statement Block ─────────────────────────────────────────────────────────
function StatementBlock({
  label,
  statement,
  evidence,
  submittedAt,
}: {
  label: string;
  statement: string;
  evidence: string[];
  submittedAt?: string;
}) {
  return (
    <div className="a-stmt">
      <div className="a-stmt-hd">
        <span className="a-stmt-avatar">{label[0]}</span>
        <span className="a-stmt-name">{label}</span>
        {submittedAt ? (
          <span className="a-badge a-badge--filed">
            ✓ {fmtDate(submittedAt)}
          </span>
        ) : (
          <span className="a-badge a-badge--pend">Pending</span>
        )}
      </div>
      <div className="a-stmt-body">
        {statement ? (
          <p className="a-stmt-text">{statement}</p>
        ) : (
          <p className="a-stmt-empty">No statement submitted yet.</p>
        )}
        {evidence.length > 0 && (
          <div className="a-evidence">
            <div className="a-evidence-label">Evidence ({evidence.length})</div>
            {evidence.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="a-evidence-item"
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

// ── AI Verdict Block ────────────────────────────────────────────────────────
function AIVerdictBlock({ verdict }: { verdict: AIVerdict }) {
  const isRelease = verdict.verdict === "release_to_receiver";
  return (
    <div className="a-ai">
      <div className="a-ai-hd">
        <div className="a-ai-hd-l">
          <span className="a-ai-icon">🤖</span>
          <span className="a-ai-title">AI Advisory Verdict</span>
          <span className="a-ai-note">advisory only — not binding</span>
        </div>
        <span className="a-ai-model">
          {verdict.model ?? "claude"}
          {verdict.latency_ms
            ? ` · ${(verdict.latency_ms / 1000).toFixed(1)}s`
            : ""}
        </span>
      </div>
      <div className="a-ai-body">
        <div className="a-ai-top">
          <span
            className={`a-ai-pill${isRelease ? " a-ai-pill--rel" : " a-ai-pill--ref"}`}
          >
            {verdictLabel(verdict.verdict)}
          </span>
          <div className="a-conf">
            <span className="a-conf-label">Confidence</span>
            <div className="a-conf-track">
              <div
                className="a-conf-fill"
                style={{ width: `${verdict.confidence}%` }}
              />
            </div>
            <span className="a-conf-pct">{verdict.confidence}%</span>
          </div>
        </div>
        <p className="a-ai-reasoning">{verdict.reasoning}</p>
        {verdict.key_factors.length > 0 && (
          <div>
            <div className="a-ai-sublabel">Key Factors</div>
            {verdict.key_factors.map((f, i) => (
              <div key={i} className="a-ai-factor">
                → {f}
              </div>
            ))}
          </div>
        )}
        {verdict.warnings.length > 0 && (
          <div>
            <div className="a-ai-sublabel a-ai-sublabel--warn">Warnings</div>
            {verdict.warnings.map((w, i) => (
              <div key={i} className="a-ai-warn">
                ⚠ {w}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tx Status Block ─────────────────────────────────────────────────────────
function TxStatusBlock({ txState }: { txState: TxState }) {
  const { phase, txId, error } = txState;
  return (
    <div className={`a-tx a-tx--${phase}`}>
      {phase === "broadcasting" && (
        <>
          <span className="a-spin-sm" />
          <span>Broadcasting via Leather wallet…</span>
        </>
      )}
      {phase === "polling" && txId && (
        <>
          <span className="a-spin-sm" />
          <span>
            Confirming on Stacks…{" "}
            <a
              href={explorerTxUrl(txId)}
              target="_blank"
              rel="noopener noreferrer"
              className="a-tx-link"
            >
              {txId.slice(0, 14)}… ↗
            </a>
          </span>
        </>
      )}
      {phase === "confirmed" && txId && (
        <>
          <span className="a-tx-ok">✓</span>
          <span>
            Confirmed.{" "}
            <a
              href={explorerTxUrl(txId)}
              target="_blank"
              rel="noopener noreferrer"
              className="a-tx-link"
            >
              View on Explorer ↗
            </a>
          </span>
          <span className="a-tx-dim">sBTC transferred on-chain.</span>
        </>
      )}
      {phase === "failed" && (
        <>
          <span className="a-tx-fail-icon">⚠</span>
          <span className="a-tx-fail-text">
            {error ?? "Transaction failed"}
          </span>
          {txId && (
            <a
              href={explorerTxUrl(txId)}
              target="_blank"
              rel="noopener noreferrer"
              className="a-tx-link"
            >
              View details ↗
            </a>
          )}
        </>
      )}
    </div>
  );
}

// ── Status Badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: DisputeStatus }) {
  const map: Record<DisputeStatus, { label: string; bright: boolean }> = {
    awaiting_statements: { label: "Awaiting Statements", bright: false },
    party_a_submitted: { label: "Payer Filed", bright: false },
    party_b_submitted: { label: "Both Filed", bright: true },
    ai_pending: { label: "AI Analyzing", bright: true },
    ai_complete: { label: "Action Required", bright: true },
    resolved: { label: "Resolved", bright: true },
    auto_refunded: { label: "Auto-Refunded", bright: false },
  };
  const m = map[status] ?? { label: status, bright: false };
  return (
    <span
      className={`a-status-badge${m.bright ? " a-status-badge--bright" : ""}`}
    >
      {status === "ai_pending" && <span className="a-spin-xs-y" />}
      {m.label}
    </span>
  );
}

// ── Resolved Block ──────────────────────────────────────────────────────────
function ResolvedBlock({ decision }: { decision: ArbitratorDecision }) {
  return (
    <div className="a-resolved">
      <div className="a-resolved-hd">
        <span className="a-resolved-eye">⚖ Dispute Resolved On-Chain</span>
        <span className="a-resolved-outcome">
          {verdictLabel(decision.outcome)}
        </span>
      </div>
      {decision.override_reason && (
        <div className="a-resolved-note">
          <div className="a-resolved-note-label">
            {decision.followed_ai ? "Decision Note" : "Override Reason"}
          </div>
          <p className="a-resolved-note-text">"{decision.override_reason}"</p>
        </div>
      )}
      <div className="a-resolved-meta">
        <span>{decision.followed_ai ? "✓ Followed AI" : "↺ Overrode AI"}</span>
        <span className="a-dot">·</span>
        <span>{fmtDate(decision.decided_at)}</span>
        <span className="a-dot">·</span>
        <span>{truncate(decision.arbitrator_address)}</span>
      </div>
    </div>
  );
}

// ── CSS ─────────────────────────────────────────────────────────────────────
const css = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@400;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}

/* Tokens */
:root{
  --bg:#0a0a0a;
  --bg1:#101010;
  --bg2:#161616;
  --bg3:#1c1c1c;
  --y:#f5c518;
  --yd:rgba(245,197,24,0.70);
  --ydim:rgba(245,197,24,0.08);
  --yborder:rgba(245,197,24,0.22);
  --t1:#f0f0f0;
  --t2:rgba(240,240,240,0.70);
  --t3:rgba(240,240,240,0.40);
  --t4:rgba(240,240,240,0.22);
  --border:rgba(240,240,240,0.08);
  --border2:rgba(240,240,240,0.13);
  --mono:'DM Mono',monospace;
  --display:'Syne',sans-serif;
  --sans:'DM Sans',sans-serif;
}

/* ── Topbar ── */
.a-topbar{
  position:sticky;top:0;z-index:200;height:54px;
  background:rgba(10,10,10,0.95);backdrop-filter:blur(20px);
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;
  padding:0 28px;
}
.a-topbar-l,.a-topbar-r{display:flex;align-items:center;gap:12px;}
.a-sep{width:1px;height:16px;background:var(--border);margin:0 6px;}
.a-brand{display:flex;align-items:center;gap:9px;text-decoration:none;}
.a-brand-mark{
  width:28px;height:28px;border-radius:5px;flex-shrink:0;
  background:var(--y);display:flex;align-items:center;justify-content:center;
  font-family:var(--display);font-size:14px;font-weight:800;color:#0a0a0a;
}
.a-brand-name{font-family:var(--display);font-size:15px;font-weight:800;color:var(--t1);letter-spacing:-0.04em;}
.a-portal-label{font-size:10px;font-family:var(--mono);color:var(--t4);}
.a-net-badge{
  font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;
  color:var(--y);border:1px solid var(--yborder);border-radius:3px;
  padding:2px 8px;background:var(--ydim);font-family:var(--mono);
}
.a-wallet{display:flex;align-items:center;gap:7px;border:1px solid var(--border);border-radius:4px;padding:5px 12px;}
.a-wallet-dot{width:5px;height:5px;border-radius:50%;background:var(--y);flex-shrink:0;}
.a-wallet-addr{font-size:10px;font-family:var(--mono);color:var(--t4);}
.a-connect-btn{
  display:flex;align-items:center;gap:7px;padding:7px 16px;
  border:none;background:var(--y);color:#0a0a0a;cursor:pointer;
  font-family:var(--display);font-size:12px;font-weight:700;
  letter-spacing:-0.02em;border-radius:4px;transition:background 0.13s;
}
.a-connect-btn:hover{background:#ffd740;}
.a-connect-btn:disabled{opacity:0.45;cursor:not-allowed;}
.a-live{
  display:flex;align-items:center;gap:5px;
  font-size:9px;font-family:var(--mono);font-weight:700;
  letter-spacing:0.07em;text-transform:uppercase;
  color:var(--y);border:1px solid var(--yborder);
  border-radius:4px;padding:4px 10px;background:var(--ydim);
}
.a-live-dot{width:5px;height:5px;border-radius:50%;background:var(--y);animation:aPulse 2s ease infinite;flex-shrink:0;}

/* ── Shell ── */
.a-shell{
  display:flex;min-height:calc(100vh - 54px);
  background:var(--bg);
  background-image:radial-gradient(circle at 1px 1px, rgba(245,197,24,0.025) 1px, transparent 0);
  background-size:28px 28px;
}

/* ── Sidebar ── */
.a-sidebar{
  width:224px;flex-shrink:0;
  background:var(--bg1);
  border-right:1px solid var(--border);
  display:flex;flex-direction:column;
  position:sticky;top:54px;height:calc(100vh - 54px);
  overflow-y:auto;
}
.a-sidebar::-webkit-scrollbar{width:2px;}
.a-sidebar::-webkit-scrollbar-thumb{background:var(--bg3);}
.a-sb-block{padding:16px 16px 18px;border-bottom:1px solid var(--border);}
.a-sb-block--grow{flex:1;border-bottom:none;}
.a-sb-heading{
  font-size:8px;font-family:var(--mono);color:var(--t4);
  text-transform:uppercase;letter-spacing:0.14em;display:block;margin-bottom:11px;
}
.a-sb-heading-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px;}
.a-sb-stats{display:flex;flex-direction:column;gap:9px;}
.a-sb-row{display:flex;align-items:center;justify-content:space-between;}
.a-sb-key{font-size:10px;font-family:var(--mono);color:var(--t4);}
.a-sb-val{font-size:11px;font-family:var(--mono);color:var(--t2);font-weight:500;}
.a-sb-empty{font-size:11px;font-family:var(--mono);color:var(--t4);line-height:1.7;}
.a-dg{margin-bottom:2px;}
.a-dg-label{
  font-size:8px;font-family:var(--mono);color:rgba(240,240,240,0.16);
  text-transform:uppercase;letter-spacing:0.13em;
  padding:10px 0 5px;
}

/* Dispute rows */
.a-drow{
  width:100%;display:flex;align-items:center;gap:9px;
  padding:9px 10px 9px 12px;
  border:none;background:none;cursor:pointer;text-align:left;
  border-left:2px solid transparent;
  transition:background 0.11s,border-color 0.11s;
}
.a-drow:hover{background:rgba(245,197,24,0.03);}
.a-drow--active{background:rgba(245,197,24,0.05);border-left-color:var(--y);}
.a-drow-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
.a-drow-body{flex:1;min-width:0;}
.a-drow-id{font-size:10px;font-family:var(--mono);color:rgba(240,240,240,0.60);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.a-drow-sub{font-size:9px;font-family:var(--mono);color:var(--t4);margin-top:1px;}
.a-drow-pulse{width:6px;height:6px;border-radius:50%;background:var(--y);flex-shrink:0;animation:aPulse 2s ease infinite;}

/* ── Main ── */
.a-main{
  flex:1;min-width:0;overflow-y:auto;
  display:flex;justify-content:center;
}

/* Empty state */
.a-empty{
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  min-height:calc(100vh - 54px);gap:12px;text-align:center;padding:40px;
  width:100%;
}
.a-empty-icon{font-size:28px;opacity:0.10;margin-bottom:4px;}
.a-empty-title{font-family:var(--display);font-size:20px;font-weight:800;color:rgba(240,240,240,0.22);letter-spacing:-0.04em;}
.a-empty-body{font-size:13px;color:rgba(240,240,240,0.16);max-width:300px;line-height:1.75;margin:0;}

/* ── Panel — centered ── */
.a-panel{
  width:100%;max-width:820px;
  padding:44px 52px 88px;
  display:flex;flex-direction:column;gap:22px;
}

/* Panel header */
.a-panel-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;}
.a-eyebrow{
  font-size:9px;font-family:var(--mono);color:var(--y);
  text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;
}
.a-title{
  font-family:var(--display);font-size:26px;font-weight:800;
  color:var(--t1);letter-spacing:-0.04em;line-height:1.1;
}
.a-title-dim{color:rgba(240,240,240,0.28);}
.a-sub{font-size:11px;font-family:var(--mono);color:var(--t4);margin-top:5px;}
.a-status-badge{
  font-size:9px;font-family:var(--mono);font-weight:700;text-transform:uppercase;
  letter-spacing:0.07em;border:1px solid var(--border2);border-radius:3px;
  padding:4px 10px;display:inline-flex;align-items:center;gap:6px;
  flex-shrink:0;white-space:nowrap;
  color:var(--t3);background:var(--bg2);margin-top:4px;
}
.a-status-badge--bright{color:var(--y);border-color:var(--yborder);background:var(--ydim);}

/* Terms */
.a-terms{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--border);}
.a-terms-cell{
  padding:14px 16px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);
  background:var(--bg1);
}
.a-terms-cell:nth-child(3n){border-right:none;}
.a-terms-k{font-size:8px;font-family:var(--mono);color:var(--t4);text-transform:uppercase;letter-spacing:0.10em;margin-bottom:5px;}
.a-terms-v{font-size:12px;font-family:var(--mono);color:var(--t2);font-weight:500;}

/* Description */
.a-desc{border:1px solid var(--border);padding:15px 18px;background:var(--bg1);}
.a-label{
  font-size:8px;font-family:var(--mono);color:var(--t4);
  text-transform:uppercase;letter-spacing:0.12em;margin-bottom:10px;display:block;
}
.a-desc-text{font-size:13px;color:var(--t3);line-height:1.74;margin:0;}

/* Statements */
.a-stmts{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
@media(max-width:700px){.a-stmts{grid-template-columns:1fr;}}
.a-stmt{border:1px solid var(--border);overflow:hidden;background:var(--bg1);}
.a-stmt-hd{
  display:flex;align-items:center;gap:9px;
  padding:11px 14px;border-bottom:1px solid var(--border);
  background:var(--bg2);
}
.a-stmt-avatar{
  width:22px;height:22px;border-radius:50%;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  font-size:9px;font-family:var(--mono);font-weight:700;
  background:rgba(245,197,24,0.12);border:1px solid rgba(245,197,24,0.22);color:var(--y);
}
.a-stmt-name{font-size:12px;font-weight:600;color:var(--t2);flex:1;font-family:var(--sans);}
.a-badge{font-size:9px;font-family:var(--mono);border-radius:3px;padding:2px 7px;flex-shrink:0;}
.a-badge--filed{color:var(--y);background:var(--ydim);border:1px solid var(--yborder);}
.a-badge--pend{color:var(--t4);background:var(--bg3);border:1px solid var(--border);}
.a-stmt-body{padding:13px;}
.a-stmt-text{font-size:12px;color:var(--t3);line-height:1.72;margin:0;}
.a-stmt-empty{font-size:11px;color:rgba(240,240,240,0.18);font-style:italic;margin:0;}
.a-evidence{margin-top:11px;}
.a-evidence-label{font-size:8px;font-family:var(--mono);color:var(--t4);text-transform:uppercase;letter-spacing:0.10em;margin-bottom:5px;}
.a-evidence-item{
  display:flex;align-items:center;gap:5px;padding:5px 9px;
  border:1px solid var(--border);text-decoration:none;
  font-size:9px;font-family:var(--mono);color:var(--yd);
  background:var(--bg2);margin-bottom:3px;transition:opacity 0.12s;
}
.a-evidence-item:hover{opacity:0.70;}

/* AI Verdict */
.a-ai{border:1px solid var(--border);overflow:hidden;background:var(--bg1);}
.a-ai-hd{
  display:flex;align-items:center;justify-content:space-between;
  padding:11px 15px;border-bottom:1px solid var(--border);background:var(--bg2);
}
.a-ai-hd-l{display:flex;align-items:center;gap:8px;}
.a-ai-icon{font-size:14px;}
.a-ai-title{font-size:12px;font-weight:600;color:var(--t2);font-family:var(--sans);}
.a-ai-note{font-size:9px;font-family:var(--mono);color:var(--t4);}
.a-ai-model{font-size:9px;font-family:var(--mono);color:var(--t4);}
.a-ai-body{padding:16px;display:flex;flex-direction:column;gap:14px;}
.a-ai-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.a-ai-pill{
  display:inline-flex;align-items:center;
  font-size:11px;font-family:var(--mono);font-weight:700;
  border:1px solid;padding:4px 12px;
}
.a-ai-pill--rel{color:var(--y);background:var(--ydim);border-color:var(--yborder);}
.a-ai-pill--ref{color:rgba(245,197,24,0.55);background:rgba(245,197,24,0.05);border-color:rgba(245,197,24,0.18);}
.a-conf{display:flex;align-items:center;gap:7px;}
.a-conf-label{font-size:9px;font-family:var(--mono);color:var(--t4);}
.a-conf-track{width:68px;height:2px;background:var(--bg3);overflow:hidden;}
.a-conf-fill{height:100%;background:var(--y);transition:width 0.8s;}
.a-conf-pct{font-size:10px;font-family:var(--mono);color:var(--t3);font-weight:500;}
.a-ai-reasoning{font-size:12px;color:var(--t3);line-height:1.74;margin:0;}
.a-ai-sublabel{font-size:8px;font-family:var(--mono);color:var(--t4);text-transform:uppercase;letter-spacing:0.10em;margin-bottom:5px;}
.a-ai-sublabel--warn{color:rgba(245,197,24,0.50);}
.a-ai-factor{font-size:11px;color:var(--t3);line-height:1.62;display:flex;gap:7px;align-items:flex-start;}
.a-ai-warn{font-size:11px;color:rgba(245,197,24,0.55);line-height:1.62;display:flex;gap:7px;}

/* Notices */
.a-notice{display:flex;align-items:center;gap:10px;padding:12px 15px;border:1px solid;font-size:12px;font-family:var(--mono);line-height:1.7;}
.a-notice--warn{border-color:rgba(245,197,24,0.18);color:var(--t3);background:rgba(245,197,24,0.03);}
.a-notice--dim{border-color:var(--border);color:var(--t4);}

/* Decision */
.a-decision{
  border:1px solid rgba(245,197,24,0.18);
  padding:22px;display:flex;flex-direction:column;gap:16px;
  background:rgba(245,197,24,0.02);
}
.a-decision-title{font-family:var(--display);font-size:15px;font-weight:800;color:var(--t1);letter-spacing:-0.03em;}
.a-decision-body{font-size:12px;color:var(--t4);line-height:1.72;margin:0;}

/* Outcomes */
.a-outcomes{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.a-outcome{
  padding:16px 18px;text-align:left;cursor:pointer;
  background:var(--bg2);border:1px solid var(--border);
  color:var(--t3);transition:all 0.14s;position:relative;
}
.a-outcome:hover{border-color:var(--border2);color:var(--t2);}
.a-outcome--sel{border-color:var(--y) !important;background:var(--ydim) !important;color:var(--y) !important;}
.a-ai-tag{
  font-size:8px;font-family:var(--mono);font-weight:700;
  color:var(--y);background:var(--ydim);border:1px solid var(--yborder);
  padding:2px 7px;display:block;margin-bottom:8px;width:fit-content;
}
.a-outcome-label{font-size:13px;font-weight:600;font-family:var(--sans);margin-bottom:3px;}
.a-outcome-sub{font-size:10px;font-family:var(--mono);opacity:0.50;}
.a-outcome-check{position:absolute;top:14px;right:15px;font-size:14px;font-weight:700;color:var(--y);}

/* Note */
.a-note{display:flex;flex-direction:column;gap:7px;}
.a-note-label{font-size:9px;font-family:var(--mono);color:var(--t3);text-transform:uppercase;letter-spacing:0.10em;font-weight:600;}
.a-note-req{color:rgba(245,197,24,0.55);font-size:9px;text-transform:none;letter-spacing:0;margin-left:4px;font-weight:400;}
.a-note-ta{
  width:100%;padding:11px 13px;resize:vertical;
  background:var(--bg2);border:1px solid var(--border);
  color:var(--t1);font-size:12px;font-family:var(--sans);
  outline:none;line-height:1.65;
  transition:border-color 0.13s;
}
.a-note-ta:focus{border-color:rgba(245,197,24,0.40);}
.a-note-ta--err{border-color:rgba(245,197,24,0.30) !important;}
.a-note-ta::placeholder{color:rgba(240,240,240,0.18);}
.a-note-hint{font-size:10px;font-family:var(--mono);color:rgba(245,197,24,0.55);}

/* Tx */
.a-tx{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 15px;border:1px solid;font-size:12px;font-family:var(--mono);}
.a-tx--broadcasting{border-color:var(--border);color:var(--t3);}
.a-tx--polling{border-color:rgba(245,197,24,0.18);color:var(--t3);}
.a-tx--confirmed{border-color:rgba(245,197,24,0.25);color:var(--t2);}
.a-tx--failed{border-color:rgba(245,197,24,0.18);}
.a-tx-link{color:inherit;text-decoration:underline;opacity:0.65;}
.a-tx-link:hover{opacity:1;}
.a-tx-ok{color:var(--y);}
.a-tx-dim{color:var(--t4);font-size:11px;}
.a-tx-fail-icon,.a-tx-fail-text{color:rgba(245,197,24,0.60);}

/* Confirm */
.a-confirm{
  padding:13px 24px;border:none;cursor:pointer;
  background:var(--y);color:#0a0a0a;
  font-family:var(--display);font-size:13px;font-weight:800;
  letter-spacing:-0.02em;display:flex;align-items:center;justify-content:center;
  gap:8px;width:100%;transition:background 0.13s;
}
.a-confirm:hover:not(:disabled){background:#ffd740;}
.a-confirm:disabled{opacity:0.28;cursor:not-allowed;}
.a-confirm-sub{font-family:var(--mono);font-size:11px;font-weight:400;opacity:0.50;}

/* Resolved */
.a-resolved{border:1px solid rgba(245,197,24,0.20);padding:20px;background:rgba(245,197,24,0.03);}
.a-resolved-hd{display:flex;flex-direction:column;gap:5px;margin-bottom:12px;}
.a-resolved-eye{font-size:10px;font-family:var(--mono);font-weight:600;color:var(--t4);}
.a-resolved-outcome{font-family:var(--mono);font-size:18px;font-weight:700;color:var(--y);}
.a-resolved-note{background:var(--bg2);border:1px solid var(--border);padding:12px 14px;margin-bottom:10px;}
.a-resolved-note-label{font-size:8px;font-family:var(--mono);color:var(--t4);text-transform:uppercase;letter-spacing:0.10em;margin-bottom:6px;}
.a-resolved-note-text{font-size:12px;color:var(--t3);line-height:1.70;font-style:italic;margin:0;}
.a-resolved-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:10px;font-family:var(--mono);color:var(--t4);}
.a-dot{color:rgba(240,240,240,0.14);}

/* Spinners */
.a-spin{display:inline-block;width:13px;height:13px;border-radius:50%;border:2px solid rgba(10,10,10,0.2);border-top-color:#0a0a0a;animation:aSpin 0.65s linear infinite;}
.a-spin-xs{display:inline-block;width:8px;height:8px;border-radius:50%;border:1.5px solid var(--bg3);border-top-color:var(--t3);animation:aSpin 0.65s linear infinite;}
.a-spin-xs-y{display:inline-block;width:7px;height:7px;border-radius:50%;border:1.5px solid rgba(245,197,24,0.15);border-top-color:var(--y);animation:aSpin 0.65s linear infinite;}
.a-spin-sm{display:inline-block;width:11px;height:11px;border-radius:50%;border:1.5px solid var(--bg3);border-top-color:var(--t2);animation:aSpin 0.65s linear infinite;flex-shrink:0;}
.a-spin-amber{display:inline-block;width:11px;height:11px;border-radius:50%;border:1.5px solid rgba(245,197,24,0.15);border-top-color:var(--y);animation:aSpin 0.65s linear infinite;flex-shrink:0;}

@keyframes aSpin{to{transform:rotate(360deg);}}
@keyframes aPulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.40;transform:scale(0.78);}}

@media(max-width:960px){.a-sidebar{display:none;}.a-panel{padding:28px 20px 60px;}}
@media(max-width:640px){.a-terms{grid-template-columns:1fr 1fr;}.a-outcomes{grid-template-columns:1fr;}}
`;
