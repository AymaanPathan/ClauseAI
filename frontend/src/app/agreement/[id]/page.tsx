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
      setTimeout(() => router.push("/"), 1500);
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
  const amountUsd = parseFloat(String(editedTerms?.amount_usd ?? "0"));

  // Receiver never deposits — just wait for payer and go to dashboard
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

        {/* Role clarification */}
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
              desc: `The payer deploys the contract and locks $${amountUsd} USD.`,
              color: "#f59e0b",
            },
            {
              icon: "📋",
              label: "Conditions must be met",
              desc: String(editedTerms?.condition ?? "Delivery confirmed."),
              color: "var(--white)",
            },
            {
              icon: "🎯",
              label: "You get paid",
              desc: "Once the payer confirms, funds release directly to your wallet.",
              color: "#22c55e",
            },
          ].map((item, i, arr) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 14,
                padding: "14px 20px",
                borderBottom:
                  i < arr.length - 1 ? "1px solid var(--black-4)" : "none",
                textAlign: "left",
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

        {/* Your wallet */}
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
          onClick={() => (window.location.href = "/dashboard")}
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
