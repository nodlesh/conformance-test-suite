"use client";

import { useSelector } from "react-redux";
import { RootState } from "@/store";

export function SocketStatus() {
  const { connectionStatus, error } = useSelector((state: RootState) => state.socket);
  const isConnected = connectionStatus === "connected";

  return (
    <div className="fixed bottom-4 right-4 p-2 rounded-lg shadow-lg bg-white">
      <div className="flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-full ${
            isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
          }`}
        />
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {isConnected ? "Connected" : "Disconnected"}
          </span>
          {error && (
            <span className="text-xs text-red-600">
              {error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
} 