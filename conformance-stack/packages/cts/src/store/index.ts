import { configureStore, Store } from "@reduxjs/toolkit";
import dagReducer from "./dagSlice";
import invitationReducer from "./invitationSlice";
import socketReducer from "./socketSlice";
import testReducer from "./testSlice";
import { testProgressionMiddleware } from "./middleware";
import { TypedUseSelectorHook, useSelector } from "react-redux";

interface RootState {
  dag: ReturnType<typeof dagReducer>;
  invitation: ReturnType<typeof invitationReducer>;
  socket: ReturnType<typeof socketReducer>;
  test: ReturnType<typeof testReducer>;
}

const store: Store<RootState> = configureStore({
  reducer: {
    dag: dagReducer,
    invitation: invitationReducer,
    socket: socketReducer,
    test: testReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(testProgressionMiddleware),
});

export type AppDispatch = typeof store.dispatch;

export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export { store };
export type { RootState };
