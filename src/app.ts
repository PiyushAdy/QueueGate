import express,{type NextFunction, type Request,type Response} from "express";
import {addEvent, getEvent} from "../src/services/eventService.js"
import {joinQueue , getQueueStatus} from "../src/services/queueService.js"
import { Client } from "pg";
import redis from "./redis/client.js";
const app = express();


app.use(express.json());

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
        status:"Success",
        ...result
    })
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