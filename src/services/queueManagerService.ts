import fs from "fs";
import path from "path";
import { Server as SocketIOServer } from "socket.io";
import redis from "../redis/client.js";
import { admitUsers } from "./admissionService.js";

const luaPath = path.join(process.cwd(), "src/redis/lua/expireUsers.lua");
const expireLuaScript = fs.readFileSync(luaPath, "utf-8");

export function startQueueManager(io: SocketIOServer, intervalMs: number = 5000) {
    console.log(`Starting Queue Manager. Running every ${intervalMs}ms...`);
    
    setInterval(async () => {
        try {
            const keys = await redis.keys('event:*:queue');
            const currentTimeMs = Date.now();

            for (const key of keys) {
                const parts = key.split(':');
                const eventId = parts[1];
                if (!eventId) continue;
                
                const holdsSet = `event:${eventId}:admitted_holds`;
                const detailsHash = `event:${eventId}:details`;
                
                const expiredQueueIds = await redis.eval(
                    expireLuaScript,
                    2,
                    holdsSet,
                    detailsHash,
                    eventId,
                    currentTimeMs
                ) as string[];
                
                if (expiredQueueIds && expiredQueueIds.length > 0) {
                    console.log(`Expired ${expiredQueueIds.length} users for event ${eventId}. Reclaimed inventory.`);
                    for (const queueId of expiredQueueIds) {
                        io.to(`queue:${queueId}`).emit("queue:expired", {
                            status: "expired",
                            message: "Your time to book has expired. Your ticket was released."
                        });
                    }
                }
                
                const availableInventoryRaw = await redis.hget(detailsHash, "availableInventory");
                const availableInventory = parseInt(availableInventoryRaw || "0", 10);
                
                if (availableInventory > 0) {
                    await admitUsers(eventId, availableInventory, io);
                } else {
                    const activeHolds = await redis.zcard(holdsSet);
                    if (activeHolds === 0) {
                        const waitingUsers = await redis.zcard(`event:${eventId}:queue`);
                        if (waitingUsers > 0) {
                            io.to(`event:${eventId}`).emit("event:sold_out", {
                                status: "sold_out",
                                message: "All tickets have been booked. Event is officially sold out!"
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error in Queue Manager:", error);
        }
    }, intervalMs);
}
