"use client";
// ============================================================
// app/agreement/[id]/page.tsx
//
// Party B FLOW (receiver — never deposits anything):
//
//  STEP 1: review-terms   → read terms, tick checkbox
//  STEP 2: connect-wallet → connect Leather, register presence
//  STEP 3: approve        → click "Approve Agreement"
//                           live status shows when Party A approves too
//  STEP 4: waiting-funds  → BOTH approved, waiting for Party A
//                           to lock funds on-chain (SSE watches)
//  STEP 5: auto-redirect  → SSE fires contractDeployed → /dashboard
//
//  "Go to Dashboard" button NEVER shown until Party A locks funds.
//  Party B deposits NOTHING. Party B only confirms and waits.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchTermsForPartyBThunk,
  connectWalletThunk,
  registerPresenceThunk,
  setAsPartyB,
} from "@/store/slices/agreementSlice";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Step =
  | "loading"
  | "review-terms"
  | "connect-wallet"
  | "approve"
  | "waiting-funds"
  | "error";

interface LiveState {
  partyAApproved: boolean;
  partyBApproved: boolean;
  partyA: string | null;
  partyB: string | null;
  contractDeployed: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const agreementId = params?.id as string;

  const { editedTerms, walletAddress, parseLoading, parseError } =
    useAppSelector((s) => s.agreement);

  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveState>({
    partyAApproved: false,
    partyBApproved: false,
    partyA: null,
    partyB: null,
    contractDeployed: false,
  });

  const sseUnsubRef = useRef<(() => void) | null>(null);

  // ── Load terms on mount ───────────────────────────────────────────────────

  useEffect(() => {
    if (!agreementId) {
      setStep("error");
      setError("Invalid agreement link.");
      return;
    }

    async function init() {
      // Returning visitor: wallet already saved for this agreement
      if (typeof window !== "undefined") {
        const savedAddr = localStorage.getItem("clauseai_wallet_address");
        const savedIsB =
          localStorage.getItem(`clauseai_is_party_b_${agreementId}`) === "true";
        if (savedAddr && savedIsB) {
          await dispatch(fetchTermsForPartyBThunk(agreementId));
          dispatch(setAsPartyB({ agreementId, address: savedAddr }));
          await fetchLiveState(agreementId);
          openSSE(agreementId);
          setStep("approve");
          return;
        }
      }

      // First visit
      const result = await dispatch(fetchTermsForPartyBThunk(agreementId));
      if (fetchTermsForPartyBThunk.rejected.match(result)) {
        setStep("error");
        setError(
          (result.payload as string) ??
            "Failed to load agreement. The link may be invalid or expired.",
        );
        return;
      }
      const presence = (result as any).payload;
      if (!presence?.termsSnapshot) {
        setStep("error");
        setError(
          "Agreement terms not found. Party A may not have completed setup yet.",
        );
        return;
      }
      setStep("review-terms");
    }

    init();
    return () => {
      sseUnsubRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreementId]);

  // ── SSE: one persistent connection ───────────────────────────────────────

  function openSSE(id: string) {
    sseUnsubRef.current?.();

    let es: EventSource | null = null;
    let closed = false;
    let retryDelay = 2_000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (closed) return;
      es = new EventSource(`${API_BASE}/api/agreement/${id}/events`);

      es.onmessage = (e) => {
        retryDelay = 2_000;
        try {
          const data = JSON.parse(e.data) as Partial<LiveState>;
          setLive((prev) => {
            const next: LiveState = {
              partyAApproved: data.partyAApproved ?? prev.partyAApproved,
              partyBApproved: data.partyBApproved ?? prev.partyBApproved,
              partyA: data.partyA ?? prev.partyA,
              partyB: data.partyB ?? prev.partyB,
              contractDeployed: data.contractDeployed ?? prev.contractDeployed,
            };
            // Both approved → advance UI
            if (next.partyAApproved && next.partyBApproved) {
              setStep((s) => (s === "approve" ? "waiting-funds" : s));
            }
            // Party A locked funds → go to dashboard automatically
            if (next.contractDeployed) {
              closed = true;
              es?.close();
              router.push("/dashboard");
            }
            return next;
          });
        } catch {
          /* ignore malformed events */
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) {
          retryTimer = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 30_000);
            connect();
          }, retryDelay);
        }
      };
    }

    connect();

    sseUnsubRef.current = () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }

  async function fetchLiveState(id: string) {
    try {
      const res = await fetch(`${API_BASE}/api/agreement/${id}`);
      const data = await res.json();
      const next: LiveState = {
        partyAApproved: data.partyAApproved ?? false,
        partyBApproved: data.partyBApproved ?? false,
        partyA: data.partyA ?? null,
        partyB: data.partyB ?? null,
        contractDeployed: data.contractDeployed ?? false,
      };
      setLive(next);
      if (next.partyAApproved && next.partyBApproved) setStep("waiting-funds");
      if (next.contractDeployed) router.push("/dashboard");
    } catch {
      /* non-fatal */
    }
  }

  // ── Step 2: Connect + register ────────────────────────────────────────────

  async function handleConnectWallet() {
    setIsConnecting(true);
    setConnectError(null);
    try {
      const walletResult = await dispatch(connectWalletThunk());
      if (!connectWalletThunk.fulfilled.match(walletResult)) {
        throw new Error(
          (walletResult.payload as string) ?? "Wallet connection failed",
        );
      }
      const address = walletResult.payload as string;

      const regResult = await dispatch(
        registerPresenceThunk({ agreementId, role: "partyB", address }),
      );
      if (!registerPresenceThunk.fulfilled.match(regResult)) {
        throw new Error("Failed to register with agreement. Please try again.");
      }

      dispatch(setAsPartyB({ agreementId, address }));
      await fetchLiveState(agreementId);
      openSSE(agreementId);
      setStep("approve");
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  }

  // ── Step 3: Approve ───────────────────────────────────────────────────────

  async function handleApprove() {
    if (!walletAddress) return;
    setApproving(true);
    setApproveError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/agreement/${agreementId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "partyB", address: walletAddress }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Approval failed");

      setLive((prev) => {
        const next = {
          ...prev,
          partyBApproved: true,
          partyAApproved: data.partyAApproved ?? prev.partyAApproved,
        };
        if (next.partyAApproved && next.partyBApproved)
          setStep("waiting-funds");
        return next;
      });
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (step === "loading" || parseLoading)
    return <ScreenLoading agreementId={agreementId} />;
  if (step === "error")
    return <ScreenError error={error ?? parseError ?? "Unknown error"} />;
  if (step === "review-terms")
    return (
      <ScreenReviewTerms
        editedTerms={editedTerms as Record<string, unknown> | null}
        agreementId={agreementId}
        termsAccepted={termsAccepted}
        setTermsAccepted={setTermsAccepted}
        onProceed={() => setStep("connect-wallet")}
      />
    );
  if (step === "connect-wallet")
    return (
      <ScreenConnectWallet
        isConnecting={isConnecting}
        error={connectError}
        onConnect={handleConnectWallet}
      />
    );
  if (step === "approve")
    return (
      <ScreenApprove
        agreementId={agreementId}
        walletAddress={walletAddress}
        editedTerms={editedTerms as Record<string, unknown> | null}
        live={live}
        approving={approving}
        approveError={approveError}
        onApprove={handleApprove}
      />
    );
  if (step === "waiting-funds")
    return (
      <ScreenWaitingForFunds
        walletAddress={walletAddress}
        live={live}
        editedTerms={editedTerms as Record<string, unknown> | null}
      />
    );
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREENS
// ─────────────────────────────────────────────────────────────────────────────

function ScreenLoading({ agreementId }: { agreementId: string }) {
  return (
    <CenterLayout>
      <div style={{ textAlign: "center" }}>
        <Spinner size={40} />
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            marginTop: 20,
            marginBottom: 8,
          }}
        >
          Loading agreement...
        </h2>
        <p
          style={{
            color: "var(--grey-1)",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
          }}
        >
          #{agreementId}
        </p>
      </div>
    </CenterLayout>
  );
}

function ScreenError({ error }: { error: string }) {
  return (
    <CenterLayout>
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        <div style={{ fontSize: 48, marginBottom: 24 }}>❌</div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 12,
            color: "#f87171",
          }}
        >
          Agreement not found
        </h2>
        <p
          style={{
            color: "var(--grey-1)",
            fontSize: 13,
            lineHeight: 1.7,
            background: "#7f1d1d20",
            border: "1px solid #7f1d1d",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 24,
            textAlign: "left",
          }}
        >
          {error}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "12px 28px",
            background: "var(--yellow)",
            color: "var(--black)",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </CenterLayout>
  );
}

function ScreenReviewTerms({
  editedTerms,
  agreementId,
  termsAccepted,
  setTermsAccepted,
  onProceed,
}: {
  editedTerms: Record<string, unknown> | null;
  agreementId: string;
  termsAccepted: boolean;
  setTermsAccepted: (v: boolean) => void;
  onProceed: () => void;
}) {
  const rows = [
    {
      label: "Payer (Party A)",
      value: readField(editedTerms, "partyA", "payer"),
    },
    {
      label: "Receiver (You)",
      value: readField(editedTerms, "partyB", "receiver"),
    },
    {
      label: "Amount",
      value: (() => {
        const r = readField(editedTerms, "amount_usd", "total_usd");
        return r === "—" ? "—" : `$${r} USD`;
      })(),
      highlight: true,
    },
    { label: "Condition", value: readCondition(editedTerms) },
    { label: "Deadline", value: readDeadline(editedTerms) },
    { label: "Arbitrator", value: readField(editedTerms, "arbitrator") },
  ];

  return (
    <CenterLayout>
      <div style={{ maxWidth: 560, width: "100%" }}>
        <StepTag>You've been invited</StepTag>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: "-1px",
            margin: "12px 0 8px",
          }}
        >
          Review agreement terms
        </h1>
        <p
          style={{
            color: "var(--grey-1)",
            fontSize: 14,
            marginBottom: 28,
            lineHeight: 1.7,
          }}
        >
          Agreement{" "}
          <span
            style={{ fontFamily: "var(--font-mono)", color: "var(--white)" }}
          >
            #{agreementId}
          </span>{" "}
          — review carefully before joining. Once both parties approve, the
          payer will lock funds on-chain.{" "}
          <strong style={{ color: "var(--white)" }}>
            You do not pay anything.
          </strong>
        </p>

        <Card style={{ marginBottom: 20 }}>
          <CardHeader>📋 Agreement Terms</CardHeader>
          {editedTerms ? (
            rows.map((row, i) => (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  padding: "12px 20px",
                  borderBottom:
                    i < rows.length - 1 ? "1px solid var(--black-4)" : "none",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--grey-1)",
                    textTransform: "uppercase",
                    flexShrink: 0,
                    marginRight: 16,
                  }}
                >
                  {row.label}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: row.highlight ? 700 : 600,
                    color: row.highlight
                      ? "var(--yellow)"
                      : row.value === "—"
                        ? "var(--grey-2)"
                        : "var(--white)",
                    textAlign: "right",
                  }}
                >
                  {row.value}
                </span>
              </div>
            ))
          ) : (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--grey-1)",
                fontSize: 13,
              }}
            >
              Terms unavailable.
            </div>
          )}
        </Card>

        <Checkbox checked={termsAccepted} onChange={setTermsAccepted}>
          I have read and agree to these terms. I understand the payer will lock
          funds in a Bitcoin-secured smart contract, and I will receive payment
          once conditions are met.
        </Checkbox>

        <button
          onClick={() => {
            if (termsAccepted) onProceed();
          }}
          disabled={!termsAccepted}
          style={{
            width: "100%",
            padding: "16px",
            marginTop: 16,
            background: termsAccepted ? "var(--yellow)" : "var(--black-4)",
            color: termsAccepted ? "var(--black)" : "var(--grey-2)",
            border: "none",
            borderRadius: "var(--radius)",
            fontSize: 15,
            fontWeight: 700,
            cursor: termsAccepted ? "pointer" : "not-allowed",
          }}
        >
          Connect Wallet & Continue →
        </button>
        {!termsAccepted && (
          <p
            style={{
              marginTop: 10,
              textAlign: "center",
              fontSize: 12,
              color: "var(--grey-2)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Tick the checkbox to continue
          </p>
        )}
      </div>
    </CenterLayout>
  );
}

function ScreenConnectWallet({
  isConnecting,
  error,
  onConnect,
}: {
  isConnecting: boolean;
  error: string | null;
  onConnect: () => void;
}) {
  return (
    <CenterLayout>
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: "var(--yellow-dim)",
            border: "1px solid var(--yellow)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            margin: "0 auto 24px",
          }}
        >
          {isConnecting ? <Spinner size={28} /> : "₿"}
        </div>
        <StepTag>Step 2 of 3</StepTag>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: "-0.5px",
            margin: "12px 0",
          }}
        >
          Connect your wallet
        </h2>
        <p
          style={{
            color: "var(--grey-1)",
            fontSize: 14,
            lineHeight: 1.7,
            marginBottom: 28,
          }}
        >
          Connect your Leather wallet to register as the receiver.{" "}
          <strong style={{ color: "var(--white)" }}>
            You won't be charged anything.
          </strong>
        </p>
        {error && <ErrorBox style={{ marginBottom: 16 }}>{error}</ErrorBox>}
        <button
          onClick={onConnect}
          disabled={isConnecting}
          style={{
            width: "100%",
            padding: "16px",
            background: isConnecting ? "var(--black-4)" : "var(--yellow)",
            color: isConnecting ? "var(--grey-2)" : "var(--black)",
            border: "none",
            borderRadius: "var(--radius)",
            fontSize: 15,
            fontWeight: 700,
            cursor: isConnecting ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {isConnecting ? (
            <>
              <Spinner size={16} /> Connecting...
            </>
          ) : (
            "Connect Leather Wallet"
          )}
        </button>
        <div
          style={{
            marginTop: 20,
            padding: "12px 16px",
            background: "var(--black-2)",
            border: "1px solid var(--black-4)",
            borderRadius: 8,
            display: "flex",
            gap: 10,
            textAlign: "left",
          }}
        >
          <span>🔒</span>
          <p
            style={{
              fontSize: 12,
              color: "var(--grey-1)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            ClauseAI never holds your keys. You're only registering your address
            as the funds receiver.
          </p>
        </div>
      </div>
    </CenterLayout>
  );
}

// Step 3: Party B approves. Shows live status of Party A in real time.
// NO "Go to Dashboard" button here. Only "Approve Agreement".
function ScreenApprove({
  agreementId,
  walletAddress,
  editedTerms,
  live,
  approving,
  approveError,
  onApprove,
}: {
  agreementId: string;
  walletAddress: string | null;
  editedTerms: Record<string, unknown> | null;
  live: LiveState;
  approving: boolean;
  approveError: string | null;
  onApprove: () => void;
}) {
  const terms = editedTerms as any;
  const payerName = terms?.payer ?? terms?.partyA ?? "Party A";
  const totalAmount = terms?.total_usd ?? terms?.amount_usd ?? "—";
  const arbitrator = terms?.arbitrator ?? "TBD";

  return (
    <CenterLayout>
      <div style={{ maxWidth: 560, width: "100%" }}>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.2}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

        <StepTag>Step 3 of 3</StepTag>
        <h2
          style={{
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: "-1px",
            margin: "12px 0 8px",
          }}
        >
          Approve the agreement
        </h2>
        <p
          style={{
            color: "var(--grey-1)",
            fontSize: 14,
            lineHeight: 1.7,
            marginBottom: 28,
          }}
        >
          {payerName} has set up this escrow. Review the terms carefully —
          especially the arbitrator — before approving.
        </p>

        {/* Live approval status — both parties visible */}
        <Card style={{ marginBottom: 20, padding: "18px 20px" }}>
          <div
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--grey-2)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 14,
            }}
          >
            Approval Status · Agreement #{agreementId}
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            <PartyCard
              label="Payer (Party A)"
              wallet={live.partyA}
              approved={live.partyAApproved}
              color="#f5c400"
            />
            <PartyCard
              label="You (Receiver)"
              wallet={walletAddress}
              approved={live.partyBApproved}
              isMe
              color="#22c55e"
            />
          </div>
        </Card>

        {/* Key terms */}
        <Card style={{ marginBottom: 20 }}>
          <CardHeader>Key Terms</CardHeader>
          {[
            {
              label: "Amount you'll receive",
              value: totalAmount === "—" ? "—" : `$${totalAmount} USD`,
              highlight: true,
            },
            { label: "Condition", value: readCondition(editedTerms) },
            { label: "Deadline", value: readDeadline(editedTerms) },
            {
              label: "Arbitrator",
              value:
                arbitrator === "TBD"
                  ? "⚠️ None set"
                  : `${String(arbitrator).slice(0, 10)}…${String(arbitrator).slice(-6)}`,
            },
          ].map((r, i, arr) => (
            <div
              key={r.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "10px 20px",
                borderBottom:
                  i < arr.length - 1 ? "1px solid var(--black-4)" : "none",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: "var(--grey-1)",
                  fontFamily: "var(--font-mono)",
                  textTransform: "uppercase",
                }}
              >
                {r.label}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: r.highlight ? "var(--yellow)" : "var(--white)",
                  textAlign: "right",
                }}
              >
                {r.value}
              </span>
            </div>
          ))}
        </Card>

        {approveError && (
          <ErrorBox style={{ marginBottom: 16 }}>{approveError}</ErrorBox>
        )}

        {/* THE ONLY CTA: Approve button — or waiting state after clicking */}
        {!live.partyBApproved ? (
          <button
            onClick={onApprove}
            disabled={approving}
            style={{
              width: "100%",
              padding: "16px",
              background: approving ? "var(--black-4)" : "var(--yellow)",
              color: approving ? "var(--grey-2)" : "var(--black)",
              border: "none",
              borderRadius: "var(--radius)",
              fontSize: 15,
              fontWeight: 700,
              cursor: approving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            {approving ? (
              <>
                <Spinner size={16} /> Approving...
              </>
            ) : (
              "✓ Approve Agreement"
            )}
          </button>
        ) : (
          <div
            style={{
              background: "rgba(245,196,0,0.05)",
              border: "1px solid rgba(245,196,0,0.2)",
              borderRadius: 10,
              padding: "16px 20px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                marginBottom: 6,
              }}
            >
              <PulseDot color="#f5c400" />
              <span style={{ fontSize: 14, fontWeight: 700, color: "#f5c400" }}>
                You approved — waiting for {payerName} to approve
              </span>
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--grey-2)",
                fontFamily: "var(--font-mono)",
                margin: 0,
              }}
            >
              This page updates automatically via live connection.
            </p>
          </div>
        )}
      </div>
    </CenterLayout>
  );
}

// Step 4: Both approved. Party B just waits.
// NO button. Auto-redirect when Party A locks funds on-chain (SSE).
function ScreenWaitingForFunds({
  walletAddress,
  live,
  editedTerms,
}: {
  walletAddress: string | null;
  live: LiveState;
  editedTerms: Record<string, unknown> | null;
}) {
  const terms = editedTerms as any;
  const payerName = terms?.payer ?? terms?.partyA ?? "Party A";
  const totalAmount = terms?.total_usd ?? terms?.amount_usd ?? "—";

  return (
    <CenterLayout>
      <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.2}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: "50%",
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 42,
            margin: "0 auto 28px",
          }}
        >
          ✅
        </div>

        <h2
          style={{
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: "-0.5px",
            marginBottom: 10,
          }}
        >
          Agreement fully approved
        </h2>
        <p
          style={{
            color: "var(--grey-1)",
            fontSize: 14,
            lineHeight: 1.8,
            marginBottom: 32,
          }}
        >
          Both parties have approved. Now waiting for{" "}
          <strong style={{ color: "var(--white)" }}>{payerName}</strong> to
          deploy the contract and lock
          {totalAmount !== "—" ? ` $${totalAmount} USD` : " the funds"}.{" "}
          <strong style={{ color: "var(--white)" }}>
            You'll be taken to your dashboard automatically
          </strong>{" "}
          as soon as the funds are locked — no action needed from you.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: 24,
          }}
        >
          <PartyCard
            label="Payer (Party A)"
            wallet={live.partyA}
            approved={live.partyAApproved}
            color="#f5c400"
          />
          <PartyCard
            label="You (Receiver)"
            wallet={walletAddress}
            approved={live.partyBApproved}
            isMe
            color="#22c55e"
          />
        </div>

        {/* Status — just informational, no button */}
        <div
          style={{
            background: "rgba(245,196,0,0.05)",
            border: "1px solid rgba(245,196,0,0.15)",
            borderRadius: 12,
            padding: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <PulseDot color="#f5c400" />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#f5c400" }}>
              Waiting for {payerName} to lock funds
            </span>
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--grey-2)",
              lineHeight: 1.7,
              margin: 0,
              fontFamily: "var(--font-mono)",
            }}
          >
            This page is connected live and will redirect you to your dashboard
            automatically when funds are locked. You don't need to do anything.
          </p>
        </div>
      </div>
    </CenterLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UI Primitives
// ─────────────────────────────────────────────────────────────────────────────

function CenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--black)",
      }}
    >
      {children}
    </div>
  );
}

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--black-2)",
        border: "1px solid var(--black-4)",
        borderRadius: 14,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "13px 20px",
        borderBottom: "1px solid var(--black-4)",
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}

function StepTag({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "inline-block",
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        color: "var(--yellow)",
        letterSpacing: "0.15em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function ErrorBox({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "#7f1d1d20",
        border: "1px solid #7f1d1d",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 13,
        color: "#fca5a5",
        textAlign: "left",
        ...style,
      }}
    >
      ❌ {children}
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        cursor: "pointer",
        padding: "14px 16px",
        background: checked ? "rgba(245,196,0,0.05)" : "var(--black-2)",
        border: `1px solid ${checked ? "var(--yellow)" : "var(--black-4)"}`,
        borderRadius: 10,
        transition: "all 0.2s",
        userSelect: "none",
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          flexShrink: 0,
          marginTop: 1,
          border: `2px solid ${checked ? "var(--yellow)" : "var(--grey-2)"}`,
          background: checked ? "var(--yellow)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s",
        }}
      >
        {checked && (
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--black)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <span style={{ fontSize: 13, lineHeight: 1.6, color: "var(--grey-1)" }}>
        {children}
      </span>
    </div>
  );
}

function PartyCard({
  label,
  wallet,
  approved,
  isMe = false,
  color,
}: {
  label: string;
  wallet: string | null;
  approved: boolean;
  isMe?: boolean;
  color: string;
}) {
  return (
    <div
      style={{
        background: approved ? `${color}08` : "rgba(242,242,240,0.02)",
        border: `1px solid ${approved ? `${color}25` : "rgba(242,242,240,0.07)"}`,
        borderRadius: 10,
        padding: "12px 14px",
        transition: "all 0.3s",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color,
          marginBottom: 6,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {label}
        {isMe && (
          <span
            style={{
              background: `${color}20`,
              color,
              borderRadius: 4,
              padding: "1px 5px",
              fontSize: 8,
            }}
          >
            YOU
          </span>
        )}
      </div>
      {wallet && (
        <div
          style={{
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            color: "rgba(242,242,240,0.25)",
            marginBottom: 4,
          }}
        >
          {wallet.slice(0, 8)}…{wallet.slice(-6)}
        </div>
      )}
      <div
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: approved ? color : "rgba(242,242,240,0.3)",
          fontWeight: approved ? 700 : 400,
        }}
      >
        {approved ? "Approved ✓" : "Pending…"}
      </div>
    </div>
  );
}

function PulseDot({ color = "#f5c400" }: { color?: string }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        animation: "pulse 1.4s ease-in-out infinite",
        flexShrink: 0,
      }}
    />
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        border: "2px solid var(--grey-2)",
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Term helpers (V1 + V2 schemas)
// ─────────────────────────────────────────────────────────────────────────────

function readField(
  t: Record<string, unknown> | null,
  ...keys: string[]
): string {
  if (!t) return "—";
  for (const k of keys) {
    const v = t[k];
    if (v !== undefined && v !== null && String(v).trim() !== "")
      return String(v);
  }
  return "—";
}

function readCondition(t: Record<string, unknown> | null): string {
  if (!t) return "—";
  const top = readField(t, "condition");
  if (top !== "—") return top;
  const ms = t.milestones;
  if (Array.isArray(ms) && ms.length > 0) {
    const c = (ms[0] as Record<string, unknown>).condition;
    if (c && String(c).trim()) return String(c);
  }
  return "—";
}

function readDeadline(t: Record<string, unknown> | null): string {
  if (!t) return "—";
  const top = readField(t, "deadline");
  if (top !== "—") return top;
  const ms = t.milestones;
  if (Array.isArray(ms) && ms.length > 0) {
    const d = (ms[0] as Record<string, unknown>).deadline;
    if (d && String(d).trim()) return String(d);
  }
  return "—";
}
