import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '../utils/socketManager';
import { Socket } from 'socket.io-client';

interface InvitationData {
  invitation: string;
}

interface UseInvitationSocketResult {
  invitation: string | null;
  isConnected: boolean;
  error: string | null;
  reconnect: () => void;
}

const useInvitationSocket = (): UseInvitationSocketResult => {
  const [invitation, setInvitation] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  const handleConnect = useCallback(() => {
    setIsConnected(true);
    setError(null);
  }, []);

  const handleDisconnect = useCallback((reason: string) => {
    setIsConnected(false);
    if (reason !== 'io client disconnect') {
      setError('Disconnected from the server');
    }
  }, []);

  const handleError = useCallback((err: Error) => {
    setError(err.message);
    setIsConnected(false);
  }, []);

  const handleInvitation = useCallback((data: InvitationData) => {
    setInvitation(data.invitation);
    setError(null);
  }, []);

  const reconnect = useCallback(() => {
    if (socket) {
      socket.disconnect();
      socket.connect();
    }
  }, [socket]);

  useEffect(() => {
    const socketInstance = getSocket();
    if (!socketInstance) {
      setError('Failed to initialize socket connection');
      return;
    }

    setSocket(socketInstance);

    // Set up event listeners
    socketInstance.on('connect', handleConnect);
    socketInstance.on('disconnect', handleDisconnect);
    socketInstance.on('connect_error', handleError);
    socketInstance.on('invitation', handleInvitation);

    // Cleanup function
    return () => {
      socketInstance.off('connect', handleConnect);
      socketInstance.off('disconnect', handleDisconnect);
      socketInstance.off('connect_error', handleError);
      socketInstance.off('invitation', handleInvitation);
    };
  }, [handleConnect, handleDisconnect, handleError, handleInvitation]);

  return {
    invitation,
    isConnected,
    error,
    reconnect
  };
};

export default useInvitationSocket; 