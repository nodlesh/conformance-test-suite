import { Server as SocketIOServer, Socket } from "socket.io";
import { state } from "./state";
import { server, app } from "./api";
import eventEmitter from "@demo/core/agent/utils/eventEmitter";

console.log("Initializing Socket.IO server...");

// Create Socket.IO server with proper configuration to coexist with Express
export const io = new SocketIOServer(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"],
  pingTimeout: 120000,
  pingInterval: 25000,
  connectTimeout: 45000,
  allowEIO3: true,
  maxHttpBufferSize: 1e8,
  httpCompression: false,
  // CRITICAL: This tells Socket.IO to only handle Socket.IO requests
  path: "/socket.io/",
  serveClient: false  // Don't serve the Socket.IO client script
});

let updateSequence = 0;
let lastAcknowledgedSequence = 0;

export const emitDAGUpdate = () => {
  const serializedDag = state?.dag?.serialize();
  const sequence = ++updateSequence;
  
  // Detailed DAG state logging for debugging
//  console.log('WebSocket - Emitting DAG State:', {
//    sequence,
//    dagState: serializedDag?.status,
//    connectedClients: io.engine.clientsCount,
//    nodeStates: serializedDag?.nodes?.map(n => ({
//      name: n.name,
//      state: n.state,
//      finished: n.finished,
//      taskStatus: n.task?.state?.status,
//      taskRunState: n.task?.state?.runState
//    }))
//  });
//  
  const emitData = { sequence, dag: serializedDag };
  
  // Use the working event name only
  io.emit("dag-state-update", emitData);
  
  // Log successful emission
//  console.log(`WebSocket - Broadcasted dag-state-update ${sequence} to ${io.engine.clientsCount} clients`);
};

eventEmitter.on("invitation", (invitationUrl: string) => {
  state.currentInvitation = invitationUrl;
  io.emit("invitation", invitationUrl);
  console.log("emitted invitation", invitationUrl);
});

// Handle Socket.io connections
io.on("connection", (socket: Socket) => {
  console.log("User connected:", socket.id);
  console.log("Socket transport:", socket.conn.transport.name);
  console.log("Total connected clients:", io.engine.clientsCount);
  
  // Send initial state with current sequence
  const initialData = { 
    sequence: updateSequence,
    dag: state?.dag?.serialize()
  };
  
  console.log('WebSocket - Sending initial state to new client:', {
    clientId: socket.id,
    sequence: updateSequence,
    dagState: initialData.dag?.status,
    nodeCount: initialData.dag?.nodes?.length
  });
  
  socket.emit("dag-state-update", initialData);

  // Handle acknowledgment (keep for debugging)
  socket.on("dag-update-ack", (ack: { sequence: number }) => {
    if (ack && ack.sequence) {
      lastAcknowledgedSequence = Math.max(lastAcknowledgedSequence, ack.sequence);
      console.log('WebSocket - Update Acknowledged:', {
        sequence: ack.sequence,
        lastAcknowledgedSequence,
        clientId: socket.id
      });
    }
  });

  socket.on("disconnect", (reason: string) => {
    console.log("User disconnected:", socket.id, "Reason:", reason);
    console.log("Remaining connected clients:", io.engine.clientsCount);
  });

  socket.on("error", (error: Error) => {
    console.error("Socket error for client", socket.id, ":", error);
  });
});
