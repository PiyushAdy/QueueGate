import {app} from './app.js';
import {APP_PORT} from './config/env.js';
import http from "http";
import { initSocketGateway } from './sockets/gateway.js';


const server=http.createServer(app);

const io=initSocketGateway(server);

server.listen(APP_PORT, ()=>{
    console.log(`Server is running on PORT ${APP_PORT}`);
})

// app.listen(APP_PORT, ()=>{
//     console.log(`Server is running on PORT ${APP_PORT}`);
// })