// Usage : npm run superadmin:create   (lit SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD dans backend/.env)
import 'dotenv/config';
import { migrate, pool } from '../src/db.js';
import { ensureSuperAdmin } from '../src/bootstrap.js';
await migrate();
console.log((await ensureSuperAdmin()) ? 'Terminé.' : 'Un Super Admin existe déjà : rien à faire. (Pour changer son mot de passe : npm run password:reset)');
await pool.end();
