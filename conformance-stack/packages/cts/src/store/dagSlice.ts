import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { DAG } from "../types/DAGNode";

interface DAGState {
  dag: DAG | null;
  connectionStatus: string;
  error: string | null;
}

const initialState: DAGState = {
  dag: null,
  connectionStatus: "connecting",
  error: null,
};

const dagSlice = createSlice({
  name: "dag",
  initialState,
  reducers: {
    setDAG: (state, action: PayloadAction<DAG>) => {
      return {
        ...state,
        dag: action.payload,
      };
    },
    clearDAG: (state) => {
      state.dag = null;
      state.error = null;
    },
    setConnectionStatus: (state, action: PayloadAction<string>) => {
      state.connectionStatus = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const { setDAG, clearDAG, setConnectionStatus, setError } = dagSlice.actions;
export default dagSlice.reducer;
