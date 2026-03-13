import { useSelector } from 'react-redux';
import type { RootState } from '../store';

export const useDAGState = () => {
  const connectionStatus = useSelector((state: RootState) => state.socket.connectionStatus);
  const dag = useSelector((state: RootState) => state.dag.dag);
  const error = useSelector((state: RootState) => state.socket.error);

  return {
    connectionStatus,
    dag,
    error
  };
}; 