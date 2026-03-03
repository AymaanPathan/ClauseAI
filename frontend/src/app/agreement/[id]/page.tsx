"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setAgreementId,
  setScreen,
  setAsPartyB,
  registerPresenceThunk,
  pollPresenceThunk,
  connectWalletThunk,
} from "@/store/slices/agreementSlice";

// ── /agreement/[id] ───────────────────────────────────────────
// This page is what Bob (Party B) sees when he opens the share link.
// Flow:
//   1. Load the agreement ID from the URL
//   2. Bob connects his wallet
//   3. Register Bob's presence on the server
//   4. Poll until Party A presence is confirmed
//   5. Redirect to the main app (share-link screen → lock-funds)
//
// Party A's share-link screen polls the same presence endpoint
// and will detect Bob's arrival automatically.

const POLL_INTERVAL_MS = 3_000;

export default function AgreementPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const id = (params?.id as string) ?? "";

  const {
    walletAddress,
    walletConnected,
    counterpartyConnected,
    presenceRegistered,
    presenceError,
  } = useAppSelector((s) => s.agreement);

  const [step, setStep] = useState<
    "idle" | "connecting" | "registering" | "waiting" | "ready" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [partyAAddress, setPartyAAddress] = useState<string | null>(null);

  // Inject agreement ID on mount
  useEffect(() => {
    if (id) {
      dispatch(setAgreementId(id));
      // Persist so page reloads don't lose context
      if (typeof window !== "undefined") {
        localStorage.setItem("clauseai_agreement_id", id);
        localStorage.setItem("clauseai_is_party_b", "true");
      }
    }
  }, [id, dispatch]);

  // Poll for Party A presence while we're waiting
  const pollForPartyA = useCallback(() => {
    if (!id) return;
    dispatch(pollPresenceThunk(id)).then((result) => {
      if (pollPresenceThunk.fulfilled.match(result)) {
        const presence = result.payload as {
          partyA: string | null;
          bothConnected: boolean;
        };
        if (presence.partyA) {
          setPartyAAddress(presence.partyA);
          setStep("ready");
        }
      }
    });
  }, [id, dispatch]);

  // Auto-advance to ready if Party A presence detected via Redux
  useEffect(() => {
    if (counterpartyConnected && step === "waiting") {
      setStep("ready");
    }
  }, [counterpartyConnected, step]);

  // Start polling once we're in "waiting" state
  useEffect(() => {
    if (step !== "waiting") return;
    pollForPartyA(); // immediate
    const iv = setInterval(pollForPartyA, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [step, pollForPartyA]);

  // ── Step 1: Connect wallet ────────────────────────────────────
  async function handleConnect() {
    setStep("connecting");
    setErrorMsg(null);
    try {
      const result = await dispatch(connectWalletThunk());
      if (!connectWalletThunk.fulfilled.match(result)) {
        throw new Error((result.payload as string) ?? "Wallet connect failed");
      }
      const address = result.payload as string;
      await handleRegister(address);
    } catch (err) {
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Connection failed");
    }
  }

  // ── Step 2: Register presence ─────────────────────────────────
  async function handleRegister(address: string) {
    if (!id) return;
    setStep("registering");
    try {
      // Mark this user as Party B in Redux
      dispatch(setAsPartyB({ agreementId: id, address }));

      // Register with presence API
      const result = await dispatch(
        registerPresenceThunk({ agreementId: id, role: "partyB", address }),
      );
      if (!registerPresenceThunk.fulfilled.match(result)) {
        throw new Error(
          (result.payload as string) ?? "Presence registration failed",
        );
      }

      const presence = result.payload as {
        partyA: string | null;
        bothConnected: boolean;
      };

      if (presence.partyA) {
        // Party A already registered — we're good to go
        setPartyAAddress(presence.partyA);
        setStep("ready");
      } else {
        // Wait for Party A to register
        setStep("waiting");
      }
    } catch (err) {
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Registration failed");
    }
  }

  // ── Step 3: Navigate to app ───────────────────────────────────
  function handleProceed() {
    dispatch(setScreen("share-link"));
    router.push("/");
  }

  // ── Retry ─────────────────────────────────────────────────────
  function handleRetry() {
    setStep("idle");
    setErrorMsg(null);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--black)",
        color: "var(--white)",
        fontFamily: "var(--font-display)",
      }}
    >
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        {/* Logo */}
        <div
          style={{
            fontSize: 13,
            fontFamily: "var(--font-mono)",
            color: "var(--yellow)",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            marginBottom: 40,
          }}
        >
          ClauseAi
        </div>

        {/* Icon — changes based on step */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: step === "ready" ? "#22c55e15" : "var(--yellow-dim)",
            border: `1px solid ${step === "ready" ? "#22c55e" : step === "error" ? "#ef4444" : "var(--yellow)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            margin: "0 auto 28px",
            transition: "all 0.3s ease",
          }}
        >
          {step === "idle" && "📋"}
          {step === "connecting" && "⏳"}
          {step === "registering" && "🔗"}
          {step === "waiting" && "👀"}
          {step === "ready" && "✅"}
          {step === "error" && "❌"}
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: "-0.5px",
            marginBottom: 12,
          }}
        >
          {step === "idle" && "You've been invited"}
          {step === "connecting" && "Connecting wallet..."}
          {step === "registering" && "Joining agreement..."}
          {step === "waiting" && "Waiting for Party A..."}
          {step === "ready" && "Ready to sign!"}
          {step === "error" && "Something went wrong"}
        </h1>

        {/* Agreement ID */}
        <p
          style={{
            color: "var(--grey-1)",
            fontSize: 14,
            lineHeight: 1.7,
            marginBottom: 8,
          }}
        >
          Agreement{" "}
          <strong
            style={{ color: "var(--yellow)", fontFamily: "var(--font-mono)" }}
          >
            #{id}
          </strong>
        </p>

        {/* Description — step aware */}
        <p
          style={{
            color: "var(--grey-1)",
            fontSize: 14,
            lineHeight: 1.7,
            marginBottom: 36,
            minHeight: 48,
          }}
        >
          {step === "idle" &&
            "Connect your Leather wallet to review and join this agreement. Funds are enforced by the Stacks smart contract — not by trust."}
          {step === "connecting" &&
            "Please approve the connection in your Leather wallet..."}
          {step === "registering" &&
            "Registering your wallet with the agreement..."}
          {step === "waiting" && (
            <>
              Your wallet is registered. Waiting for the other party to be
              online.
              <br />
              <span
                style={{
                  fontSize: 12,
                  color: "var(--grey-2)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Checking every {POLL_INTERVAL_MS / 1000}s...
              </span>
            </>
          )}
          {step === "ready" && (
            <>
              Both wallets are connected.
              {partyAAddress && (
                <>
                  <br />
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--grey-2)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    Party A: {partyAAddress.slice(0, 8)}...
                    {partyAAddress.slice(-6)}
                  </span>
                </>
              )}
              <br />
              You can now proceed to review and lock funds.
            </>
          )}
          {step === "error" && (
            <span style={{ color: "#f87171" }}>
              {errorMsg ?? presenceError ?? "Unknown error occurred."}
            </span>
          )}
        </p>

        {/* Progress indicator for waiting state */}
        {step === "waiting" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginBottom: 24,
            }}
          >
            <Spinner color="var(--yellow)" />
            <span
              style={{
                fontSize: 13,
                color: "var(--yellow)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Waiting for Party A...
            </span>
          </div>
        )}

        {/* Connected wallet display */}
        {walletConnected && walletAddress && step !== "idle" && (
          <div
            style={{
              background: "var(--black-2)",
              border: "1px solid #22c55e40",
              borderRadius: 10,
              padding: "10px 16px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 8,
              textAlign: "left",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#22c55e",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "#22c55e",
                  fontWeight: 600,
                  marginBottom: 2,
                }}
              >
                Your wallet (Party B)
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--grey-1)",
                }}
              >
                {walletAddress}
              </div>
            </div>
          </div>
        )}

        {/* CTA button — changes per step */}
        {step === "idle" && (
          <button
            onClick={handleConnect}
            style={{
              width: "100%",
              padding: "16px",
              background: "var(--yellow)",
              color: "var(--black)",
              border: "none",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              marginBottom: 16,
            }}
          >
            Connect Wallet & Join Agreement →
          </button>
        )}

        {(step === "connecting" || step === "registering") && (
          <button
            disabled
            style={{
              width: "100%",
              padding: "16px",
              background: "var(--black-4)",
              color: "var(--grey-2)",
              border: "none",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              cursor: "not-allowed",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <Spinner color="var(--grey-2)" />
            {step === "connecting" ? "Connecting..." : "Registering..."}
          </button>
        )}

        {step === "ready" && (
          <button
            onClick={handleProceed}
            style={{
              width: "100%",
              padding: "16px",
              background: "#22c55e",
              color: "var(--black)",
              border: "none",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              marginBottom: 16,
            }}
          >
            ✅ Proceed to Review Terms →
          </button>
        )}

        {step === "error" && (
          <button
            onClick={handleRetry}
            style={{
              width: "100%",
              padding: "16px",
              background: "var(--yellow)",
              color: "var(--black)",
              border: "none",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              marginBottom: 16,
            }}
          >
            Try Again
          </button>
        )}

        {/* Install Leather link */}
        {(step === "idle" || step === "error") && (
          <p
            style={{
              fontSize: 12,
              color: "var(--grey-2)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Need Leather?{" "}
            <a
              href="https://leather.io/install-extension"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--yellow)", textDecoration: "none" }}
            >
              Install free →
            </a>
          </p>
        )}

        {/* Security note */}
        <div
          style={{
            marginTop: 32,
            padding: "14px 18px",
            background: "var(--black-2)",
            border: "1px solid var(--black-4)",
            borderRadius: 10,
            display: "flex",
            gap: 12,
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 18 }}>🔒</span>
          <p style={{ fontSize: 12, color: "var(--grey-1)", lineHeight: 1.6 }}>
            ClauseAi never holds your keys. Funds lock directly into the Stacks
            smart contract, enforced by Bitcoin.
          </p>
        </div>
      </div>
    </div>
  );
}

function Spinner({ color = "var(--black)" }: { color?: string }) {
  return (
    <span
      style={{
        width: 14,
        height: 14,
        border: `2px solid ${color}`,
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}
