"use client";
import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { rehydrateSession } from "@/store/slices/agreementSlice";
import ScreenLanding from "@/components/screens/ScreenLanding";
import ScreenSelectType from "@/components/screens/ScreenSelectType";
import ScreenDescribe from "@/components/screens/ScreenDescribe";
import ScreenParsedTerms from "@/components/screens/ScreenParsedTerms";
import ScreenConnectWallet from "@/components/screens/ScreenConnectWallet";
import ScreenShareLink from "@/components/screens/ScreenShareLink";
import ScreenLockFunds from "@/components/screens/ScreenLockFunds";
import ScreenDashboard from "@/components/screens/ScreenDashboard";
import ScreenOutcome from "@/components/screens/ScreenOutcome";
import Topbar from "@/components/ui/Topbar";

export default function Home() {
  const dispatch = useAppDispatch();
  const screen = useAppSelector((s) => s.agreement.currentScreen);
  const showTopbar = screen !== "landing";

  // Restore wallet session on mount (handles page refreshes)
  useEffect(() => {
    dispatch(rehydrateSession());
  }, [dispatch]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--black)" }}>
      {showTopbar && <Topbar />}
      {screen === "landing" && <ScreenLanding />}
      {screen === "select-type" && <ScreenSelectType />}
      {screen === "describe" && <ScreenDescribe />}
      {screen === "parsed-terms" && <ScreenParsedTerms />}
      {screen === "connect-wallet" && <ScreenConnectWallet />}
      {screen === "share-link" && <ScreenShareLink />}
      {screen === "lock-funds" && <ScreenLockFunds />}
      {screen === "dashboard" && <ScreenDashboard />}
      {(screen === "complete" ||
        screen === "timeout" ||
        screen === "dispute") && <ScreenOutcome />}
    </div>
  );
}
