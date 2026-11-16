import 'dotenv/config';
import { migrate, pool } from '../src/db.js';
await migrate(); console.log('Base de données à jour.'); await pool.end();
