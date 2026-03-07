"use client";
// app/agreement/[id]/page.tsx

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchTermsForPartyBThunk,
  rehydratePartyBThunk,
  connectWalletThunk,
  registerPresenceThunk,
  setAsPartyB,
  setScreen,
} from "@/store/slices/agreementSlice";

type JoinStep =
  | "loading"
  | "review-terms"
  | "connect-wallet"
  | "depositing"
  | "error";

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const agreementId = params?.id as string;

  const {
    editedTerms,
    walletConnected,
    walletAddress,
    presenceRegistered,
    counterpartyWallet,
    parseLoading,
    parseError,
    txDeposit,
    myDepositDone,
  } = useAppSelector((s) => s.agreement);

  const [step, setStep] = useState<JoinStep>("loading");
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  // ── CRITICAL: termsAccepted is local state only, never set to true by default
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    if (!agreementId) {
      setStep("error");
      setError("Invalid agreement link — missing ID.");
      return;
    }

    async function initialize() {
      if (typeof window !== "undefined") {
        const storedAddress = localStorage.getItem("clauseai_wallet_address");
        const storedIsPartyB =
          localStorage.getItem(`clauseai_is_party_b_${agreementId}`) === "true";

        if (storedAddress && storedIsPartyB) {
          const result = await dispatch(rehydratePartyBThunk(agreementId));
          if (rehydratePartyBThunk.fulfilled.match(result) && result.payload) {
            setStep("depositing");
            return;
          }
        }
      }

      const result = await dispatch(fetchTermsForPartyBThunk(agreementId));
      if (fetchTermsForPartyBThunk.rejected.match(result)) {
        setStep("error");
        setError(
          (result.payload as string) ??
            "Failed to load agreement. The link may be invalid or expired.",
        );
        return;
      }

      if (!fetchTermsForPartyBThunk.fulfilled.match(result)) {
        setStep("error");
        setError("Failed to load agreement terms.");
        return;
      }

      const presence = result.payload;
      if (!presence?.termsSnapshot) {
        setStep("error");
        setError(
          "Agreement terms not found. Party A may not have completed setup yet.",
        );
        return;
      }

      setStep("review-terms");
    }

    initialize();
  }, [agreementId, dispatch]);

  useEffect(() => {
    if (myDepositDone && step === "depositing") {
      setTimeout(() => router.push("/dashboard"), 1500);
    }
  }, [myDepositDone, step, router]);

  async function handleConnectWallet() {
    setIsConnecting(true);
    setError(null);
    try {
      const result = await dispatch(connectWalletThunk());
      if (!connectWalletThunk.fulfilled.match(result)) {
        throw new Error((result.payload as string) ?? "Wallet connect failed");
      }

      const address = result.payload as string;

      const regResult = await dispatch(
        registerPresenceThunk({
          agreementId,
          role: "partyB",
          address,
        }),
      );

      if (!registerPresenceThunk.fulfilled.match(regResult)) {
        throw new Error("Failed to register with agreement. Please try again.");
      }

      dispatch(setAsPartyB({ agreementId, address }));
      setStep("depositing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  }

  if (step === "loading" || parseLoading) {
    return <LoadingState agreementId={agreementId} />;
  }

  if (step === "error") {
    return <ErrorState error={error ?? parseError ?? "Unknown error"} />;
  }

  if (step === "review-terms") {
    return (
      <ReviewTermsState
        editedTerms={editedTerms as Record<string, unknown> | null}
        agreementId={agreementId}
        counterpartyWallet={counterpartyWallet}
        termsAccepted={termsAccepted}
        // ── Pass the setter directly so it's fully two-way
        setTermsAccepted={setTermsAccepted}
        onProceed={() => setStep("connect-wallet")}
      />
    );
  }

  if (step === "connect-wallet") {
    return (
      <ConnectWalletState
        isConnecting={isConnecting}
        error={error}
        walletConnected={walletConnected}
        walletAddress={walletAddress}
        presenceRegistered={presenceRegistered}
        onConnect={handleConnectWallet}
      />
    );
  }

  if (step === "depositing") {
    return (
      <DepositState
        editedTerms={editedTerms as Record<string, unknown> | null}
        agreementId={agreementId}
        walletAddress={walletAddress}
        counterpartyWallet={counterpartyWallet}
        txDeposit={txDeposit}
        myDepositDone={myDepositDone}
        dispatch={dispatch}
        router={router}
      />
    );
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Schema helpers — handle both V1 (rental/bet) and V2 (freelance/trade)
//
// V1 snapshot keys: partyA, partyB, condition, deadline, amount_usd, arbitrator
// V2 snapshot keys: payer, receiver, total_usd, milestones[], arbitrator
//   (V2 may also have condition/deadline at top level OR inside milestones[0])
// ─────────────────────────────────────────────────────────────

function isV2(t: Record<string, unknown> | null): boolean {
  if (!t) return false;
  return "payer" in t || "receiver" in t || "total_usd" in t;
}

function readField(
  t: Record<string, unknown> | null,
  ...keys: string[]
): string {
  if (!t) return "—";
  for (const k of keys) {
    const v = t[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v);
    }
  }
  return "—";
}

/** Pull condition text: check top-level first, then first milestone */
function readCondition(t: Record<string, unknown> | null): string {
  if (!t) return "—";
  const top = readField(t, "condition");
  if (top !== "—") return top;
  // V2: try milestones[0].condition
  const ms = t.milestones;
  if (Array.isArray(ms) && ms.length > 0) {
    const c = (ms[0] as Record<string, unknown>).condition;
    if (c && String(c).trim()) return String(c);
  }
  return "—";
}

/** Pull deadline: check top-level first, then first milestone */
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

/** Returns USD amount as a raw numeric string or "—" */
function readAmountRaw(t: Record<string, unknown> | null): string {
  return readField(t, "amount_usd", "total_usd");
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function LoadingState({ agreementId }: { agreementId: string }) {
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

function ErrorState({ error }: { error: string }) {
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

function ReviewTermsState({
  editedTerms,
  agreementId,
  counterpartyWallet,
  termsAccepted,
  setTermsAccepted,
  onProceed,
}: {
  editedTerms: Record<string, unknown> | null;
  agreementId: string;
  counterpartyWallet: string | null;
  termsAccepted: boolean;
  // ── Receive the setter, not a one-way onAccept callback
  setTermsAccepted: (v: boolean) => void;
  onProceed: () => void;
}) {
  const v2 = isV2(editedTerms);

  // Normalised rows — reads from whichever schema the snapshot uses
  const rows: { label: string; value: string; highlight?: boolean }[] = [
    {
      label: "Party A (Initiator)",
      value: readField(editedTerms, "partyA", "payer"),
    },
    {
      label: "Party B (You)",
      value: readField(editedTerms, "partyB", "receiver"),
    },
    {
      label: "Condition / Deliverable",
      value: readCondition(editedTerms),
    },
    {
      label: "Deadline",
      value: readDeadline(editedTerms),
    },
    {
      label: "Amount (USD)",
      value: (() => {
        const raw = readAmountRaw(editedTerms);
        return raw === "—" ? "—" : `$${raw}`;
      })(),
      highlight: true,
    },
    {
      label: "Arbitrator",
      value: readField(editedTerms, "arbitrator"),
    },
  ];

  // V2 milestones (optional table below main rows)
  const milestones =
    v2 && Array.isArray(editedTerms?.milestones)
      ? (editedTerms!.milestones as Array<{
          title?: string;
          label?: string;
          percentage: number;
          deadline?: string;
        }>)
      : null;

  const amountRaw = readAmountRaw(editedTerms);

  // ── Guard: button is ONLY enabled when checkbox is ticked AND terms loaded
  const canProceed = termsAccepted && editedTerms !== null;

  function handleProceed() {
    // Double-guard: never trust just the disabled prop in production
    if (!canProceed) return;
    onProceed();
  }

  return (
    <CenterLayout>
      <div style={{ maxWidth: 560, width: "100%" }}>
        {/* Header */}
        <div className="animate-fade-up" style={{ marginBottom: 32 }}>
          <div
            style={{
              display: "inline-block",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--yellow)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            You've been invited
          </div>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-1px",
              marginBottom: 8,
            }}
          >
            Review agreement terms
          </h1>
          <p style={{ color: "var(--grey-1)", fontSize: 14 }}>
            Agreement{" "}
            <span
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--white)",
                fontWeight: 500,
              }}
            >
              #{agreementId}
            </span>{" "}
            — review carefully before connecting your wallet. Funds will be
            locked on-chain.
          </p>
        </div>

        {/* Party A badge */}
        {counterpartyWallet && (
          <div
            className="animate-fade-up delay-1"
            style={{
              background: "var(--black-2)",
              border: "1px solid #22c55e40",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ color: "#22c55e" }}>✅</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#22c55e" }}>
                Party A connected
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  color: "var(--grey-2)",
                }}
              >
                {counterpartyWallet}
              </div>
            </div>
          </div>
        )}

        {/* Terms table */}
        <div
          className="animate-fade-up delay-2"
          style={{
            background: "var(--black-2)",
            border: "1px solid var(--black-4)",
            borderRadius: 16,
            overflow: "hidden",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid var(--black-4)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>📋</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              Agreement Terms
            </span>
          </div>

          {editedTerms ? (
            <>
              {rows.map((row, i) => (
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
              ))}

              {/* V2 milestones */}
              {milestones && milestones.length > 0 && (
                <div style={{ borderTop: "1px solid var(--black-4)" }}>
                  <div
                    style={{
                      padding: "10px 20px 6px",
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: "var(--grey-2)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Payment milestones
                  </div>
                  {milestones.map((ms, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "8px 20px",
                        borderTop: "1px solid var(--black-4)",
                      }}
                    >
                      <span style={{ fontSize: 12, color: "var(--grey-1)" }}>
                        {ms.title ?? ms.label ?? `Milestone ${i + 1}`}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontFamily: "var(--font-mono)",
                          color: "var(--grey-2)",
                        }}
                      >
                        {ms.percentage}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--grey-1)",
                fontSize: 13,
              }}
            >
              Terms not available. Party A may not have completed setup.
            </div>
          )}
        </div>

        {/*
          ── CHECKBOX ─────────────────────────────────────────────────────────
          Implemented as a controlled div, NOT a native <input> inside a <label>.
          Reason: native checkbox inside a label fires both onClick (on label) AND
          onChange (on input), creating double-fire edge cases. The original code
          also used one-way binding: onChange={(e) => e.target.checked && onAccept()}
          meaning unchecking never set termsAccepted back to false. This is fully
          two-way via setTermsAccepted(!termsAccepted), with keyboard support.
          ─────────────────────────────────────────────────────────────────────
        */}
        <div
          className="animate-fade-up delay-3"
          role="checkbox"
          aria-checked={termsAccepted}
          tabIndex={0}
          onClick={() => setTermsAccepted(!termsAccepted)}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              setTermsAccepted(!termsAccepted);
            }
          }}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            cursor: "pointer",
            marginBottom: 20,
            padding: "14px 16px",
            background: termsAccepted ? "var(--yellow-dim)" : "var(--black-2)",
            border: `1px solid ${termsAccepted ? "var(--yellow)" : "var(--black-4)"}`,
            borderRadius: 10,
            transition: "all 0.2s",
            userSelect: "none",
          }}
        >
          {/* Custom checkbox visual — driven entirely by termsAccepted state */}
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              flexShrink: 0,
              marginTop: 1,
              border: `2px solid ${termsAccepted ? "var(--yellow)" : "var(--grey-2)"}`,
              background: termsAccepted ? "var(--yellow)" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s",
            }}
          >
            {termsAccepted && (
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
          <span
            style={{ fontSize: 13, lineHeight: 1.6, color: "var(--grey-1)" }}
          >
            I have read and agree to the terms above. I understand that funds
            will be locked in a smart contract and only released when conditions
            are met.
          </span>
        </div>

        {/*
          ── BUTTON ───────────────────────────────────────────────────────────
          Three layers of protection:
          1. disabled prop  — prevents form submission, removes from tab order
          2. pointerEvents: "none"  — no click events reach the element at all
          3. handleProceed() guard  — if somehow called, bails out immediately
          ─────────────────────────────────────────────────────────────────────
        */}
        <button
          className="animate-fade-up delay-4"
          onClick={handleProceed}
          disabled={!canProceed}
          aria-disabled={!canProceed}
          style={{
            width: "100%",
            padding: "16px",
            background: canProceed ? "var(--yellow)" : "var(--black-4)",
            color: canProceed ? "var(--black)" : "var(--grey-2)",
            border: "none",
            borderRadius: "var(--radius)",
            fontSize: 15,
            fontWeight: 700,
            cursor: canProceed ? "pointer" : "not-allowed",
            pointerEvents: canProceed ? "auto" : "none",
          }}
        >
          Connect Wallet & Join →
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
            Tick the checkbox above to continue
          </p>
        )}

        {termsAccepted && (
          <p
            style={{
              marginTop: 10,
              textAlign: "center",
              fontSize: 12,
              color: "var(--grey-2)",
              fontFamily: "var(--font-mono)",
            }}
          >
            You'll deposit{amountRaw !== "—" ? ` $${amountRaw}` : ""} into
            escrow after connecting.
          </p>
        )}
      </div>
    </CenterLayout>
  );
}

function ConnectWalletState({
  isConnecting,
  error,
  walletConnected,
  walletAddress,
  presenceRegistered,
  onConnect,
}: {
  isConnecting: boolean;
  error: string | null;
  walletConnected: boolean;
  walletAddress: string | null;
  presenceRegistered: boolean;
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
            background: walletConnected ? "#22c55e15" : "var(--yellow-dim)",
            border: `1px solid ${walletConnected ? "#22c55e" : "var(--yellow)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            margin: "0 auto 24px",
          }}
        >
          {walletConnected ? "✅" : isConnecting ? <Spinner size={28} /> : "₿"}
        </div>

        <span
          style={{
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            color: "var(--yellow)",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            display: "block",
            marginBottom: 12,
          }}
        >
          Joining as Party B
        </span>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: "-0.5px",
            marginBottom: 12,
          }}
        >
          {walletConnected ? "Wallet Connected" : "Connect your wallet"}
        </h2>
        <p
          style={{
            color: "var(--grey-1)",
            fontSize: 14,
            lineHeight: 1.7,
            marginBottom: 28,
          }}
        >
          {walletConnected
            ? `${walletAddress?.slice(0, 10)}...${walletAddress?.slice(-6)}`
            : "Connect your Leather wallet to join this agreement."}
        </p>

        {error && (
          <div
            style={{
              background: "#7f1d1d20",
              border: "1px solid #7f1d1d",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: "#fca5a5",
              marginBottom: 16,
              textAlign: "left",
            }}
          >
            ❌ {error}
          </div>
        )}

        {presenceRegistered && walletConnected ? (
          <div
            style={{
              background: "#22c55e15",
              border: "1px solid #22c55e",
              borderRadius: 10,
              padding: "16px",
              color: "#22c55e",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            ✅ Registered — moving to next step...
          </div>
        ) : (
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
        )}

        <div
          style={{
            marginTop: 24,
            padding: "14px 16px",
            background: "var(--black-2)",
            border: "1px solid var(--black-4)",
            borderRadius: 8,
            display: "flex",
            gap: 10,
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 18 }}>🔒</span>
          <p style={{ fontSize: 12, color: "var(--grey-1)", lineHeight: 1.6 }}>
            ClauseAi never holds your keys. Funds go directly into the smart
            contract, enforced by Bitcoin.
          </p>
        </div>
      </div>
    </CenterLayout>
  );
}

function DepositState({
  editedTerms,
  agreementId,
  walletAddress,
  counterpartyWallet,
  txDeposit,
  myDepositDone,
  dispatch,
  router,
}: {
  editedTerms: Record<string, unknown> | null;
  agreementId: string;
  walletAddress: string | null;
  counterpartyWallet: string | null;
  txDeposit: {
    status: string;
    txId: string | null;
    txUrl: string | null;
    error: string | null;
  };
  myDepositDone: boolean;
  dispatch: ReturnType<typeof useAppDispatch>;
  router: ReturnType<typeof useRouter>;
}) {
  const amountRaw = readAmountRaw(editedTerms);
  const condition = readCondition(editedTerms);

  function handleGoToDashboard() {
    dispatch(setAsPartyB({ agreementId, address: walletAddress! }));
    dispatch(setScreen("dashboard"));
    router.push("/dashboard");
  }

  return (
    <CenterLayout>
      <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
        <div className="animate-fade-up" style={{ marginBottom: 32 }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "#22c55e15",
              border: "1px solid #22c55e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              margin: "0 auto 24px",
            }}
          >
            ✅
          </div>
          <span
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "#22c55e",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              display: "block",
              marginBottom: 12,
            }}
          >
            You're in
          </span>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "-0.5px",
              marginBottom: 12,
            }}
          >
            Wallet connected
          </h2>
          <p style={{ color: "var(--grey-1)", fontSize: 14, lineHeight: 1.7 }}>
            You've joined the agreement. You don't need to deposit anything —
            only the payer locks funds.
          </p>
        </div>

        <div
          className="animate-fade-up delay-1"
          style={{
            background: "var(--black-2)",
            border: "1px solid var(--black-4)",
            borderRadius: 16,
            overflow: "hidden",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid var(--black-4)",
              fontSize: 13,
              fontWeight: 700,
              textAlign: "left",
            }}
          >
            What happens next
          </div>
          {[
            {
              icon: "💸",
              label: "Payer locks funds",
              desc:
                amountRaw === "—"
                  ? "The payer deploys the contract and locks funds."
                  : `The payer deploys the contract and locks $${amountRaw} USD.`,
              color: "#f59e0b",
            },
            {
              icon: "📋",
              label: "Conditions must be met",
              desc:
                condition === "—"
                  ? "Delivery confirmed per agreement terms."
                  : condition,
              color: "var(--white)",
            },
            {
              icon: "🎯",
              label: "You get paid",
              desc: "Once confirmed, funds release directly to your wallet.",
              color: "#22c55e",
            },
          ].map((item, i, arr) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 14,
                padding: "14px 20px",
                textAlign: "left",
                borderBottom:
                  i < arr.length - 1 ? "1px solid var(--black-4)" : "none",
              }}
            >
              <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: item.color,
                    marginBottom: 2,
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--grey-1)",
                    lineHeight: 1.5,
                  }}
                >
                  {item.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          className="animate-fade-up delay-2"
          style={{
            background: "var(--black-2)",
            border: "1px solid #22c55e40",
            borderRadius: 10,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 20,
            textAlign: "left",
          }}
        >
          <span style={{ color: "#22c55e", fontSize: 18 }}>🎯</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#22c55e" }}>
              Receiver (You)
            </div>
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--grey-2)",
              }}
            >
              {walletAddress}
            </div>
          </div>
        </div>

        <button
          className="animate-fade-up delay-3"
          onClick={handleGoToDashboard}
          style={{
            width: "100%",
            padding: "16px",
            background: "var(--yellow)",
            color: "var(--black)",
            border: "none",
            borderRadius: "var(--radius)",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Go to Dashboard →
        </button>

        <p
          style={{
            marginTop: 12,
            fontSize: 12,
            color: "var(--grey-2)",
            fontFamily: "var(--font-mono)",
          }}
        >
          You'll be notified when the payer activates the escrow.
        </p>
      </div>
    </CenterLayout>
  );
}

// ── Shared primitives ─────────────────────────────────────────

function CenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      {children}
    </div>
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
