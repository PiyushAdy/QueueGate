import dotenv from "dotenv";
dotenv.config();

let APP_PORT: number = Number(process.env.APP_PORT) || 3000;
export {APP_PORT};


const PG_USER = process.env.POSTGRES_USER;
const PG_PASS = process.env.POSTGRES_PASSWORD;
const PG_HOST = process.env.POSTGRES_HOST || "localhost";
const PG_PORT = process.env.POSTGRES_PORT || "5432";
const PG_DB = process.env.POSTGRES_DB || "queuegate";

export const PGconnectionString=(`postgres://${PG_USER}:${PG_PASS}@${PG_HOST}:${PG_PORT}/${PG_DB}`);

export const REDIS_HOST=(process.env.REDIS_HOST || "localhost");
export const REDIS_PORT=(Number(process.env.REDIS_PORT) || 6379);
export const DEFAULT_REDIS_BATCH_SIZE = Number(process.env.DEFAULT_BATCH_SIZE) || 50;

// process.env.PORT="Hello";
// console.log(process.env.PORT);