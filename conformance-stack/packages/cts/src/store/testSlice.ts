import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type TestStepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface TestState {
  currentStep: number;
  totalSteps: number;
  isTestRunning: boolean;
  testCompleted: boolean;
  invitationUrl: string | null;
  messages: Record<number, string[]>; // step index -> messages
}

const initialState: TestState = {
  currentStep: 0,
  totalSteps: 3,
  isTestRunning: false,
  testCompleted: false,
  invitationUrl: null,
  messages: {},
};

const testSlice = createSlice({
  name: 'test',
  initialState,
  reducers: {
    setCurrentStep: (state, action: PayloadAction<number>) => {
      state.currentStep = action.payload;
    },
    startTest: (state) => {
      state.isTestRunning = true;
      state.testCompleted = false;
      state.currentStep = 0;
      state.invitationUrl = null;
      state.messages = {};
    },
    completeTest: (state) => {
      state.isTestRunning = false;
      state.testCompleted = true;
      state.currentStep = state.totalSteps - 1;
    },
    resetTest: (state) => {
      return initialState;
    },
    setInvitationUrl: (state, action: PayloadAction<string>) => {
      state.invitationUrl = action.payload;
    },
    addMessage: (state, action: PayloadAction<{ stepIndex: number; message: string }>) => {
      const { stepIndex, message } = action.payload;
      if (!state.messages[stepIndex]) {
        state.messages[stepIndex] = [];
      }
      // Only add if not already present
      if (!state.messages[stepIndex].includes(message)) {
        state.messages[stepIndex].push(message);
      }
    },
    setMessages: (state, action: PayloadAction<{ stepIndex: number; messages: string[] }>) => {
      const { stepIndex, messages } = action.payload;
      state.messages[stepIndex] = messages;
    },
    setInvitation: (state, action: PayloadAction<string>) => {
      state.invitationUrl = action.payload;
      // Also add a message to the connection step
      if (!state.messages[0]) {
        state.messages[0] = [];
      }
      if (!state.messages[0].includes('Received connection invitation')) {
        state.messages[0].push('Received connection invitation');
      }
    },
  },
});

export const {
  setCurrentStep,
  startTest,
  completeTest,
  resetTest,
  setInvitationUrl,
  addMessage,
  setMessages,
  setInvitation,
} = testSlice.actions;

export default testSlice.reducer;
