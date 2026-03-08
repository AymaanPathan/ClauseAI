"use client";
// ============================================================
// app/page.tsx  —  PARTY A ENTRY POINT
//
// This page is exclusively for the agreement creator (Party A).
// Party B enters via /agreement/[id] — a completely separate route.
//
// Party A flow:
//   landing → select-type → describe → parsed-terms →
//   set-arbitrator → share-link →
//   [SSE: Party B connects & approves] →
//   connect-wallet → approve-agreement → lock-funds → dashboard
// ============================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { rehydratePartyASession } from "@/store/slices/agreementSlice";

// Party A screens
import ScreenLanding from "@/components/screens/Party-A/ScreenLanding";
import ScreenSelectType from "@/components/screens/Party-A/ScreenSelectType-1";
import ScreenDescribe from "@/components/screens/Party-A/ScreenDescribe-2";
import ReviewTerms from "@/components/screens/Party-A/ReviewTerms-3";
import ScreenSetArbitrator from "@/components/screens/Party-A/ScreenSetArbitrator";
import ScreenShareLink from "@/components/screens/Party-A/ScreenShareLink";
import ScreenLockFunds from "@/components/screens/Party-A/ScreenLockFunds";
import ScreenOutcome from "@/components/screens/Shared/ScreenOutcome";
import Topbar from "@/components/ui/Topbar";
import ScreenConnectWallet from "@/components/screens/Shared/ScreenConnectWallet";
import ScreenApproveAgreement from "@/components/screens/Shared/ScreenApproveAgreement";

export default function PartyAHome() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const screen = useAppSelector((s) => s.agreement.currentScreen);
  const isPartyB = useAppSelector((s) => s.agreement.isPartyB);

  // On mount: restore Party A session only.
  // If somehow a Party B session is stored here, ignore it.
  useEffect(() => {
    dispatch(rehydratePartyASession());
  }, [dispatch]);

  // Guard: if this is somehow a Party B session, redirect them to their route
  useEffect(() => {
    if (isPartyB) {
      const id = localStorage.getItem("clauseai_agreement_id");
      if (id) router.replace(`/agreement/${id}`);
    }
  }, [isPartyB, router]);

  useEffect(() => {
    if (screen === "dashboard") {
      router.push("/dashboard");
    }
  }, [screen, router]);

  const showTopbar = screen !== "landing";

  // Party A screens only — Party B screens are never rendered here
  const PARTY_A_SCREENS: Record<string, React.ReactNode> = {
    landing: <ScreenLanding />,
    "select-type": <ScreenSelectType />,
    describe: <ScreenDescribe />,
    "parsed-terms": <ReviewTerms />,
    "set-arbitrator": <ScreenSetArbitrator />,
    "share-link": <ScreenShareLink />,
    "connect-wallet": <ScreenConnectWallet />,
    "approve-agreement": <ScreenApproveAgreement />,
    "lock-funds": <ScreenLockFunds />,
    complete: <ScreenOutcome />,
    timeout: <ScreenOutcome />,
    dispute: <ScreenOutcome />,
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--black)" }}>
      {showTopbar && <Topbar />}
      {PARTY_A_SCREENS[screen] ?? null}
    </div>
  );
}
