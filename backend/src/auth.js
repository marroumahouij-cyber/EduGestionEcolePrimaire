import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { pool } from './db.js';
import { HttpError, forbidden, validEmail, normEmail, wrap, bad } from './util.js';

const secret = () => process.env.JWT_SECRET;
// Empreinte du mot de passe : changer/réinitialiser le mot de passe invalide toutes les sessions ouvertes.
const ver = h => crypto.createHash('sha256').update(h).digest('hex').slice(0, 12);

export function signToken(user, ctxSchoolId = null) {
  const p = { sub: user.id, v: ver(user.password_hash) };
  if (ctxSchoolId) p.ctx = ctxSchoolId; // contexte "Super Admin dans l'école X"
  return jwt.sign(p, secret(), { expiresIn: '4h', algorithm: 'HS256' });
}

const schoolOpen = s => s && ['active', 'trial'].includes(s.status) && !(s.subscription_end && new Date(s.subscription_end) < new Date(new Date().toDateString()));

// Vérifie le compte À CHAQUE requête : jamais de confiance au rôle ou à l'école venant du navigateur.
export async function auth(req, res, next) {
  try {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new HttpError(401, 'Connexion nécessaire');
    let d;
    try { d = jwt.verify(token, secret(), { algorithms: ['HS256'] }); } catch { throw new HttpError(401, 'Session expirée ou invalide'); }
    const { rows: [u] } = await pool.query(
      `SELECT u.*, s.status AS school_status, s.subscription_end, s.name AS school_name FROM users u LEFT JOIN schools s ON s.id=u.school_id
       WHERE u.id=$1 AND u.deleted_at IS NULL`, [d.sub]);
    if (!u || !u.active || ver(u.password_hash) !== d.v) throw new HttpError(401, 'Session expirée ou invalide');
    if (u.role === 'SuperAdmin') {
      if (d.ctx) { // audit : le Super Admin agit comme Administrateur de l'école choisie
        const { rows: [s] } = await pool.query('SELECT id,name FROM schools WHERE id=$1', [d.ctx]);
        if (!s) throw new HttpError(401, 'École introuvable');
        req.user = { ...u, real_role: 'SuperAdmin', role: 'Administrateur', school_id: s.id, school_name: s.name, impersonated: true };
      } else req.user = { ...u, real_role: 'SuperAdmin' };
    } else {
      if (!schoolOpen({ status: u.school_status, subscription_end: u.subscription_end })) throw new HttpError(403, 'École suspendue, archivée ou abonnement expiré');
      req.user = { ...u, real_role: u.role };
    }
    next();
  } catch (e) { next(e); }
}

export const requireRole = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : next(forbidden());
export const superAdminOnly = (req, res, next) => (req.user.real_role === 'SuperAdmin' && !req.user.impersonated) ? next() : next(forbidden('Réservé au Super Admin'));

export async function audit(user, action, entity, entityId, oldValues = null, newValues = null, db = pool) {
  await db.query(
    'INSERT INTO audit_log(school_id,actor_id,actor_email,impersonated,action,entity,entity_id,old_values,new_values) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [user.school_id ?? null, user.id, user.email, !!user.impersonated, action, entity, entityId == null ? null : String(entityId), oldValues, newValues]);
}

// Périmètre de données de l'utilisateur dans son école (null = tout)
export async function scopeOf(u) {
  const s = u.school_id;
  if (['Administrateur', 'Comptable'].includes(u.role)) return { all: true, studentIds: null, classIds: null };
  let classIds = [], studentIds = [];
  if (u.role === 'Enseignant') {
    classIds = (await pool.query(
      `SELECT id FROM classes WHERE school_id=$1 AND deleted_at IS NULL AND (enseignant_id=$2 OR id IN (SELECT class_id FROM teacher_assignments WHERE school_id=$1 AND teacher_id=$2))`, [s, u.id])).rows.map(r => r.id);
    studentIds = (await pool.query('SELECT id FROM students WHERE school_id=$1 AND deleted_at IS NULL AND classe_id=ANY($2::int[])', [s, classIds])).rows.map(r => r.id);
  } else if (u.role === 'Parent') {
    const r = (await pool.query(`SELECT st.id, st.classe_id FROM student_parents sp JOIN students st ON st.id=sp.student_id AND st.school_id=sp.school_id
      WHERE sp.school_id=$1 AND sp.parent_id=$2 AND st.deleted_at IS NULL`, [s, u.id])).rows;
    studentIds = r.map(x => x.id); classIds = [...new Set(r.map(x => x.classe_id).filter(Boolean))];
  } else if (u.role === 'Élève') {
    const r = (await pool.query('SELECT id, classe_id FROM students WHERE school_id=$1 AND compte_id=$2 AND deleted_at IS NULL', [s, u.id])).rows;
    studentIds = r.map(x => x.id); classIds = r.map(x => x.classe_id).filter(Boolean);
  }
  return { all: false, studentIds, classIds };
}

export const loginRouter = (express, rateLimit) => {
  const r = express.Router();
  r.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.LOGIN_RATE_LIMIT || 30), standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Trop de tentatives, réessayez plus tard' } }), wrap(async (req, res) => {
    const { email, password } = req.body || {};
    if (!validEmail(email) || typeof password !== 'string') throw bad('Identifiants invalides');
    const { rows: [u] } = await pool.query(
      `SELECT u.*, s.status AS school_status, s.subscription_end FROM users u LEFT JOIN schools s ON s.id=u.school_id WHERE lower(u.email)=$1 AND u.deleted_at IS NULL`, [normEmail(email)]);
    // comparaison faite même si le compte n'existe pas (temps de réponse constant)
    const ok = await bcrypt.compare(password, u?.password_hash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
    if (!u || !ok) throw new HttpError(401, 'E-mail ou mot de passe incorrect');
    if (!u.active) throw new HttpError(403, 'Ce compte est désactivé. Contactez la direction.');
    if (u.role !== 'SuperAdmin' && !schoolOpen({ status: u.school_status, subscription_end: u.subscription_end })) throw new HttpError(403, 'École suspendue, archivée ou abonnement expiré');
    await pool.query('UPDATE users SET last_login=now() WHERE id=$1', [u.id]);
    await audit({ id: u.id, email: u.email, school_id: u.school_id }, 'login', 'users', u.id);
    res.json({ token: signToken(u), user: { id: u.id, email: u.email, role: u.role, school_id: u.school_id } });
  }));
  return r;
};
