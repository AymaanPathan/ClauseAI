"use client";
// ============================================================
// app/arbitrate/page.tsx — Arbitrator Portal
// ============================================================

import { useEffect } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import arbitratorReducer from "@/store/slices/arbitratorSlice";
import { AppDispatch, RootState } from "@/store";
import { setScreen } from "@/store/slices/arbitratorSlice";

import ArbitratorConnectWallet from "@/components/screens/Arbitrator/ArbitratorConnectWallet";
import ArbitratorDashboard from "@/components/screens/Arbitrator/ArbitratorDashboard";
import ArbitratorDisputeDetail from "@/components/screens/Arbitrator/ArbitratorDisputeDetail";

// ── Isolated store for arbitrator ─────────────────────────────
const arbitratorStore = configureStore({
  reducer: { arbitrator: arbitratorReducer },
});

type ArbStore = typeof arbitratorStore;
type ArbState = ReturnType<ArbStore["getState"]>;
type ArbDispatch = ArbStore["dispatch"];

function ArbitratorApp() {
  const dispatch = useDispatch<ArbDispatch>();
  const { screen, walletAddress } = useSelector((s: ArbState) => s.arbitrator);

  // Rehydrate wallet from localStorage on mount
  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem("arb_wallet") : null;
    if (saved) {
      // Directly set wallet state without re-connecting
      dispatch({ type: "arbitrator/connectWallet/fulfilled", payload: saved });
    }
  }, [dispatch]);

  switch (screen) {
    case "connect-wallet":
      return <ArbitratorConnectWallet />;
    case "dashboard":
      return <ArbitratorDashboard />;
    case "dispute-detail":
      return <ArbitratorDisputeDetail />;
    default:
      return <ArbitratorConnectWallet />;
  }
}

export default function ArbitratePage() {
  return (
    <Provider store={arbitratorStore}>
      <ArbitratorApp />
    </Provider>
  );
}
