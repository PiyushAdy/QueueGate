import {Redis} from "ioredis"
import { REDIS_HOST, REDIS_PORT } from "../config/env.js";

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT
})

redis.on("connect",()=>{
    console.log("Successfully Connected");
})

redis.on("ready",()=>{
    console.log("Redis is Ready");
})

redis.on("error",(error : Error)=>{
    console.log(`Error Occured :: ${error}`);
})

export default redis;

