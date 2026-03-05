"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  completeThunk,
  disputeThunk,
  timeoutThunk,
  pollAgreementThunk,
  rehydrateSession,
  resetAll,
} from "@/store/slices/agreementSlice";

const POLL_MS = 12_000;
const STATE_META: Record<
  number,
  { label: string; color: string; icon: string; pulse: boolean }
> = {
  0: { label: "Awaiting Deposit", color: "#94a3b8", icon: "⏳", pulse: false },
  1: {
    label: "Funds Locked — Active",
    color: "#f5c400",
    icon: "🔒",
    pulse: true,
  },
  2: {
    label: "Complete — Released",
    color: "#22c55e",
    icon: "✅",
    pulse: false,
  },
  3: { label: "Refunded to Payer", color: "#60a5fa", icon: "↩️", pulse: false },
  4: {
    label: "Disputed — Arbitrating",
    color: "#f59e0b",
    icon: "⚖️",
    pulse: true,
  },
};

function fmtWallet(addr?: string | null) {
  if (!addr) return "—";
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}
function fmtSbtc(usd?: string | null, microStx?: number | null) {
  if (usd) return (parseFloat(usd) / 67_000).toFixed(6);
  if (microStx) return (microStx / 1_000_000 / 67).toFixed(6);
  return "0.000000";
}

export default function DashboardPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const {
    editedTerms,
    agreementId,
    walletAddress,
    counterpartyWallet,
    amountLocked,
    fundState,
    onChainData,
    blockHeight,
    deadlineBlock,
    txComplete,
    txDispute,
    txTimeout,
    isPartyB,
  } = useAppSelector((s) => s.agreement);

  const [ready, setReady] = useState(false);
  const [lastPolled, setLastPolled] = useState("—");
  const [disputeModal, setDisputeModal] = useState(false);

  useEffect(() => {
    dispatch(rehydrateSession());
    setReady(true);
  }, [dispatch]);

  useEffect(() => {
    if (!ready) return;
    if (!agreementId) router.replace("/");
  }, [ready, agreementId, router]);

  const poll = useCallback(() => {
    if (!agreementId) return;
    dispatch(pollAgreementThunk(agreementId))
      .unwrap()
      .then(() => setLastPolled(new Date().toLocaleTimeString()))
      .catch((e: unknown) => {
        console.warn("[dashboard] poll failed (non-fatal):", e);
        setLastPolled(`${new Date().toLocaleTimeString()} (no on-chain data)`);
      });
  }, [agreementId, dispatch]);

  useEffect(() => {
    if (!ready || !agreementId) return;
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => clearInterval(iv);
  }, [ready, agreementId, poll]);

  // ── Derived ───────────────────────────────────────────────────
  const onChainState = onChainData?.state ?? 1;
  const meta = STATE_META[onChainState] ?? STATE_META[1];
  const sbtcAmount = fmtSbtc(
    amountLocked,
    onChainData?.totalDeposited as number | undefined,
  );
  const usdAmount = amountLocked ?? editedTerms?.amount_usd ?? "—";
  const isTimedOut = !!(
    deadlineBlock &&
    blockHeight > 0 &&
    blockHeight >= deadlineBlock
  );
  const blocksLeft =
    deadlineBlock && blockHeight > 0
      ? Math.max(0, deadlineBlock - blockHeight)
      : null;
  const busy = {
    complete: txComplete.status === "pending",
    dispute: txDispute.status === "pending",
    timeout: txTimeout.status === "pending",
  };
  const anyBusy = busy.complete || busy.dispute || busy.timeout;
  const payerName = editedTerms?.partyA ?? "Payer";
  const receiverName = editedTerms?.partyB ?? "Receiver";
  const payerWallet = isPartyB ? counterpartyWallet : walletAddress;
  const receiverWallet = isPartyB ? walletAddress : counterpartyWallet;
  const isFinished = onChainState === 2 || onChainState === 3;
  const roleColor = isPartyB ? "#22c55e" : "#f5c400";

  if (!ready) {
    return (
      <div className="detect-wrap">
        <div className="detect-orb">🔍</div>
        <p className="detect-label">Loading dashboard…</p>
        <div className="dot-row">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="dot"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </div>
        <style>{splashCSS}</style>
      </div>
    );
  }

  return (
    <div className="db-root">
      <style>{css}</style>

      {/* ── Top bar ──────────────────────────────────────────── */}
      <header className="db-topbar">
        <div className="db-topbar-left">
          <button className="db-logo-btn" onClick={() => router.push("/")}>
            <span className="logo-clause">Clause</span>
            <span className="logo-ai">Ai</span>
          </button>
          <span className="escrow-badge">#{agreementId ?? "—"}</span>
        </div>
        <div className="db-topbar-right">
          <div
            className="role-chip"
            style={{
              color: roleColor,
              borderColor: `${roleColor}50`,
              background: `${roleColor}10`,
            }}
          >
            {isPartyB ? "🎯 Receiver" : "💸 Payer"}
          </div>
          <div
            className="state-chip"
            style={{ color: meta.color, borderColor: `${meta.color}40` }}
          >
            {meta.pulse && (
              <span className="pulse-dot" style={{ background: meta.color }} />
            )}
            {meta.icon} {meta.label}
          </div>
        </div>
      </header>

      <main className="db-grid">
        {/* ── LEFT COLUMN ──────────────────────────────────────── */}
        <section className="db-left">
          {/* Role card */}
          <div
            className="role-card"
            style={{
              background: `${roleColor}08`,
              borderColor: `${roleColor}25`,
            }}
          >
            <div className="role-card-tag" style={{ color: roleColor }}>
              {isPartyB ? "🎯 You are the Receiver" : "💸 You are the Payer"}
            </div>
            <div className="role-card-name">
              {isPartyB ? receiverName : payerName}
            </div>
            <div className="role-card-wallet">{fmtWallet(walletAddress)}</div>
          </div>

          {/* Timeout banner — only payer can trigger refund */}
          {isTimedOut && !isFinished && (
            <div className="timeout-banner">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>⏱</span>
                <div>
                  <div className="timeout-title">Deadline passed</div>
                  <div className="timeout-sub">
                    Payer can now trigger a refund
                  </div>
                </div>
              </div>
              {/* Only show trigger button to Payer */}
              {!isPartyB && (
                <button
                  className="timeout-btn"
                  disabled={busy.timeout}
                  onClick={() =>
                    agreementId && dispatch(timeoutThunk(agreementId))
                  }
                >
                  {busy.timeout ? <Spin /> : "Trigger Refund"}
                </button>
              )}
            </div>
          )}

          {/* Tx status banners */}
          <TxBanner tx={txComplete} label="Releasing payment" />
          <TxBanner tx={txDispute} label="Opening dispute" />
          <TxBanner tx={txTimeout} label="Triggering refund" />

          {/* ── PAYER actions ──────────────────────────────────
              FIX: complete() in the Clarity contract requires
              tx-sender === party-a (Payer). So ONLY the Payer
              can call completeThunk to release funds.
              The Payer also sees a "Release Payment" button.
          ─────────────────────────────────────────────────── */}
          {!isPartyB && !isFinished && (
            <div className="actions-section">
              <div className="actions-title">Your Actions</div>
              <div
                className="info-box"
                style={{
                  color: "#f5c400",
                  borderColor: "#f5c40025",
                  background: "#f5c40008",
                }}
              >
                <strong>You are the Payer.</strong> Once the receiver has
                fulfilled the conditions, release the payment to them. You can
                also open a dispute if something went wrong.
              </div>
              {/* Payer releases funds → calls complete() on-chain */}
              <PrimaryBtn
                disabled={busy.complete || busy.dispute}
                onClick={() =>
                  agreementId && dispatch(completeThunk(agreementId))
                }
                color="#f5c400"
              >
                {busy.complete ? (
                  <>
                    <Spin color="#0a0a0a" /> Waiting for wallet…
                  </>
                ) : (
                  "✅ Release Payment to Receiver"
                )}
              </PrimaryBtn>
              <DangerBtn
                disabled={anyBusy}
                onClick={() => setDisputeModal(true)}
              >
                ⚠️ Open Dispute
              </DangerBtn>
            </div>
          )}

          {/* ── RECEIVER actions ────────────────────────────────
              FIX: Receiver does NOT sign any transaction.
              complete() can only be called by party-a (Payer).
              Receiver just waits — no wallet prompt needed.
          ─────────────────────────────────────────────────── */}
          {isPartyB && !isFinished && (
            <div className="actions-section">
              <div className="actions-title">Your Actions</div>
              <div
                className="info-box"
                style={{
                  color: "#22c55e",
                  borderColor: "#22c55e25",
                  background: "#22c55e08",
                }}
              >
                <strong>You are the Receiver.</strong> You don't need to sign
                anything. Once{" "}
                <strong style={{ color: "#fff" }}>{payerName}</strong> confirms
                conditions are met, funds transfer to your wallet automatically.
              </div>
              {/* Waiting pill — no onClick, no wallet call */}
              <div className="waiting-pill">
                <span className="waiting-dot" />
                Waiting for {payerName} to release payment…
              </div>
              {/* Receiver CAN open a dispute */}
              <DangerBtn
                disabled={anyBusy}
                onClick={() => setDisputeModal(true)}
              >
                ⚠️ Open Dispute
              </DangerBtn>
            </div>
          )}

          {/* Finished state */}
          {isFinished && (
            <div className="finished-card">
              <span className="finished-icon">
                {onChainState === 2 ? "✅" : "↩️"}
              </span>
              <div className="finished-title">
                {onChainState === 2 ? "Escrow Complete" : "Funds Refunded"}
              </div>
              <div className="finished-sub">
                {onChainState === 2
                  ? `Payment released to ${receiverName}.`
                  : `Funds returned to ${payerName}.`}
              </div>
              <button
                className="new-agreement-btn"
                onClick={() => {
                  dispatch(resetAll());
                  router.push("/");
                }}
              >
                + New Agreement
              </button>
            </div>
          )}
        </section>

        {/* ── RIGHT COLUMN ─────────────────────────────────────── */}
        <section className="db-right">
          {/* Amount card */}
          <div className="amount-card">
            <div className="amount-label">🔒 Escrowed on Stacks Bitcoin</div>
            <div className="amount-sbtc">{sbtcAmount}</div>
            <div className="amount-unit">sBTC</div>
            <div className="amount-usd">≈ ${usdAmount} USD</div>
            {onChainData?.totalDeposited != null && (
              <div className="amount-micro">
                {Number(onChainData.totalDeposited).toLocaleString()} µSTX
                on-chain
              </div>
            )}
          </div>

          {/* Block timeline */}
          <div className="timeline-card">
            <div className="timeline-header">
              <span className="section-label">Block Timeline</span>
              <span className="polled-label">Polled {lastPolled}</span>
            </div>
            {deadlineBlock && (
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min(100, (blockHeight / deadlineBlock) * 100)}%`,
                    background: isTimedOut
                      ? "#ef4444"
                      : blocksLeft != null && blocksLeft < 50
                        ? "#f59e0b"
                        : "#f5c400",
                  }}
                />
              </div>
            )}
            <div className="timeline-cells">
              {[
                {
                  label: "Current Block",
                  value: blockHeight ? `#${blockHeight.toLocaleString()}` : "…",
                  color: "#fff",
                },
                {
                  label: "Deadline",
                  value: deadlineBlock
                    ? `#${deadlineBlock.toLocaleString()}`
                    : "N/A",
                  color: isTimedOut ? "#ef4444" : "#94a3b8",
                },
                {
                  label: "Blocks Left",
                  value: isTimedOut
                    ? "EXPIRED"
                    : (blocksLeft?.toLocaleString() ?? "—"),
                  color: isTimedOut
                    ? "#ef4444"
                    : blocksLeft != null && blocksLeft < 50
                      ? "#f59e0b"
                      : "#94a3b8",
                },
              ].map((c) => (
                <div key={c.label} className="timeline-cell">
                  <div className="tc-value" style={{ color: c.color }}>
                    {c.value}
                  </div>
                  <div className="tc-label">{c.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Terms card */}
          <div className="terms-card">
            <div className="terms-header">Agreement Terms</div>
            {[
              { label: "⚡ Release Condition", value: editedTerms?.condition },
              { label: "📅 Deadline", value: editedTerms?.deadline },
              { label: "⚖️ Arbitrator", value: editedTerms?.arbitrator },
              {
                label: "⏱ Timeout Policy",
                value: "Auto-refund to payer after deadline",
              },
            ].map((r, i) => (
              <div key={i} className="terms-row">
                <span className="terms-key">{r.label}</span>
                <span className="terms-val">{r.value ?? "—"}</span>
              </div>
            ))}
          </div>

          {/* Parties row */}
          <div className="parties-row">
            <PartyCard
              role="Payer"
              color="#f5c400"
              name={payerName}
              wallet={payerWallet}
              status={
                onChainData?.deposited ? "✅ Funds locked" : "⏳ Awaiting lock"
              }
              statusColor={onChainData?.deposited ? "#f5c400" : "#475569"}
              isMe={!isPartyB}
            />
            <div className="parties-arrow">
              <span style={{ fontSize: 9, color: "#334155", letterSpacing: 1 }}>
                ESCROW
              </span>
              <span style={{ fontSize: 18, color: "#334155" }}>⇄</span>
            </div>
            <PartyCard
              role="Receiver"
              color="#22c55e"
              name={receiverName}
              wallet={receiverWallet}
              status={
                fundState === "released" ? "✅ Received" : "⏳ Awaiting release"
              }
              statusColor={fundState === "released" ? "#22c55e" : "#475569"}
              isMe={isPartyB}
            />
          </div>
        </section>
      </main>

      {/* ── Dispute modal ─────────────────────────────────────── */}
      {disputeModal && (
        <div className="modal-overlay" onClick={() => setDisputeModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>⚖️</div>
            <h3 className="modal-title">Open a Dispute?</h3>
            <p className="modal-body">
              This notifies arbitrator{" "}
              <strong style={{ color: "#fff" }}>
                {editedTerms?.arbitrator ?? "TBD"}
              </strong>
              . The contract is paused for{" "}
              <strong style={{ color: "#f59e0b" }}>48 hours</strong> — then
              auto-refunds to payer if unresolved.
            </p>
            <div className="modal-actions">
              <button
                className="modal-cancel"
                onClick={() => setDisputeModal(false)}
              >
                Cancel
              </button>
              <button
                className="modal-confirm"
                disabled={busy.dispute}
                onClick={() => {
                  if (agreementId) dispatch(disputeThunk(agreementId));
                  setDisputeModal(false);
                }}
              >
                {busy.dispute ? "Opening…" : "Confirm Dispute"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function PartyCard({
  role,
  color,
  name,
  wallet,
  status,
  statusColor,
  isMe,
}: {
  role: string;
  color: string;
  name: string;
  wallet?: string | null;
  status: string;
  statusColor: string;
  isMe: boolean;
}) {
  return (
    <div className="party-card" style={{ borderColor: `${color}25` }}>
      <div className="party-role" style={{ color }}>
        {role}
        {isMe && (
          <span
            className="party-you"
            style={{ background: `${color}20`, color }}
          >
            {" "}
            YOU
          </span>
        )}
      </div>
      <div className="party-name">{name}</div>
      <div className="party-status" style={{ color: statusColor }}>
        {status}
      </div>
      {wallet && <div className="party-wallet">{fmtWallet(wallet)}</div>}
    </div>
  );
}

function TxBanner({
  tx,
  label,
}: {
  tx: {
    status: string;
    txId: string | null;
    txUrl: string | null;
    error: string | null;
  };
  label: string;
}) {
  if (tx.status === "idle") return null;
  const fail = tx.status === "failed";
  return (
    <div
      className="tx-banner"
      style={{
        background: fail ? "#7f1d1d20" : "#f59e0b08",
        borderColor: fail ? "#7f1d1d" : "#f59e0b30",
      }}
    >
      {tx.status === "pending" && (
        <span style={{ color: "#f59e0b" }}>
          ⏳ {label} — waiting for wallet…
        </span>
      )}
      {tx.status === "confirming" && (
        <span style={{ color: "#f59e0b" }}>
          ⏳ {label} — confirming…{" "}
          {tx.txUrl && (
            <a
              href={tx.txUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#f5c400" }}
            >
              View ↗
            </a>
          )}
        </span>
      )}
      {fail && (
        <span style={{ color: "#f87171" }}>
          ❌ {label} failed: {tx.error}
        </span>
      )}
    </div>
  );
}

function PrimaryBtn({
  children,
  disabled,
  onClick,
  color = "#22c55e",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      className="primary-btn"
      disabled={disabled}
      onClick={onClick}
      style={{
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        background: color,
        color: "#0a0a0a",
      }}
    >
      {children}
    </button>
  );
}

function DangerBtn({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="danger-btn"
      disabled={disabled}
      onClick={onClick}
      style={{
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Spin({ color = "#0a0a0a" }: { color?: string }) {
  return (
    <span
      className="spinner"
      style={{ borderColor: `${color}40`, borderTopColor: "transparent" }}
    />
  );
}

// ── CSS ───────────────────────────────────────────────────────

const splashCSS = `.detect-wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--black,#0a0a0a)}.detect-orb{width:90px;height:90px;border-radius:50%;border:1px solid #f5c40030;background:radial-gradient(circle,#f5c40012 0%,transparent 70%);display:flex;align-items:center;justify-content:center;font-size:34px;margin-bottom:20px;animation:orb-beat 1.1s ease-in-out infinite}.detect-label{font-size:14px;font-family:monospace;color:#64748b;margin-bottom:18px}.dot-row{display:flex;gap:8px}.dot{width:8px;height:8px;border-radius:50%;background:#f5c400;animation:dot-up .7s ease-in-out infinite alternate}@keyframes orb-beat{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}@keyframes dot-up{from{transform:translateY(0);opacity:.35}to{transform:translateY(-7px);opacity:1}}`;

const css = `
*{box-sizing:border-box}
.db-root{min-height:100vh;background:var(--black,#0a0a0a);color:var(--white,#f1f5f9);font-family:system-ui,sans-serif;display:flex;flex-direction:column}
.db-topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 24px;border-bottom:1px solid #1f1f1f;background:#0d0d0d;position:sticky;top:0;z-index:40;flex-wrap:wrap;gap:10px}
.db-topbar-left{display:flex;align-items:center;gap:10px}
.db-topbar-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.db-logo-btn{background:none;border:none;cursor:pointer;padding:0;display:flex}
.logo-clause{font-size:18px;font-weight:800;color:#f5c400}
.logo-ai{font-size:18px;font-weight:800;color:#fff}
.escrow-badge{font-size:11px;font-family:monospace;color:#64748b;background:#161616;border:1px solid #2a2a2a;border-radius:99px;padding:3px 10px}
.role-chip{font-size:11px;font-family:monospace;font-weight:700;border:1px solid;border-radius:99px;padding:4px 12px}
.state-chip{font-size:11px;font-family:monospace;border:1px solid;border-radius:99px;padding:4px 12px;background:#111;display:flex;align-items:center;gap:5px}
.pulse-dot{width:6px;height:6px;border-radius:50%;display:inline-block;animation:pdot 1.4s ease-in-out infinite}
@keyframes pdot{0%,100%{opacity:1}50%{opacity:.2}}
.db-grid{display:grid;grid-template-columns:340px 1fr;gap:20px;padding:24px;max-width:1120px;margin:0 auto;width:100%;flex:1}
.db-left,.db-right{display:flex;flex-direction:column;gap:12px}
.role-card{border:1px solid;border-radius:14px;padding:18px 20px}
.role-card-tag{font-size:11px;font-family:monospace;text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px}
.role-card-name{font-size:20px;font-weight:800}
.role-card-wallet{font-size:11px;font-family:monospace;color:#475569;margin-top:4px}
.timeout-banner{background:#f59e0b10;border:1px solid #f59e0b;border-radius:10px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.timeout-title{font-size:13px;font-weight:700;color:#f59e0b}
.timeout-sub{font-size:11px;color:#94a3b8;margin-top:2px}
.timeout-btn{background:#f59e0b;color:#0a0a0a;border:none;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px;flex-shrink:0}
.tx-banner{border:1px solid;border-radius:8px;padding:10px 14px;font-size:11px;font-family:monospace}
.actions-section{display:flex;flex-direction:column;gap:8px}
.actions-title{font-size:10px;font-family:monospace;color:#475569;text-transform:uppercase;letter-spacing:.12em}
.info-box{border:1px solid;border-radius:8px;padding:10px 14px;font-size:12px;line-height:1.65}
.primary-btn{width:100%;padding:13px 16px;border:none;border-radius:10px;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:7px}
.danger-btn{width:100%;padding:12px 16px;background:transparent;color:#f87171;border:1px solid #7f1d1d;border-radius:10px;font-size:13px;font-weight:600}
.waiting-pill{width:100%;padding:13px 16px;background:#22c55e08;border:1px solid #22c55e30;border-radius:10px;font-size:13px;font-weight:600;color:#22c55e;display:flex;align-items:center;justify-content:center;gap:8px}
.waiting-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;flex-shrink:0;animation:pdot 1.4s ease-in-out infinite}
.finished-card{border:1px solid #1f1f1f;border-radius:14px;padding:28px 20px;text-align:center;background:#111}
.finished-icon{font-size:34px}
.finished-title{font-size:17px;font-weight:800;margin-top:10px}
.finished-sub{font-size:13px;color:#94a3b8;margin-top:6px;line-height:1.5}
.new-agreement-btn{margin-top:20px;padding:12px 24px;background:#f5c400;color:#0a0a0a;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer}
.amount-card{background:linear-gradient(135deg,#140f00 0%,#111 100%);border:1px solid #f5c40022;border-radius:16px;padding:24px;text-align:center;position:relative;overflow:hidden}
.amount-label{font-size:10px;font-family:monospace;color:#f5c400;text-transform:uppercase;letter-spacing:.18em;margin-bottom:10px}
.amount-sbtc{font-size:38px;font-weight:900;color:#f5c400;letter-spacing:-1.5px;line-height:1}
.amount-unit{font-size:13px;font-family:monospace;color:#f5c400;margin-top:3px}
.amount-usd{font-size:15px;color:#fff;margin-top:8px;font-weight:600}
.amount-micro{font-size:10px;font-family:monospace;color:#334155;margin-top:6px}
.timeline-card{background:#111;border:1px solid #1f1f1f;border-radius:12px;padding:16px 18px}
.timeline-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.section-label{font-size:10px;font-family:monospace;color:#475569;text-transform:uppercase;letter-spacing:.1em}
.polled-label{font-size:9px;font-family:monospace;color:#334155}
.progress-track{height:4px;background:#1e293b;border-radius:99px;overflow:hidden;margin-bottom:12px}
.progress-fill{height:100%;border-radius:99px;transition:width .4s ease}
.timeline-cells{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.timeline-cell{text-align:center}
.tc-value{font-size:13px;font-weight:700;font-family:monospace}
.tc-label{font-size:9px;color:#334155;text-transform:uppercase;letter-spacing:.08em;margin-top:3px}
.terms-card{background:#111;border:1px solid #1f1f1f;border-radius:12px;overflow:hidden}
.terms-header{padding:10px 16px;border-bottom:1px solid #1a1a1a;font-size:10px;font-family:monospace;color:#475569;text-transform:uppercase;letter-spacing:.1em}
.terms-row{display:flex;justify-content:space-between;align-items:flex-start;padding:9px 16px;border-bottom:1px solid #0f0f0f;gap:12px}
.terms-row:last-child{border-bottom:none}
.terms-key{font-size:11px;font-family:monospace;color:#475569;flex-shrink:0}
.terms-val{font-size:12px;font-weight:600;text-align:right;line-height:1.4}
.parties-row{display:flex;align-items:center;gap:10px}
.party-card{flex:1;background:#111;border:1px solid;border-radius:10px;padding:12px 14px}
.party-role{font-size:9px;font-family:monospace;text-transform:uppercase;letter-spacing:.12em;margin-bottom:4px;display:flex;align-items:center;gap:5px}
.party-you{border-radius:4px;padding:1px 5px;font-size:8px}
.party-name{font-size:13px;font-weight:700}
.party-status{font-size:10px;font-family:monospace;margin-top:4px}
.party-wallet{font-size:9px;font-family:monospace;color:#334155;margin-top:3px}
.parties-arrow{display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0}
.spinner{width:14px;height:14px;border:2px solid #0a0a0a40;border-top-color:transparent;border-radius:50%;display:inline-block;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.modal-overlay{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px}
.modal-box{background:#111;border:1px solid #7f1d1d;border-radius:16px;padding:28px 24px;max-width:420px;width:100%;text-align:center}
.modal-title{font-size:18px;font-weight:800;color:#fca5a5;margin-bottom:10px}
.modal-body{font-size:13px;color:#94a3b8;line-height:1.7;margin-bottom:22px}
.modal-actions{display:flex;gap:10px}
.modal-cancel{flex:1;padding:12px;background:transparent;color:#94a3b8;border:1px solid #1f1f1f;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600}
.modal-confirm{flex:2;padding:12px;background:#7f1d1d;color:#fca5a5;border:1px solid #991b1b;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px}
.modal-confirm:disabled{opacity:.5;cursor:not-allowed}
@media(max-width:780px){.db-grid{grid-template-columns:1fr;padding:16px}.db-topbar{padding:10px 16px}}
`;
