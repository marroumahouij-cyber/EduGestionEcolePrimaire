import 'dotenv/config';
import { createApp } from './app.js';
import { migrate, pool } from './db.js';
import { ensureSuperAdmin } from './bootstrap.js';

const { DATABASE_URL, JWT_SECRET } = process.env;
if (!DATABASE_URL || !JWT_SECRET || JWT_SECRET.length < 32) { console.error('Configurez backend/.env : DATABASE_URL et JWT_SECRET (32 caractères minimum). Voir .env.example'); process.exit(1); }
if (process.env.NODE_ENV === 'production' && process.env.DEV_SEED === 'true') { console.error('DEV_SEED=true est interdit en production (comptes de développement connus).'); process.exit(1); }

if (process.env.NODE_ENV === 'production' && /CHANGEZ_MOI/i.test(JWT_SECRET)) { console.error('JWT_SECRET est encore la valeur d’exemple : générez-en une vraie (voir le guide).'); process.exit(1); }

await migrate();
await ensureSuperAdmin();
if (process.env.DEV_SEED === 'true') { const { seedDev } = await import('./seed.js'); await seedDev(); }
const port = Number(process.env.PORT || 3001);
createApp().listen(port, process.env.HOST || '0.0.0.0', () => console.log(`EduGestion démarré : http://localhost:${port}`));
process.on('SIGTERM', async () => { await pool.end(); process.exit(0); });
