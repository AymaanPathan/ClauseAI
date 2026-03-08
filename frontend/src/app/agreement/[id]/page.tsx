"use client";
import { useEffect, useMemo } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import partyBReducer from "@/store/slices/partyBSlice";

import { initPartyBThunk } from "@/store/slices/partyBSlice";

// Party B screens
import PartyBLoading from "@/components/screens/Party-B/PartyBLoading";
import PartyBError from "@/components/screens/Party-B/PartyBError";
import PartyBReviewScreen from "@/components/screens/Party-B/PartyBReviewScreen";
import ScreenPartyBConnectWallet from "@/components/screens/Party-B/PartyBConnectWalletScreen";
import ScreenPartyBApprove from "@/components/screens/Party-B/PartyBAgreeAgreement";
import PartyBWaitingFundsScreen from "@/components/screens/Party-B/PartyBWaitingFundsScreen";
import PartyBDashboard from "@/components/screens/Party-B/PartyBDashboard";
import { AppDispatch, RootState } from "@/store";

interface PageProps {
  params: { id: string };
}

// Inner component — uses partyBStore context
function PartyBApp({ agreementId }: { agreementId: string }) {
  const dispatch = useDispatch<AppDispatch>();
  const { screen, loadError } = useSelector((s: RootState) => s.partyB);

  useEffect(() => {
    dispatch(initPartyBThunk(agreementId));
  }, [agreementId, dispatch]);

  switch (screen) {
    case "loading":
      return <PartyBLoading agreementId={agreementId} />;
    case "error":
      return (
        <PartyBError
          message={loadError ?? "Unknown error"}
          agreementId={agreementId}
        />
      );
    case "review":
      return <PartyBReviewScreen />;
    case "connect-wallet":
      return <ScreenPartyBConnectWallet />;
    case "approve":
      return <ScreenPartyBApprove />;
    case "waiting-funds":
      return <PartyBWaitingFundsScreen />;
    case "dashboard":
      return <PartyBDashboard />;
    default:
      return <PartyBLoading agreementId={agreementId} />;
  }
}

// Create a FRESH store per page mount — true isolation
// (If you want persistence across re-renders, hoist this outside component)
export default function AgreementPage({ params }: PageProps) {
  // Create a fresh partyBStore instance per page — never shared with Party A
  const freshStore = useMemo(
    () =>
      configureStore({
        reducer: { partyB: partyBReducer },
      }),
    [],
  );

  return (
    <Provider store={freshStore}>
      <PartyBApp agreementId={params.id} />
    </Provider>
  );
}
