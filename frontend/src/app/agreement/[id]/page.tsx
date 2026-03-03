"use client";
// ============================================================
// app/agreement/[id]/page.tsx — Party B Join Page
// Route: /agreement/:id
// This is the page Party B lands on when they click the share link.
// Flow:
//   1. Load agreement terms from presence snapshot (Party A saved them)
//   2. Show terms for review
//   3. Connect wallet → register as Party B
//   4. Navigate to ScreenPartyBDeposit
// ============================================================

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppSelector } from "@/store/hooks";
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
  const [termsAccepted, setTermsAccepted] = useState(false);

  // ── On mount: try to rehydrate session or load fresh terms ───
  useEffect(() => {
    if (!agreementId) {
      setStep("error");
      setError("Invalid agreement link — missing ID.");
      return;
    }

    async function initialize() {
      // 1. Try to rehydrate existing Party B session (page refresh case)
      if (typeof window !== "undefined") {
        const storedAddress = localStorage.getItem("clauseai_wallet_address");
        const storedIsPartyB =
          localStorage.getItem(`clauseai_is_party_b_${agreementId}`) === "true";

        if (storedAddress && storedIsPartyB) {
          const result = await dispatch(rehydratePartyBThunk(agreementId));
          if (rehydratePartyBThunk.fulfilled.match(result) && result.payload) {
            // Session restored — go straight to deposit screen
            setStep("depositing");
            return;
          }
        }
      }

      // 2. Fresh visit — load terms from presence snapshot
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
          "Agreement terms not found. Party A may not have completed setup yet. Ask them to share the link again.",
        );
        return;
      }

      setStep("review-terms");
    }

    initialize();
  }, [agreementId, dispatch]);

  // ── Once myDepositDone, navigate to dashboard ─────────────────
  useEffect(() => {
    if (myDepositDone && step === "depositing") {
      // Small delay for UX
      setTimeout(() => router.push("/dashboard"), 1500);
    }
  }, [myDepositDone, step, router]);

  // ── Step: Connect wallet ──────────────────────────────────────
  async function handleConnectWallet() {
    setIsConnecting(true);
    setError(null);
    try {
      const result = await dispatch(connectWalletThunk());
      if (!connectWalletThunk.fulfilled.match(result)) {
        throw new Error((result.payload as string) ?? "Wallet connect failed");
      }

      const address = result.payload as string;

      // Register as Party B in presence
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

      // Set Party B state (also persists to localStorage)
      dispatch(setAsPartyB({ agreementId, address }));

      setStep("depositing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

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
        onAccept={() => setTermsAccepted(true)}
        onProceed={() => setStep("connect-wallet")}
      />
    );
  }

  if (step === "connect-wallet") {
    return (
      <ConnectWalletState
        editedTerms={editedTerms as Record<string, unknown> | null}
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
      />
    );
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function LoadingState({ agreementId }: { agreementId: string }) {
  return (
    <CenterLayout>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 24 }}>
          <Spinner size={48} color="var(--yellow)" />
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          Loading agreement...
        </h2>
        <p style={{ color: "var(--grey-1)", fontSize: 13 }}>#{agreementId}</p>
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
            fontSize: 24,
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
            fontSize: 14,
            lineHeight: 1.7,
            marginBottom: 24,
            background: "#7f1d1d20",
            border: "1px solid #7f1d1d",
            borderRadius: 8,
            padding: "12px 16px",
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
  onAccept,
  onProceed,
}: {
  editedTerms: Record<string, unknown> | null;
  agreementId: string;
  counterpartyWallet: string | null;
  termsAccepted: boolean;
  onAccept: () => void;
  onProceed: () => void;
}) {
  return (
    <CenterLayout>
      <div style={{ maxWidth: 560, width: "100%" }}>
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
            Agreement #{agreementId} — review carefully before connecting your
            wallet. Funds will be locked on-chain.
          </p>
        </div>

        {/* Party A info */}
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

        {/* Terms box */}
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
            <div>
              {[
                { label: "Party A (Initiator)", key: "partyA" },
                { label: "Party B (You)", key: "partyB" },
                { label: "Condition / Deliverable", key: "condition" },
                { label: "Deadline", key: "deadline" },
                { label: "Amount (USD)", key: "amount_usd" },
                { label: "Arbitrator", key: "arbitrator" },
              ].map((row, i, arr) => (
                <div
                  key={row.key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    padding: "12px 20px",
                    borderBottom:
                      i < arr.length - 1 ? "1px solid var(--black-4)" : "none",
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
                      fontWeight: row.key === "amount_usd" ? 700 : 600,
                      color:
                        row.key === "amount_usd"
                          ? "var(--yellow)"
                          : "var(--white)",
                      textAlign: "right",
                    }}
                  >
                    {row.key === "amount_usd"
                      ? `$${editedTerms[row.key] ?? "—"}`
                      : String(editedTerms[row.key] ?? "—")}
                  </span>
                </div>
              ))}
            </div>
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

        {/* Accept checkbox */}
        <label
          className="animate-fade-up delay-3"
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
          }}
        >
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => e.target.checked && onAccept()}
            style={{
              marginTop: 2,
              accentColor: "var(--yellow)",
              width: 16,
              height: 16,
            }}
          />
          <span
            style={{ fontSize: 13, lineHeight: 1.6, color: "var(--grey-1)" }}
          >
            I have read and agree to the terms above. I understand that funds
            will be locked in a smart contract and only released when conditions
            are met.
          </span>
        </label>

        {/* Proceed */}
        <button
          className="animate-fade-up delay-4"
          onClick={onProceed}
          disabled={!termsAccepted || !editedTerms}
          style={{
            width: "100%",
            padding: "16px",
            background:
              termsAccepted && editedTerms ? "var(--yellow)" : "var(--black-4)",
            color:
              termsAccepted && editedTerms ? "var(--black)" : "var(--grey-2)",
            border: "none",
            borderRadius: "var(--radius)",
            fontSize: 15,
            fontWeight: 700,
            cursor: termsAccepted && editedTerms ? "pointer" : "not-allowed",
          }}
        >
          Connect Wallet & Join →
        </button>

        <p
          style={{
            marginTop: 12,
            textAlign: "center",
            fontSize: 12,
            color: "var(--grey-2)",
            fontFamily: "var(--font-mono)",
          }}
        >
          You'll deposit ${(editedTerms?.amount_usd as string) ?? "—"} into
          escrow after connecting.
        </p>
      </div>
    </CenterLayout>
  );
}

function ConnectWalletState({
  editedTerms,
  isConnecting,
  error,
  walletConnected,
  walletAddress,
  presenceRegistered,
  onConnect,
}: {
  editedTerms: Record<string, unknown> | null;
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
          {walletConnected ? "✅" : isConnecting ? "⏳" : "₿"}
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
            ? `Connected: ${walletAddress?.slice(0, 10)}...${walletAddress?.slice(-6)}`
            : "Connect your Leather wallet to join this agreement and deposit your stake."}
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
            ✅ Registered! Moving to deposit...
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
}) {
  const { depositThunk } = require("@/store/slices/agreementSlice");
  const amountUsd = parseFloat(String(editedTerms?.amount_usd ?? "0"));
  const sbtcAmount = amountUsd ? (amountUsd / 67000).toFixed(6) : "0.000000";
  const isBusy = txDeposit.status === "pending";

  async function handleDeposit() {
    if (!agreementId || !walletAddress) return;
    await dispatch(
      depositThunk({
        agreementId,
        amountUsd,
        senderAddress: walletAddress,
      }),
    );
  }

  return (
    <CenterLayout>
      <div style={{ maxWidth: 520, width: "100%" }}>
        <div className="animate-fade-up" style={{ marginBottom: 32 }}>
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
            Final step
          </span>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "-0.5px",
              marginBottom: 8,
            }}
          >
            Lock your deposit
          </h2>
          <p style={{ color: "var(--grey-1)", fontSize: 14 }}>
            Party A has already deployed the contract. Deposit your share to
            activate the agreement.
          </p>
        </div>

        {/* Deposit card */}
        <div
          className="animate-fade-up delay-1"
          style={{
            background: "var(--black-2)",
            border: "1px solid var(--yellow)",
            borderRadius: 16,
            padding: "24px",
            marginBottom: 20,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--yellow)",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              marginBottom: 12,
            }}
          >
            Your deposit
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: "var(--yellow)",
              letterSpacing: "-1px",
            }}
          >
            {sbtcAmount} sBTC
          </div>
          <div style={{ fontSize: 14, color: "var(--grey-1)", marginTop: 4 }}>
            ≈ ${(editedTerms?.amount_usd as string) ?? "—"} USD
          </div>
        </div>

        {/* Parties */}
        <div
          className="animate-fade-up delay-2"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: 12,
            marginBottom: 20,
            alignItems: "center",
          }}
        >
          <MiniPartyCard
            label="Party A"
            name={String(editedTerms?.partyA ?? "—")}
            wallet={counterpartyWallet}
            deposited={true}
          />
          <div
            style={{
              textAlign: "center",
              color: "var(--grey-2)",
              fontSize: 20,
            }}
          >
            ⇄
          </div>
          <MiniPartyCard
            label="Party B (You)"
            name={String(editedTerms?.partyB ?? "—")}
            wallet={walletAddress}
            deposited={myDepositDone}
          />
        </div>

        {/* Tx status */}
        {txDeposit.status !== "idle" && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 16px",
              background:
                txDeposit.status === "failed" ? "#7f1d1d20" : "#f59e0b10",
              border: `1px solid ${txDeposit.status === "failed" ? "#7f1d1d" : "#f59e0b40"}`,
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "var(--font-mono)",
            }}
          >
            {txDeposit.status === "pending" && (
              <span style={{ color: "#f59e0b" }}>
                ⏳ Waiting for wallet signature...
              </span>
            )}
            {txDeposit.status === "confirming" && (
              <span style={{ color: "#f59e0b" }}>
                ⏳ Confirming on-chain...{" "}
                {txDeposit.txUrl && (
                  <a
                    href={txDeposit.txUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--yellow)" }}
                  >
                    View ↗
                  </a>
                )}
              </span>
            )}
            {txDeposit.status === "failed" && (
              <span style={{ color: "#f87171" }}>
                ❌ Deposit failed: {txDeposit.error}
              </span>
            )}
          </div>
        )}

        {myDepositDone ? (
          <div
            style={{
              background: "#22c55e15",
              border: "1px solid #22c55e",
              borderRadius: "var(--radius)",
              padding: "16px",
              textAlign: "center",
              color: "#22c55e",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            ✅ Deposit locked! Redirecting to dashboard...
          </div>
        ) : (
          <button
            onClick={handleDeposit}
            disabled={isBusy}
            style={{
              width: "100%",
              padding: "18px",
              background: isBusy ? "var(--black-4)" : "var(--yellow)",
              color: isBusy ? "var(--grey-2)" : "var(--black)",
              border: "none",
              borderRadius: "var(--radius)",
              fontSize: 15,
              fontWeight: 700,
              cursor: isBusy ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            {isBusy ? (
              <>
                <Spinner size={16} /> Signing deposit...
              </>
            ) : (
              `Lock ${sbtcAmount} sBTC →`
            )}
          </button>
        )}

        <div
          style={{
            marginTop: 16,
            padding: "12px 16px",
            background: "var(--black-2)",
            border: "1px solid var(--black-4)",
            borderRadius: 8,
            display: "flex",
            gap: 10,
            fontSize: 12,
            color: "var(--grey-1)",
            lineHeight: 1.6,
          }}
        >
          <span>⏱</span>
          <span>
            72hr auto-refund if no action after deadline. 48hr arbitrator
            fallback on dispute.
          </span>
        </div>
      </div>
    </CenterLayout>
  );
}

// ── Layout wrapper ────────────────────────────────────────────
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

function MiniPartyCard({
  label,
  name,
  wallet,
  deposited,
}: {
  label: string;
  name: string;
  wallet: string | null;
  deposited: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--black-2)",
        border: `1px solid ${deposited ? "#22c55e40" : "var(--black-4)"}`,
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          color: "var(--grey-1)",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{name}</div>
      <div
        style={{
          fontSize: 10,
          color: deposited ? "#22c55e" : "var(--grey-2)",
          marginTop: 4,
        }}
      >
        {deposited ? "✅ Deposited" : "⏳ Pending"}
      </div>
      {wallet && (
        <div
          style={{
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            color: "var(--grey-2)",
            marginTop: 2,
          }}
        >
          {wallet.slice(0, 6)}...{wallet.slice(-4)}
        </div>
      )}
    </div>
  );
}

function Spinner({
  size = 16,
  color = "var(--black)",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        border: `2px solid ${color === "var(--black)" ? "var(--grey-2)" : color}`,
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

// Add to component (needed for dispatch)
function useAppDispatch() {
  const { useAppDispatch: _useAppDispatch } = require("@/store/hooks");
  return _useAppDispatch();
}
