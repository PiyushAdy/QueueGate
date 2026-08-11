import fs from "fs";
import path from "path";
import { Server as SocketIOServer } from "socket.io";
import redis from "../redis/client.js";
import { broadcastQueuePositions } from "../sockets/gateway.js";


const luaPath = path.join(process.cwd(), "src/redis/lua/admitUsers.lua");
// process.cwd() tells the root directory of project jahan se woh chal rha hai 
// because we do not have commonJS enables so we do not have access to __dirname , this used to path of current file 

const admitLuaScript = fs.readFileSync(luaPath, "utf-8");

export async function admitUsers(eventId: string, batchSize: number, io: SocketIOServer) {
    try {
        const queueSetKey = `event:${eventId}:queue`;
        const detailsHashKey = `event:${eventId}:details`;
        const currentTimeMs = Date.now();

        
        const admittedQueueIds = await redis.eval(
            admitLuaScript,
            2,
            queueSetKey,
            detailsHashKey,
            eventId,
            batchSize,
            currentTimeMs
        ) as string[];

        if (admittedQueueIds && admittedQueueIds.length > 0) {
            console.log(`Admitted ${admittedQueueIds.length} users for event ${eventId}`);

            for (const queueId of admittedQueueIds) {
                io.to(`queue:${queueId}`).emit("queue:admitted", {
                    status: "admitted",
                    message: "You are admitted! Please complete your booking."
                });
            }

            await broadcastQueuePositions(io, eventId);
        }

        return admittedQueueIds;
    } catch (error) {
        console.error("Error in admitUsers:", error);
        return [];
    }
}
