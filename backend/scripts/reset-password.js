// Usage : npm run password:reset -- adresse@exemple.com "NouveauMotDePasse12+"
// Réinitialise le mot de passe de N'IMPORTE quel compte (utile si le Super Admin a oublié le sien).
import 'dotenv/config';
import { pool } from '../src/db.js';
import { hash, validPassword, normEmail } from '../src/util.js';
const [email, password] = process.argv.slice(2);
if (!email || !validPassword(password)) { console.error('Usage : npm run password:reset -- email "motdepasse (12 caractères minimum)"'); process.exit(1); }
const r = await pool.query('UPDATE users SET password_hash=$2, active=true WHERE lower(email)=$1 AND deleted_at IS NULL', [normEmail(email), await hash(password)]);
console.log(r.rowCount ? 'Mot de passe modifié (les sessions ouvertes sont invalidées).' : 'Aucun compte avec cet e-mail.');
await pool.end();
