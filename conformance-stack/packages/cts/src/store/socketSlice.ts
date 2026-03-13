import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  initializeSocket as initSocket,
  disconnectSocket as ds,
} from "../utils/socketManager";

interface SocketState {
  connectionStatus: string;
  error: string | null;
}

const initialState: SocketState = {
  connectionStatus: "disconnected",
  error: null,
};

const socketSlice = createSlice({
  name: "socket",
  initialState,
  reducers: {
    connectSocket: (state, action: PayloadAction<string>) => {
      const socket = initSocket(action.payload);
      state.connectionStatus = "connecting";

      socket.on("connect", () => {
        state.connectionStatus = "connected";
        state.error = null;
      });

      socket.on("connect_error", (err) => {
        state.error = "Failed to connect to the server.";
        state.connectionStatus = "disconnected";
      });

      socket.on("disconnect", (reason) => {
        state.error =
          reason !== "io client disconnect"
            ? "Disconnected from the server."
            : null;
        state.connectionStatus = "disconnected";
      });
    },
    setConnectionStatus: (state, action: PayloadAction<string>) => {
      state.connectionStatus = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    disconnectSocket: (state) => {
      ds();
      state.connectionStatus = "disconnected";
    },
  },
});

export const {
  connectSocket,
  setConnectionStatus,
  setError,
  disconnectSocket,
} = socketSlice.actions;

export default socketSlice.reducer;
