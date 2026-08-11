import { Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import redis from "../redis/client.js";
import { getQueueStatus } from "../services/queueService.js";


function initSocketGateway(server: HTTPServer) {
    const io = new SocketIOServer(server, {
        cors: { origin: "*" }
    });

    // middleware
    io.use(async (socket, next) => {
        const queueId = socket.handshake.auth.queueId || socket.handshake.query.queueId;
        const eventId = socket.handshake.auth.eventId || socket.handshake.query.eventId;
    
        if (!queueId || !eventId) {
          return next(new Error("Authentication failed: queueId and eventId required"));
        }
    
        // checking if queueid is availabe in redius 
        const queueData = await redis.hgetall(`event:${eventId}:queueDetails:${queueId}`);
        if (!queueData || Object.keys(queueData).length === 0) {
          return next(new Error("Authentication failed: Invalid queue session"));
        }
    
        // Store data to socket data obj
        socket.data.queueId = queueId;
        socket.data.eventId = eventId;
        socket.data.clientId = queueData.clientId;
        socket.data.status = queueData.status || "waiting";

        next();
      });

      //  connection handler
      io.on("connection", async (socket) => {
        const { queueId, eventId, clientId } = socket.data;
    
        socket.join(`queue:${queueId}`);
        socket.join(`event:${eventId}`);
        console.log(`Socket connected: ${socket.id} joined room queue:${queueId}`);
    
        const rank = await redis.zrank(`event:${eventId}:queue`, clientId);
        const totalWaiting = await redis.zcard(`event:${eventId}:queue`);
    
        socket.emit("queue:status", {
          status: socket.data.status,
          position: rank !== null ? rank + 1 : null,
          totalWaiting
        });
    
        socket.on("disconnect", () => {
          console.log(`Socket disconnected: ${socket.id}`);
        });
      });
    
      return io;
}

async function broadcastQueuePositions(io : SocketIOServer,eventId: string){
  // fetchsockets retuns all the sockets connected
  // using in and then fetchsockets allow us to get those which belong to same room
  const allEventSockets=await io.in(`event:${eventId}`).fetchSockets();

  // forEach 
  allEventSockets.forEach(async (socket)=>{
    // const clientId=socket.data.clientId;
    const queueId=socket.data.queueId;
    if (!queueId){
      socket.emit('queue:status',{
        status:"No queue exists for client for the selected event"
      })
      return {
        status:"No queue exists for client for the selected event"
      }
    }
    const queueDetails=(await getQueueStatus(eventId,queueId)) as object;
    if (("status" in queueDetails && "currentPos" in queueDetails && "totalWaiting" in queueDetails)){
      socket.emit('queue:status',{
        "status":queueDetails.status,
        "currentPos":queueDetails.currentPos,
        "totalWaiting":queueDetails.totalWaiting
      })
      return {
        status:"Success"
      }
    }else{
      socket.emit('queue:status',{
        status:"failed to get status of the queue"
      })
      return {
        status:"failed to get status of the queue"
      }
    }
  })

}

export {initSocketGateway,broadcastQueuePositions};
