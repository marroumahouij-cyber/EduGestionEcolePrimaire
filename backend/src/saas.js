import express from 'express';
import { pool, tx } from './db.js';
import { auth, audit, signToken, superAdminOnly } from './auth.js';
import { bad, notFound, conflict, wrap, newId, validEmail, validPassword, normEmail, hash, slugify } from './util.js';

const STATUS = ['trial', 'active', 'suspended', 'archived'];
const DEFAULT_SUBJECTS = [['Arabe', 3], ['Français', 3], ['Mathématiques', 3], ['Éveil scientifique', 2], ['Anglais', 1], ['Éducation civique', 1]];

const LIST = `SELECT s.*,
  (SELECT count(*)::int FROM users u WHERE u.school_id=s.id AND u.deleted_at IS NULL) AS user_count,
  (SELECT count(*)::int FROM students st WHERE st.school_id=s.id AND st.deleted_at IS NULL) AS student_count,
  (SELECT count(*)::int FROM classes c WHERE c.school_id=s.id AND c.deleted_at IS NULL) AS class_count,
  (SELECT count(*)::int FROM users u WHERE u.school_id=s.id AND u.role='Enseignant' AND u.deleted_at IS NULL) AS teacher_count,
  COALESCE((SELECT json_agg(json_build_object('id',u.id,'email',u.email,'nom',u.nom,'prenom',u.prenom,'active',u.active,'last_login',u.last_login) ORDER BY u.created_at) FROM users u WHERE u.school_id=s.id AND u.role='Administrateur' AND u.deleted_at IS NULL),'[]') AS admins
  FROM schools s`;

async function uniqueSlug(db, base) {
  let slug = base, i = 1;
  while ((await db.query('SELECT 1 FROM schools WHERE slug=$1', [slug])).rowCount) slug = `${base}-${++i}`;
  return slug;
}
const cleanStr = (v, max) => { const s = String(v ?? '').trim(); if (s.length > max) throw bad(`Texte trop long (max ${max})`); return s || null; };
const dateOrNull = v => { if (v === undefined || v === null || v === '') return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad('Date de fin d’abonnement invalide'); return v; };

export function saasRouter() {
  const r = express.Router();
  r.use(auth, superAdminOnly);

  r.get('/schools', wrap(async (req, res) => {
    const q = `%${String(req.query.q || '').trim().toLowerCase()}%`, st = STATUS.includes(req.query.status) ? req.query.status : null;
    res.json((await pool.query(`${LIST} WHERE (lower(s.name) LIKE $1 OR lower(s.slug) LIKE $1 OR lower(COALESCE(s.email,'')) LIKE $1) AND ($2::text IS NULL OR s.status=$2) ORDER BY s.id`, [q, st])).rows);
  }));

  r.post('/schools', wrap(async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (name.length < 3 || name.length > 200) throw bad('Nom de l’école : 3 à 200 caractères');
    if (!validEmail(b.admin_email)) throw bad('E-mail de l’administrateur invalide');
    if (!validPassword(b.admin_password)) throw bad('Mot de passe initial : 12 caractères minimum');
    if (b.email && !validEmail(b.email)) throw bad('E-mail de l’école invalide');
    const status = b.status || 'active'; if (!STATUS.includes(status) || status === 'archived') throw bad('Statut invalide');
    const plan = ['basic', 'pro'].includes(b.plan || 'basic') ? (b.plan || 'basic') : (() => { throw bad('Formule invalide'); })();
    const out = await tx(async db => {
      const slug = await uniqueSlug(db, slugify(b.slug || name));
      const { rows: [s] } = await db.query('INSERT INTO schools(name,slug,address,email,phone,status,plan,subscription_end,annee_scolaire,tarif_annuel) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
        [name, slug, cleanStr(b.address, 300), cleanStr(b.email, 254), cleanStr(b.phone, 40), status, plan, dateOrNull(b.subscription_end), b.annee_scolaire || '2026-2027', Number(b.tarif_annuel) >= 0 ? Number(b.tarif_annuel) : 0]);
      const uid = newId();
      try { await db.query('INSERT INTO users(id,school_id,email,password_hash,nom,prenom,role) VALUES($1,$2,$3,$4,$5,$6,$7)', [uid, s.id, normEmail(b.admin_email), await hash(b.admin_password), cleanStr(b.admin_nom, 100) || 'Direction', cleanStr(b.admin_prenom, 100) || '', 'Administrateur']); }
      catch (e) { if (e.code === '23505') throw conflict('Cet e-mail est déjà utilisé'); throw e; }
      for (const [nom, coef] of DEFAULT_SUBJECTS) await db.query('INSERT INTO subjects(school_id,nom,coefficient) VALUES($1,$2,$3)', [s.id, nom, coef]); // configuration initiale
      await audit({ ...req.user, school_id: s.id }, 'create_school', 'schools', s.id, null, { name, slug, admin: normEmail(b.admin_email) }, db);
      return { id: s.id, name, slug, admin_email: normEmail(b.admin_email) };
    });
    res.status(201).json(out);
  }));

  r.get('/schools/:id', wrap(async (req, res) => {
    const { rows: [s] } = await pool.query(`${LIST} WHERE s.id=$1`, [Number(req.params.id)]); if (!s) throw notFound('École introuvable'); res.json(s);
  }));

  r.patch('/schools/:id', wrap(async (req, res) => {
    const id = Number(req.params.id), b = req.body || {};
    const { rows: [old] } = await pool.query('SELECT * FROM schools WHERE id=$1', [id]); if (!old) throw notFound('École introuvable');
    const n = {
      name: b.name !== undefined ? String(b.name).trim() : old.name, address: b.address !== undefined ? cleanStr(b.address, 300) : old.address, email: b.email !== undefined ? cleanStr(b.email, 254) : old.email,
      phone: b.phone !== undefined ? cleanStr(b.phone, 40) : old.phone, status: b.status ?? old.status, plan: b.plan ?? old.plan, subscription_end: b.subscription_end !== undefined ? dateOrNull(b.subscription_end) : old.subscription_end
    };
    if (n.name.length < 3 || n.name.length > 200) throw bad('Nom de l’école : 3 à 200 caractères');
    if (n.email && !validEmail(n.email)) throw bad('E-mail invalide');
    if (!STATUS.includes(n.status) || !['basic', 'pro'].includes(n.plan)) throw bad('Statut ou formule invalide');
    await pool.query('UPDATE schools SET name=$2,address=$3,email=$4,phone=$5,status=$6::varchar,plan=$7,subscription_end=$8,archived_at=CASE WHEN $6::varchar=\'archived\' THEN COALESCE(archived_at,now()) ELSE NULL END WHERE id=$1', [id, n.name, n.address, n.email, n.phone, n.status, n.plan, n.subscription_end]);
    await audit({ ...req.user, school_id: id }, 'update_school', 'schools', id, { name: old.name, status: old.status, plan: old.plan }, { name: n.name, status: n.status, plan: n.plan });
    res.json((await pool.query(`${LIST} WHERE s.id=$1`, [id])).rows[0]);
  }));

  // Entrer dans une école : jeton "Super Admin agissant comme Administrateur de l'école", audité
  r.post('/schools/:id/enter', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const { rows: [s] } = await pool.query('SELECT id,name,status FROM schools WHERE id=$1', [id]); if (!s) throw notFound('École introuvable');
    await audit({ ...req.user, school_id: id }, 'enter_school', 'schools', id);
    res.json({ token: signToken(req.user, id), school: { id: s.id, name: s.name } });
  }));

  r.post('/schools/:id/admins', wrap(async (req, res) => {
    const id = Number(req.params.id), b = req.body || {};
    if (!(await pool.query('SELECT 1 FROM schools WHERE id=$1', [id])).rowCount) throw notFound('École introuvable');
    if (!validEmail(b.email) || !validPassword(b.password)) throw bad('E-mail valide et mot de passe de 12 caractères minimum obligatoires');
    const uid = newId();
    try { await pool.query('INSERT INTO users(id,school_id,email,password_hash,nom,prenom,role) VALUES($1,$2,$3,$4,$5,$6,$7)', [uid, id, normEmail(b.email), await hash(b.password), cleanStr(b.nom, 100) || 'Direction', cleanStr(b.prenom, 100) || '', 'Administrateur']); }
    catch (e) { if (e.code === '23505') throw conflict('Cet e-mail est déjà utilisé'); throw e; }
    await audit({ ...req.user, school_id: id }, 'create_admin', 'users', uid, null, { email: normEmail(b.email) });
    res.status(201).json({ id: uid });
  }));
  const adminOf = async (req) => {
    const { rows: [u] } = await pool.query(`SELECT id,email FROM users WHERE id=$1 AND school_id=$2 AND role='Administrateur' AND deleted_at IS NULL`, [req.params.uid, Number(req.params.id)]);
    if (!u) throw notFound('Administrateur introuvable'); return u;
  };
  r.post('/schools/:id/admins/:uid/reset-password', wrap(async (req, res) => {
    if (!validPassword(req.body?.password)) throw bad('Mot de passe : 12 caractères minimum');
    const u = await adminOf(req);
    await pool.query('UPDATE users SET password_hash=$2 WHERE id=$1', [u.id, await hash(req.body.password)]);
    await audit({ ...req.user, school_id: Number(req.params.id) }, 'reset_password', 'users', u.id);
    res.json({ ok: true });
  }));
  r.patch('/schools/:id/admins/:uid', wrap(async (req, res) => {
    const u = await adminOf(req); const active = !!req.body?.active;
    if (!active && (await pool.query(`SELECT count(*)::int n FROM users WHERE school_id=$1 AND role='Administrateur' AND active AND deleted_at IS NULL`, [Number(req.params.id)])).rows[0].n <= 1) throw conflict('Impossible de désactiver le dernier administrateur actif de l’école');
    await pool.query('UPDATE users SET active=$2 WHERE id=$1', [u.id, active]);
    await audit({ ...req.user, school_id: Number(req.params.id) }, active ? 'enable_user' : 'disable_user', 'users', u.id);
    res.json({ ok: true });
  }));

  // Suppression définitive : l'école doit d'abord être archivée, et son nom exact doit être retapé.
  r.delete('/schools/:id', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const { rows: [s] } = await pool.query('SELECT id,name,status FROM schools WHERE id=$1', [id]); if (!s) throw notFound('École introuvable');
    if (s.status !== 'archived') throw conflict('Archivez d’abord l’école avant de la supprimer définitivement.');
    if (req.body?.confirm_name !== s.name) throw bad('Le nom saisi ne correspond pas : suppression refusée.');
    await tx(async db => {
      await audit({ ...req.user, school_id: null }, 'delete_school', 'schools', id, { name: s.name }, null, db);
      await db.query('DELETE FROM schools WHERE id=$1', [id]); // ON DELETE CASCADE : toutes les données de l'école
    });
    res.json({ ok: true });
  }));

  r.get('/audit', wrap(async (req, res) => res.json((await pool.query(`SELECT a.id,a.school_id,(SELECT name FROM schools s WHERE s.id=a.school_id) AS school_name,a.actor_email,a.action,a.entity,a.entity_id,a.at FROM audit_log a
    WHERE a.action IN ('create_school','update_school','enter_school','delete_school','create_admin','reset_password','disable_user','enable_user','login') ORDER BY a.id DESC LIMIT 200`)).rows)));
  return r;
}
