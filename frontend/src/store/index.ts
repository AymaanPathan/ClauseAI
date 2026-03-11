import { configureStore } from "@reduxjs/toolkit";
import partyAReducer from "./slices/partyASlice";
import partyBReducer from "./slices/partyBSlice";
import arbitratorReducer from "./slices/arbitratorSlice";


export const store = configureStore({
  reducer: {
    partyA: partyAReducer,
    partyB: partyBReducer,
    arbitrator: arbitratorReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ["partyA/parse/fulfilled"],
      },
    }),
});

// Types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type StoreType = typeof store;
