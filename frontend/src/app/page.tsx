// ============================================================
// app/page.tsx  — Party A root page
//
// This page ONLY renders Party A components.
// It has its OWN Redux Provider wrapping partyAStore.
// Party B state never touches this page.
// ============================================================

"use client";
import { useEffect } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";

import { rehydratePartyAThunk } from "../store/slices/partyASlice";

// Party A screens
import ScreenLanding from "@/components/screens/Party-A/ScreenLanding";
import ScreenSelectType from "@/components/screens/Party-A/ScreenSelectType-1";
import ScreenDescribe from "@/components/screens/Party-A/ScreenDescribe-2";
import ReviewTerms from "@/components/screens/Party-A/ReviewTerms-3";
import ScreenSetArbitrator from "@/components/screens/Party-A/ScreenSetArbitrator";
import ScreenShareLink from "@/components/screens/Party-A/ScreenShareLink";
import ScreenConnectWallet from "@/components/screens/Party-A/ScreenConnectWallet";
import ScreenLockFunds from "@/components/screens/Party-A/ScreenLockFunds";
import ScreenDashboard from "@/components/screens/Party-A/ScreenDashboard";
import ScreenOutcome from "@/components/screens/Shared/ScreenOutcome";
import { AppDispatch, RootState, store } from "@/store";

// Inner component uses partyAStore
function PartyAApp() {
  const dispatch = useDispatch<AppDispatch>();
  const screen = useSelector((s: RootState) => s.partyA.screen);

  useEffect(() => {
    dispatch(rehydratePartyAThunk());
  }, [dispatch]);

  switch (screen) {
    case "landing":
      return <ScreenLanding />;
    case "select-type":
      return <ScreenSelectType />;
    case "describe":
      return <ScreenDescribe />;
    case "parsed-terms":
      return <ReviewTerms />;
    case "set-arbitrator":
      return <ScreenSetArbitrator />;
    case "share-link":
      return <ScreenShareLink />;
    case "connect-wallet":
      return <ScreenConnectWallet />;
    case "lock-funds":
      return <ScreenLockFunds />;
    case "dashboard":
      return <ScreenDashboard />;
    case "complete":
    case "timeout":
    case "dispute":
      return <ScreenOutcome />;
    default:
      return <ScreenLanding />;
  }
}

// Provider creates an isolated store instance for Party A
export default function PartyAPage() {
  return (
    <Provider store={store}>
      <PartyAApp />
    </Provider>
  );
}
