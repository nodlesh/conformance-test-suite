"use client";

import { ReactNode } from "react";
import { Provider } from "react-redux";
import { SocketStatus } from "@/components/SocketStatus";
import { SocketProvider } from "@/providers/SocketProvider";
import { store } from "@/store";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <Provider store={store}>
      <SocketProvider>
        {children}
        <SocketStatus />
      </SocketProvider>
    </Provider>
  );
}
