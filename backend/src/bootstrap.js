import { pool } from './db.js';
import { newId, validEmail, validPassword, normEmail, hash } from './util.js';

// Crée le compte Super Admin s'il n'existe pas encore (e-mail et mot de passe lus dans l'environnement).
export async function ensureSuperAdmin(log = console.log) {
  const email = process.env.SUPERADMIN_EMAIL, password = process.env.SUPERADMIN_PASSWORD;
  const { rows: [n] } = await pool.query(`SELECT count(*)::int n FROM users WHERE role='SuperAdmin' AND deleted_at IS NULL`);
  if (n.n > 0) return false;
  if (!validEmail(email) || !validPassword(password)) throw new Error('Aucun Super Admin en base : définissez SUPERADMIN_EMAIL et SUPERADMIN_PASSWORD (12 caractères minimum) dans backend/.env');
  await pool.query(`INSERT INTO users(id,email,password_hash,nom,prenom,role) VALUES($1,$2,$3,'Propriétaire','Plateforme','SuperAdmin')`, [newId(), normEmail(email), await hash(password)]);
  log(`Super Admin créé : ${normEmail(email)}`);
  return true;
}
