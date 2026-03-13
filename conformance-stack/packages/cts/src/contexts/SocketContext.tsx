// src/contexts/SocketContext.tsx

import React, { createContext, useContext } from "react";
import { Socket } from "socket.io-client";

// Define the shape of the context as Socket or null
type SocketContextType = Socket | null;

// Create the context with a default value
const SocketContext = createContext<SocketContextType>(null);

// Custom hook to use the SocketContext
export const useSocket = (): SocketContextType => {
  return useContext(SocketContext);
};

// Props for the SocketProvider
interface SocketProviderProps {
  socket: Socket;
  children: React.ReactNode;
}

// SocketProvider component
export const SocketProvider: React.FC<SocketProviderProps> = ({
  socket,
  children,
}) => {
  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
};
