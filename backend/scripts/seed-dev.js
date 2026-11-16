import 'dotenv/config';
import { migrate, pool } from '../src/db.js';
import { ensureSuperAdmin } from '../src/bootstrap.js';
import { seedDev } from '../src/seed.js';
if (process.env.NODE_ENV === 'production') { console.error('Refusé en production.'); process.exit(1); }
await migrate(); await ensureSuperAdmin(); await seedDev(); await pool.end();
