import {pool} from "../db/pool.js" 
import redis from '../redis/client.js'
import {randomUUID} from 'crypto'


async function addEvent(eventName : string,totalInventory : number,holdSec : number){
    const eventID=randomUUID();
    try{
        await pool.query(`INSERT INTO events (id,name,total_inventory,hold_seconds) VALUES ($1,$2,$3,$4);`,[eventID,eventName,totalInventory,holdSec]);
        await redis.hset(`event:${eventID}:details`, {
            name: eventName,
            holdSec: holdSec,
            totalInventory: totalInventory,
            availableInventory :totalInventory
        });
        return eventID;
    }catch(error){
        return null;
    }
}


async function getEvent(eventID: string | undefined) {
      if (!eventID) return null;
      
      const cached = await redis.hgetall(`event:${eventID}:details`);
      if (cached && cached.name) {
        // ioredis returns an object with undefined name and NaN for 
        return {
          eventName: cached.name,
          totalInventory: Number(cached.totalInventory),
          holdSec: Number(cached.holdSec)
        };
      }

      const result = await pool.query(
        `SELECT * FROM events WHERE id = $1`,
        [eventID]
      );
      
      if (result.rows.length > 0) {
        const row = result.rows[0];

        // repopulating redis cache 
        await redis.hset(`event:${eventID}:details`, {
            name: row.name,
            holdSec: row.hold_seconds,
            totalInventory: row.total_inventory
        });

        return {
          eventName: row.name,
          totalInventory: row.total_inventory,
          holdSec: row.hold_seconds
        };
      }
       
      return null;
    }

async function getEventSummary(eventID: string) {
    if (!eventID) return null;

    try {
        // 1. Get Live State from Redis
        const cached = await redis.hgetall(`event:${eventID}:details`);
        if (!cached || !cached.name) {
            return null; // Event doesn't exist in Redis
        }

        const usersWaitingInQueue = await redis.zcard(`event:${eventID}:queue`);
        const activeHolds = await redis.zcard(`event:${eventID}:admitted_holds`);

        // 2. Get Durable Bookings from Postgres
        const pgResult = await pool.query(
            `SELECT COUNT(*) FROM bookings WHERE event_id = $1 AND status = 'confirmed'`,
            [eventID]
        );
        const confirmedBookings = parseInt(pgResult.rows[0].count, 10);

        return {
            eventName: cached.name,
            totalInventory: Number(cached.totalInventory),
            availableInventory: Number(cached.availableInventory),
            usersWaitingInQueue,
            activeHolds,
            confirmedBookings
        };
    } catch (error) {
        console.error("Error fetching event summary:", error);
        return null;
    }
}

async function getAllEvents() {
    try {
        const result = await pool.query(
            `SELECT id, name, total_inventory as "totalInventory", hold_seconds as "holdSec" 
             FROM events ORDER BY created_at DESC LIMIT 20`
        );
        return result.rows;
    } catch (error) {
        console.error("Error fetching all events:", error);
        return [];
    }
}

export {addEvent, getEvent, getEventSummary, getAllEvents};