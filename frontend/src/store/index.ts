// store/index.ts — Redux store
import { configureStore } from "@reduxjs/toolkit";
import agreementReducer, { AgreementState } from "./slices/agreementSlice";

export const store = configureStore({
  reducer: {
    agreement: agreementReducer,
  },
});

export type RootState = {
  agreement: AgreementState;
};
export type AppDispatch = typeof store.dispatch;
