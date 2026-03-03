// ============================================================
// store/index.ts — Redux store
// ============================================================

import { configureStore } from "@reduxjs/toolkit";
import agreementReducer from "../../useAppSelector/slices/agreementSlice";

export const store = configureStore({
  reducer: {
    agreement: agreementReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
