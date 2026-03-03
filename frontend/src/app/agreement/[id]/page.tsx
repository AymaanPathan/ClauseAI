"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setAgreementId,
  setScreen,
  setCounterpartyConnected,
} from "@/store/slices/agreementSlice";
import { connectHiroWallet, saveWalletSession } from "@/lib/hiroWallet";

// ── /agreement/[id] ───────────────────────────────────────────
// This page is what Bob sees when he opens the share link.
// It loads the agreement ID into Redux, asks Bob to connect
// his wallet, then redirects to the share-link screen where
// both parties can see each other's status.
export default function AgreementPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const id = params?.id as string;

  const { walletAddress } = useAppSelector((s) => s.agreement);

  // On mount — inject agreement ID into state
  useEffect(() => {
    if (id) dispatch(setAgreementId(id));
  }, [id, dispatch]);

  async function handleJoin() {
    try {
      const user = await connectHiroWallet();
      saveWalletSession(user);
      // Mark this user as the counterparty (Party B)
      dispatch(setCounterpartyConnected(user.address));
      // Go to the main app share-link screen
      dispatch(setScreen("share-link"));
      router.push("/");
    } catch (err) {
      console.error("Wallet connect failed:", err);
    }
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

        {/* Icon */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "var(--yellow-dim)",
            border: "1px solid var(--yellow)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            margin: "0 auto 28px",
          }}
        >
          📋
        </div>

        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: "-0.5px",
            marginBottom: 12,
          }}
        >
          You've been invited
        </h1>

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

        <p
          style={{
            color: "var(--grey-1)",
            fontSize: 14,
            lineHeight: 1.7,
            marginBottom: 36,
          }}
        >
          Connect your Leather wallet to review and join this agreement. Funds
          are enforced by the Stacks smart contract — not by trust.
        </p>

        <button
          onClick={handleJoin}
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
      </div>
    </div>
  );
}
