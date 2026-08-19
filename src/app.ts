import express,{type NextFunction, type Request,type Response} from "express";
import {addEvent, getEvent, getEventSummary, getAllEvents} from "../src/services/eventService.js"
import {joinQueue , getQueueStatus} from "../src/services/queueService.js"
import { Client } from "pg";
import { confirmBooking } from "../src/services/bookingService.js";
import redis from "./redis/client.js";
const app = express();

app.use(express.json());
import path from "path";
app.use(express.static(path.join(process.cwd(), "public")));
app.get("/health",(_req :Request,res :Response)=>{
    return res.json({"status":"ok"});
})

app.post("/events",async (req :Request,res :Response)=>{
    if (req.body.eventName && req.body.totalInventory && req.body.holdSec){
        const resp=await addEvent(req.body.eventName,req.body.totalInventory,req.body.holdSec);
        if (resp){
            return res.json({
                "status":"event added successfully",
                "eventID" : resp
            })
        }
    }
    res.status(400);
    res.json({
        "status":"insufficient params passed or some error occured"
    })
})

app.get("/events", async (req: Request, res: Response) => {
    const events = await getAllEvents();
    return res.json({
        status: "Success",
        data: events
    });
});

app.get("/events/:eventId",async function(req :Request,res :Response){
    let eventId=req.params.eventId;
    if (!eventId){
        res.status(400)
        return res.json({
            "status":"Invalid eventID supplied"
        })
    }
    eventId = Array.isArray(eventId) ? eventId[0] : eventId;

    const resp= await getEvent(eventId);
    if (resp){
        return res.json({
            "status":"Success",
            ...resp
        });
    }
    res.status(400);
    return res.json({
        "status":"Invalid eventId supplied"
    })
})

app.get("/events/:eventId/summary",async function(req :Request,res :Response){
    let eventId = req.params.eventId;
    eventId = Array.isArray(eventId) ? eventId[0] : eventId;
    
    if (!eventId){
        return res.status(400).json({ status: "Invalid eventID supplied" });
    }

    const summary = await getEventSummary(eventId);
    if (summary) {
        return res.status(200).json({
            status: "Success",
            data: summary
        });
    }
    return res.status(404).json({ status: "Event not found" });
})

app.post("/events/:eventId/join",async function(req :Request,res :Response){
    let eventId;
    if (req.params.eventId){
        eventId=(Array.isArray(req.params.eventId)) ? req.params.eventId[0] : req.params.eventId;
    }
    const clientId=req.body.clientId;
    if (!clientId || !eventId){
        return res.status(400).json({
            "status":"Invalid ClientID supplied"
        });
    }
    const result=await joinQueue(eventId,clientId);
    if (!result){
        return res.status(500).json({
            "status":"Error Occured while joining queue" 
        });
    }
    return res.status(200).json({
        ...result
    })
})

app.post("/events/:eventId/book",async function(req :Request,res :Response){
    let eventId = req.params.eventId;
    eventId = Array.isArray(eventId) ? eventId[0] : eventId;
    
    const { clientId, queueId, queueTokenHash } = req.body;
    
    if (!clientId || !queueId || !queueTokenHash){
        return res.status(400).json({
            status: "Invalid params supplied. Need clientId, queueId, and queueTokenHash"
        });
    }
    
    const result = await confirmBooking(eventId, queueId, clientId, queueTokenHash);
    
    if (!result.success) {
        if (result.error === 'NOT_ADMITTED') {
            return res.status(403).json({ status: "Error", message: "You are not admitted to book yet or your hold expired." });
        }
        if (result.error === 'INVALID_TOKEN') {
            return res.status(401).json({ status: "Error", message: "Invalid queue token." });
        }
        if (result.error === 'ALREADY_BOOKED') {
            return res.status(409).json({ status: "Error", message: "You have already booked a ticket for this event." });
        }
        return res.status(500).json({ status: "Error", message: "Internal Server Error" });
    }
    
    return res.status(200).json({
        status: "Success",
        message: "Booking confirmed!",
        bookingId: result.bookingId
    });
})

app.get("/events/:eventId/queue/:queueId",async function(req :Request,res :Response){
    let eventId;
    if (req.params.eventId){
        eventId=(Array.isArray(req.params.eventId)) ? req.params.eventId[0] : req.params.eventId;
    }
    let queueId;
    if (req.params.queueId){
        queueId=(Array.isArray(req.params.queueId)) ? req.params.queueId[0] : req.params.queueId;
    }
    if (!queueId ){
        return res.status(400).json({
            "status":"Invalid params supplied"
        });
    }
    if (!eventId){
        return res.status(400).json({
            "status":"Invalid params supplied"
        });
    }
    const result=await getQueueStatus(eventId,queueId);
    if (!result){
        return res.status(500).json({
            "status":"Error Occured while getting queueState" 
        });
    }
    return res.status(200).json({
        ...result
    })
})


// Error middlewares
app.use((_req:Request,res :Response ,_next : NextFunction)=>{
    res.status(404);
    res.json({"error":"404 Page not found"});
})

app.use((err: Error,_req:Request,res:Response,next :NextFunction)=>{
    console.log(`Error Occured :: ${err}`);

    res.status(500);
    res.json({"error":"Internal Server Error"});
})

export {app};