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
            });
            return{
                "queueId" : queueId,
                "ticketNum" : currentSeq,
                "currentPos" :  currentSeq,
                "queueToken": queueToken
            }
        }
    }catch(error){
        console.error("Error Occured ::",error);
        return null;
    }
}

export {joinQueue};