import {type ClientConfig} from 'pg';
import { PGconnectionString } from './env.js';

const PGconfig :ClientConfig={
    connectionString:PGconnectionString
}
export {PGconfig};
