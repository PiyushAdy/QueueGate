import { PGconfig } from "../config/pgConfig.js";
import {Pool} from 'pg'

export const pool=new Pool(PGconfig);