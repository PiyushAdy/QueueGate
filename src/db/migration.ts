import { PGconfig } from '../config/pgConfig.js';
import { Client } from 'pg'
import fs from 'fs';

const sql_query= fs.readFileSync("./src/db/schema.sql", "utf-8");
// console.log(sql_query);

const client = new Client(PGconfig);
try {
    await client.connect();
    const result = await client.query(sql_query);
    console.log("Migration Successful");
} catch (error) {
    console.error("Migration Failed",error);
} finally{
    await client.end();
}

