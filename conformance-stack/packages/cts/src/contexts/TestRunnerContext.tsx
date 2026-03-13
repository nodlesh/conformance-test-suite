import React, { createContext, useContext, ReactNode } from 'react';

interface TestRunnerContextType {
  testRunner: {
    start: () => void;
    stop: () => void;
    reset: () => void;
  } | null;
}

const TestRunnerContext = createContext<TestRunnerContextType>({ testRunner: null });

export function useTestRunner() {
  const context = useContext(TestRunnerContext);
  if (!context) {
    throw new Error('useTestRunner must be used within a TestRunnerProvider');
  }
  return context;
}

interface TestRunnerProviderProps {
  children: ReactNode;
}

export function TestRunnerProvider({ children }: TestRunnerProviderProps) {
  const testRunner = {
    start: () => {
      console.log('Starting test runner...');
    },
    stop: () => {
      console.log('Stopping test runner...');
    },
    reset: () => {
      console.log('Resetting test runner...');
    },
  };

  return (
    <TestRunnerContext.Provider value={{ testRunner }}>
      {children}
    </TestRunnerContext.Provider>
  );
} 