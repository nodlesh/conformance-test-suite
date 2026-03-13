"use client";

import React, { createContext, useContext, useEffect, useRef, ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import { io, Socket } from "socket.io-client";
import { RootState } from "@/store";
import { setConnectionStatus, setError } from "@/store/socketSlice";
import { setDAG } from "@/store/dagSlice";
import { setInvitation } from "@/store/testSlice";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};

interface SocketProviderProps {
  children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const dispatch = useDispatch();
  const socketRef = useRef<Socket | null>(null);
  const { connectionStatus } = useSelector((state: RootState) => state.socket);
  const isConnected = connectionStatus === "connected";

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5005";
    console.log("Unified Socket: Initializing connection to:", socketUrl);
    
    // Clean up existing connection
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const socketInstance = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      forceNew: true,
      withCredentials: true,
      path: "/socket.io/",
      query: {
        clientId: Math.random().toString(36).substring(7)
      }
    });

    // Connection event handlers
    socketInstance.on("connect", () => {
      console.log("Unified Socket: Connected with ID:", socketInstance.id);
      dispatch(setConnectionStatus("connected"));
      dispatch(setError(null));
    });

    socketInstance.on("connect_error", (error) => {
      console.error("Unified Socket: Connection error:", error.message);
      dispatch(setConnectionStatus("disconnected"));
      dispatch(setError("Failed to connect to the server"));
    });

    socketInstance.on("disconnect", (reason) => {
      console.log("Unified Socket: Disconnected. Reason:", reason);
      dispatch(setConnectionStatus("disconnected"));
      if (reason !== "io client disconnect") {
        dispatch(setError("Disconnected from the server"));
      }
    });

    socketInstance.on("reconnect", (attemptNumber) => {
      console.log("Unified Socket: Reconnected after", attemptNumber, "attempts");
      dispatch(setConnectionStatus("connected"));
      dispatch(setError(null));
    });

    socketInstance.on("reconnect_error", (error) => {
      console.error("Unified Socket: Reconnection error:", error);
      dispatch(setError("Reconnection failed"));
    });

    // Application-specific event handlers
    socketInstance.on("dag-state-update", (data: { sequence: number; dag: any }) => {
      console.log("Unified Socket: DAG state update received:", data.sequence);
      console.log("DAG:", data.dag);
      if (data.dag) {
        dispatch(setDAG(data.dag));
      }
    });

    socketInstance.on("invitation", (url: string) => {
      console.log("Unified Socket: Invitation received:", url);
      dispatch(setInvitation(url));
    });

    socketRef.current = socketInstance;

    return () => {
      console.log("Unified Socket: Cleaning up connection");
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [dispatch]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}
