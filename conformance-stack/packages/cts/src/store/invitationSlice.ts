import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface InvitationState {
  invitation: string | null;
  connectionStatus: string;
  error: string | null;
}

const initialState: InvitationState = {
  invitation: null,
  connectionStatus: "connecting",
  error: null,
};

const invitationSlice = createSlice({
  name: "invitation",
  initialState,
  reducers: {
    setInvitation: (state, action: PayloadAction<string>) => {
      console.log("set invitation", action);
      return { ...state, invitation: action.payload };
    },
    setConnectionStatus: (state, action: PayloadAction<string>) => {
      state.connectionStatus = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    resetInvitation: (state) => {
      state.invitation = null;
      state.connectionStatus = "connecting";
      state.error = null;
    },
  },
});

export const { setInvitation, setConnectionStatus, setError, resetInvitation } =
  invitationSlice.actions;
export default invitationSlice.reducer;
