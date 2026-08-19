import fs from "fs";
import path from "path";
import { randomUUID, createHash } from "crypto";
import redis from "../redis/client.js";

const joinLuaPath = path.join(process.cwd(), "src/redis/lua/joinQueue.lua");
const joinLuaScript = fs.readFileSync(joinLuaPath, "utf-8");

async function joinQueue(eventId: string, clientId: string) {
    try {
        const clientKey = `event:${eventId}:${clientId}`;
        const seqKey = `event:${eventId}:seq`;
        const queueSet = `event:${eventId}:queue`;

        const newQueueId = randomUUID();
        const queueToken = randomUUID();
        const queueTokenHash = createHash("sha256").update(queueToken).digest("hex");
        const joinedAt = Date.now().toString();

        const result = (await redis.eval(
            joinLuaScript,
            3,
            clientKey,
            seqKey,
            queueSet,
            clientId,
            newQueueId,
            queueTokenHash,
            joinedAt,
            eventId
        )) as string[] | null;

        if (!result || result.length === 0) {
            return null;
        }
        const [type, queueId, ticketNum, currentPos, status] = result;

        return {
            queueId,
            ticketNum: Number(ticketNum),
            currentPos: currentPos ? Number(currentPos) : null,
            status,
            ...(type === "NEW" ? { queueToken } : {})
        };
    } catch (error) {
        console.error("Error occurred in joinQueue:", error);
        return null;
    }
}


async function getQueueStatus(eventId: string, queueId: string) {
    const queueData = await redis.hgetall(`event:${eventId}:queueDetails:${queueId}`);
    if (Object.keys(queueData).length == 0) {
        return {
            "error": "Invalid Queue ID"
        };
    }
    const clientId = queueData.clientId;
    if (!clientId) {
        return {
            "error": "Invalid Client ID"
        };
    }
    const rank = await redis.zrank(`event:${eventId}:queue`, clientId);
    const currentPos = (rank !== null) ? rank + 1 : null;
    const totalWaiting = await redis.zcard(`event:${eventId}:queue`);

    let status = queueData.status;
    if (status === 'waiting') {
        const availableInventoryRaw = await redis.hget(`event:${eventId}:details`, "availableInventory");
        const availableInventory = parseInt(availableInventoryRaw || "0", 10);
        const activeHolds = await redis.zcard(`event:${eventId}:admitted_holds`);
        if (availableInventory <= 0 && activeHolds === 0) {
            status = 'sold_out';
        }
    }

    return {
        "status": status,
        "tiketNum": queueData.ticketNum,
        "currentPos": currentPos,
        "totalWaiting": totalWaiting
    }
}
export { joinQueue, getQueueStatus };