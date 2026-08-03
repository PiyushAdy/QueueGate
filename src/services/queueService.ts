import { randomUUID ,createHash} from "crypto";
import redis from "../redis/client.js"

async function joinQueue(eventId :string ,clientId :string){
    try{
        let queueId= await redis.get(`event:${eventId}:${clientId}`);
        if (queueId){
            const queueData=await redis.hgetall(`event:${eventId}:queueDetails:${queueId}`);
            const currentPos=await redis.zrank(`event:${eventId}:queue`,clientId);
            // zrank returns first position persons rank as 0 so while returning we are adding 1
            return{
                "queueId" : queueId,
                "ticketNum" : queueData.ticketNum,
                "currentPos" : (1+Number(currentPos))
            }
        }
        // joing queue if not joined before 
        const currentSeq= await redis.incr(`event:${eventId}:seq`);
        if (currentSeq){
            queueId=randomUUID();
            const queueToken =randomUUID();
            const queueTokenHash=createHash('sha256').update(queueToken).digest('hex');
            await redis.zadd(`event:${eventId}:queue`,currentSeq,clientId);
            await redis.set(`event:${eventId}:${clientId}`,queueId);
            await redis.hset(`event:${eventId}:queueDetails:${queueId}`, {
                clientId,
                ticketNum: currentSeq,
                queueTokenHash,
                "status":"waiting",
            });
            return{
                "queueId" : queueId,
                "ticketNum" : currentSeq,
                "currentPos" :  currentSeq,
                "queueToken": queueToken,
            }
        }
    }catch(error){
        console.error("Error Occured ::",error);
        return null;
    }
}


async function getQueueStatus(eventId:string , queueId:string){
    const queueData=await redis.hgetall(`event:${eventId}:queueDetails:${queueId}`);
    if (Object.keys(queueData).length==0){
        return{
            "error" : "Invalid Queue ID"
        };
    }
    const clientId=queueData.clientId;
    if (!clientId){
        return{
            "error" : "Invalid Client ID"
        };
    }
    const rank=await redis.zrank(`event:${eventId}:queue`, clientId);
    const currentPos=(rank!==null) ? rank+1 : null;
    const totalWaiting=await redis.zcard(`event:${eventId}:queue`);
    
    return {
        "status":queueData.status,
        "tiketNum":queueData.ticketNum,
        "currentPos": currentPos,
        "totalWaiting":totalWaiting
    }
}
export {joinQueue, getQueueStatus};