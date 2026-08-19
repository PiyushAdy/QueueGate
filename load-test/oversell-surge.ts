import { randomUUID, createHash } from "crypto";
import { APP_PORT, APP_HOST } from "../src/config/env.js";

const API_URL = `http://${APP_HOST}:${APP_PORT}`;


const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function runLoadTest() {
    console.log("Starting Concurrency & Oversell Load Test");
    const createRes = await fetch(`${API_URL}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            eventName: `OversellTest-${randomUUID()}`,
            totalInventory: 5,
            holdSec: 30
        })
    });
    
    type dataType={
        eventID: string
    }
    const { eventID } = await createRes.json() as dataType;
    console.log(`Created Event: ${eventID} with 5 tickets`);


    console.log("Now ,Simulating 200 concurrent users joining the queue");
    const joinPromises = [];
    const users: { clientId: string, queueId: string, queueToken: string }[] = [];
    const startTime = performance.now();
    for (let i = 0; i < 200; i++) {
        const clientId = randomUUID();
        joinPromises.push(
            fetch(`${API_URL}/events/${eventID}/join`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clientId })
            }).then(async res => {
                type dataType = {
                    queueId: string;
                    queueToken: string;
                };
                const data = await res.json() as dataType;
                if (data.queueId) {
                    users.push({ clientId, queueId: data.queueId, queueToken: data.queueToken });
                }
                return data;
            })
        );
    }

    await Promise.all(joinPromises);

    const endTime = performance.now();
    const durationMs = endTime - startTime;
    const rps = (200 / (durationMs / 1000)).toFixed(2);
    
    console.log(`\nThroughput Metrics:`);
    console.log(`- 200 Joins completed in ${durationMs.toFixed(2)} ms`);
    console.log(`- Requests Per Second (RPS): ${rps} req/sec`);
    console.log(`\n⏳ Waiting 6 seconds for the Queue Manager Worker to admit the first 5 people...`);
    await sleep(6000);

    console.log(`Checking statuses to find admitted users...`);
    const statusPromises = users.map(u => 
        fetch(`${API_URL}/events/${eventID}/queue/${u.queueId}`).then(res => res.json())
    );
    const statuses : any= await Promise.all(statusPromises);
    const admittedUsers = users.filter((u, index) => statuses[index].status === "admitted");
    console.log(`Found ${admittedUsers.length} admitted users (Expected: 5)`);


    console.log(`\nInitiating Booking Surge (Trying to force double-booking)...`);    
    const bookPromises = [];
    for (const user of admittedUsers) {
        const queueTokenHash = createHash("sha256").update(user.queueToken).digest("hex");

        // Each user clicks "Book" 5 times 
        for (let i = 0; i < 5; i++) {
            bookPromises.push(
                fetch(`${API_URL}/events/${eventID}/book`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        clientId: user.clientId,
                        queueId: user.queueId,
                        queueTokenHash
                    })
                }).then(res => res.json())
            );
        }
    }

    const bookResults = await Promise.all(bookPromises);
    type DataType = { status: string; error?: string; message?: string };

    const results = bookResults as DataType[];

    const successes = results.filter(r => r.status === "Success");
    const doubleBookErrors = results.filter(
        r => r.error === "ALREADY_BOOKED" || r.message === "You have already booked a ticket for this event."
    );
    console.log(`\nBooking Results:`);
    console.log(`Total Booking Attempts: ${bookPromises.length}`);
    console.log(`Successful Bookings: ${successes.length} (Expected exactly 5)`);
    console.log(`Prevented Double-Bookings: ${doubleBookErrors.length} (Expected 20)`);
    
    if (successes.length === 5) {
        console.log(`\nZERO OVERSELLING DETECTED! The Redis Lua atomic locks successfully protected the database!`);
    } else {
        console.log(`\nFAIL! Overselling detected.`);
    }
}

runLoadTest().catch(console.error);
