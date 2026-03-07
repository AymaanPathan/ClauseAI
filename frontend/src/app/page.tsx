"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { rehydrateSession } from "@/store/slices/agreementSlice";
import ScreenLanding from "@/components/screens/ScreenLanding";
import ScreenSelectType from "@/components/screens/ScreenSelectType";
import ScreenDescribe from "@/components/screens/ScreenDescribe";
import ScreenParsedTerms from "@/components/screens/ScreenParsedTerms";
import ScreenConnectWallet from "@/components/screens/ScreenConnectWallet";
import ScreenSetArbitrator from "@/components/screens/ScreenSetArbitrator";
import ScreenApproveAgreement from "@/components/screens/ScreenApproveAgreement";
import ScreenShareLink from "@/components/screens/ScreenShareLink";
import ScreenLockFunds from "@/components/screens/ScreenLockFunds";
import ScreenOutcome from "@/components/screens/ScreenOutcome";
import Topbar from "@/components/ui/Topbar";

export default function Home() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const screen = useAppSelector((s) => s.agreement.currentScreen);
  const showTopbar = screen !== "landing";

  useEffect(() => {
    dispatch(rehydrateSession());
  }, [dispatch]);

  useEffect(() => {
    if (screen === "dashboard") {
      router.push("/dashboard");
    }
  }, [screen, router]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--black)" }}>
      {showTopbar && <Topbar />}
      {screen === "landing" && <ScreenLanding />}
      {screen === "select-type" && <ScreenSelectType />}
      {screen === "describe" && <ScreenDescribe />}
      {screen === "parsed-terms" && <ScreenParsedTerms />}
      {screen === "connect-wallet" && <ScreenConnectWallet />}
      {screen === "set-arbitrator" && <ScreenSetArbitrator />}
      {screen === "approve-agreement" && <ScreenApproveAgreement />}
      {screen === "share-link" && <ScreenShareLink />}
      {screen === "lock-funds" && <ScreenLockFunds />}
      {(screen === "complete" ||
        screen === "timeout" ||
        screen === "dispute") && <ScreenOutcome />}
    </div>
  );
}
