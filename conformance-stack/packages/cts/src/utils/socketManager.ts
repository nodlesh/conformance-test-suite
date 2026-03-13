import io, { Socket } from "socket.io-client";
import { SOCKET_SERVER_URL } from "../utils/env";

let socket: Socket | null = null;

export const initializeSocket = (url: string): Socket => {
  if (!socket) {
    console.log('Initializing socket connection to:', url);
    
    socket = io(url, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      forceNew: false,
      withCredentials: true,
    });
    
    // Enhanced connection event logging
    socket.on('connect', () => {
      console.log('SocketManager: Connected with ID:', socket?.id);
    });
    
    socket.on('connect_error', (error) => {
      console.error('SocketManager: Connection error:', error.message);
    });
    
    socket.on('disconnect', (reason) => {
      console.log('SocketManager: Disconnected:', reason);
    });
    
    socket.on('reconnect', (attempt) => {
      console.log('SocketManager: Reconnected after', attempt, 'attempts');
    });
    
    socket.on('reconnect_error', (error) => {
      console.error('SocketManager: Reconnection error:', error.message);
    });
  }
  return socket;
};

export const getSocket = (): Socket | null => {
  if (!socket) {
    initializeSocket(SOCKET_SERVER_URL);
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
