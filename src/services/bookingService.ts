import fs from "fs";
import path from "path";
import redis from "../redis/client.js";
import { pool } from "../db/pool.js";

const luaPath = path.join(process.cwd(), "src/redis/lua/confirmBooking.lua");
const confirmBookingScript = fs.readFileSync(luaPath, "utf-8");

export async function confirmBooking(eventId: string, queueId: string, clientId: string, queueTokenHash: string) {
    const detailsHash = `event:${eventId}:queueDetails:${queueId}`;
    const holdsSet = `event:${eventId}:admitted_holds`;

    try {
        const redisResult = await redis.eval(
            confirmBookingScript,
            2,
            detailsHash,
            holdsSet,
            queueTokenHash,
            queueId,
            eventId
        );
        if (typeof redisResult === 'object' && redisResult !== null && 'err' in redisResult) {
            return { success: false, error: (redisResult as {err: string}).err };
        }
        if (redisResult !== 'SUCCESS') {
             return { success: false, error: 'UNKNOWN_ERROR' };
        }

        try {
            const pgResult = await pool.query(
                `INSERT INTO bookings (event_id, queue_id, client_id, status) 
                 VALUES ($1, $2, $3, 'confirmed') RETURNING id`,
                [eventId, queueId, clientId]
            );

            return { success: true, bookingId: pgResult.rows[0].id };
            
        } catch (pgError: any) {
            console.error("Failed to insert booking into Postgres after Redis success:", pgError);
            
            if (pgError.code === '23505') { 
                return { success: false, error: 'ALREADY_BOOKED' };
            }
            return { success: false, error: 'DATABASE_ERROR' };
        }

    } catch (error) {
        console.error("Error in confirmBooking service:", error);
        return { success: false, error: 'SERVER_ERROR' };
    }
}
