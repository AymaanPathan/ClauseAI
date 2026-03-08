"use client";
// ============================================================
// app/agreement/[id]/page.tsx  —  PARTY B ENTRY POINT
//
// Party B arrives here by clicking the share link.
// This route owns 100% of the Party B experience.
// It never shares state with page.tsx.
//
// Party B flow:
//   loading → fetch terms from server →
//   connect-wallet → approve-agreement → dashboard
//
// Key guarantees:
//   • Clears any stale Party A session on mount
//   • Fetches fresh terms from server (never trusts localStorage)
//   • approval state is always fetched fresh from API
//   • "Already approved" guard with clear re-entry path
// ============================================================

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  initPartyBSession,
  clearStalePartyBState,
} from "@/store/slices/agreementSlice";

// Party B screens
import PartyBLoading from "@/components/screens/Party-B/PartyBLoading";
import PartyBError from "@/components/screens/Party-B/PartyBError";
import ScreenConnectWallet from "@/components/screens/Shared/ScreenConnectWallet";
import ScreenApproveAgreement from "@/components/screens/Shared/ScreenApproveAgreement";
import ScreenOutcome from "@/components/screens/Shared/ScreenOutcome";

import Topbar from "@/components/ui/Topbar";

type LoadState = "loading" | "ready" | "already_approved" | "error";

export default function PartyBPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const agreementId = params.id as string;

  const screen = useAppSelector((s) => s.agreement.currentScreen);
  const isPartyB = useAppSelector((s) => s.agreement.isPartyB);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!agreementId) return;
    bootstrapPartyB();
  }, [agreementId]);

  useEffect(() => {
    if (screen === "dashboard") router.push("/dashboard");
  }, [screen, router]);

  async function bootstrapPartyB() {
    setLoadState("loading");

    // 1. Wipe any stale state that could ghost-approve or ghost-connect
    dispatch(clearStalePartyBState());

    try {
      // 2. Fetch agreement from server — source of truth, never localStorage
      const result = await dispatch(initPartyBSession(agreementId));

      if (initPartyBSession.rejected.match(result)) {
        setErrorMsg((result.payload as string) ?? "Agreement not found.");
        setLoadState("error");
        return;
      }

      const payload = result.payload as unknown as {
        alreadyApproved: boolean;
        walletWasConnected: boolean;
      };

      // 3. If Party B already approved in a previous session that wasn't cleared,
      //    show them a clear status screen rather than silently "approving" again.
      if (payload.alreadyApproved) {
        setLoadState("already_approved");
        return;
      }

      setLoadState("ready");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to load agreement.",
      );
      setLoadState("error");
    }
  }

  if (loadState === "loading") {
    return <PartyBLoading agreementId={agreementId} />;
  }

  if (loadState === "error") {
    return (
      <PartyBError
        message={errorMsg ?? "Unknown error"}
        agreementId={agreementId}
      />
    );
  }

  if (loadState === "already_approved") {
    return (
      <PartyBAlreadyApproved
        agreementId={agreementId}
        onRecheck={bootstrapPartyB}
      />
    );
  }

  // loadState === "ready" — render the Party B screen flow
  const PARTY_B_SCREENS: Record<string, React.ReactNode> = {
    "connect-wallet": <ScreenConnectWallet />,
    "approve-agreement": <ScreenApproveAgreement />,
    complete: <ScreenOutcome />,
    timeout: <ScreenOutcome />,
    dispute: <ScreenOutcome />,
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--black)" }}>
      <Topbar />
      {PARTY_B_SCREENS[screen] ?? <ScreenConnectWallet />}
    </div>
  );
}

// ── Already Approved screen ───────────────────────────────────
function PartyBAlreadyApproved({
  agreementId,
  onRecheck,
}: {
  agreementId: string;
  onRecheck: () => void;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--black)" }}>
      <Topbar />
      <div
        className="page"
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
          {/* Icon */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "rgba(34,197,94,0.06)",
              border: "1px solid rgba(34,197,94,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 28px",
            }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--green)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <div
            style={{
              fontSize: 10,
              fontFamily: "var(--mono)",
              color: "var(--text-4)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Agreement #{agreementId}
          </div>

          <h2
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
              marginBottom: 10,
            }}
          >
            You already approved
          </h2>
          <p
            style={{
              color: "var(--text-2)",
              fontSize: 13,
              lineHeight: 1.7,
              marginBottom: 32,
            }}
          >
            Your approval for this agreement was recorded. The payer will be
            notified to lock funds. You can check the dashboard for live escrow
            status.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => (window.location.href = "/dashboard")}
              style={{ width: "100%" }}
            >
              Go to Dashboard
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>

            <button
              className="btn btn-ghost"
              onClick={onRecheck}
              style={{ width: "100%" }}
            >
              Re-check status
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
