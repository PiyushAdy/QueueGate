import {app} from './app.js';
import {APP_PORT} from './config/env.js';

// const PORT=(process.env.PORT || 3000);

app.listen(APP_PORT, ()=>{
    console.log(`Server is running on PORT ${APP_PORT}`);
})

// process.env.PORT="Hello";
// console.log(process.env.PORT);

