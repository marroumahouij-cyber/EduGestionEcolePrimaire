import express from 'express';
import { pool, tx } from './db.js';
import { auth, audit, scopeOf, requireRole } from './auth.js';
import { bad, forbidden, notFound, conflict, wrap, newId, validEmail, validPassword, normEmail, hash } from './util.js';
import { notify, notifyMany, logDelivery } from './notify.js';

const ROLE_LABEL = { Administrateur: 'Direction', Enseignant: 'Enseignant', Parent: 'Parent', 'Élève': 'Élève', Comptable: 'Comptable' };
const CREATABLE = ['Parent', 'Élève', 'Comptable', 'Enseignant'];
const fullName = u => `${u.prenom || ''} ${u.nom || ''}`.trim() || u.email;
const userCols = 'id,email,nom,prenom,role,matiere,active,last_login,created_at';

async function recipientsOf(user, db = pool) {
  const s = user.school_id;
  const base = 'SELECT id,email,nom,prenom,role FROM users WHERE school_id=$1 AND deleted_at IS NULL AND active AND role<>\'SuperAdmin\'';
  let rows = [];
  if (user.role === 'Administrateur') rows = (await db.query(base + ' AND id<>$2', [s, user.id])).rows;
  else if (user.role === 'Comptable') rows = (await db.query(base + ` AND role IN ('Administrateur','Parent') AND id<>$2`, [s, user.id])).rows;
  else if (user.role === 'Parent') rows = (await db.query(`${base} AND (role IN ('Administrateur','Comptable') OR id IN (
      SELECT c.enseignant_id FROM classes c JOIN students st ON st.classe_id=c.id AND st.school_id=c.school_id JOIN student_parents sp ON sp.student_id=st.id AND sp.school_id=st.school_id
        WHERE sp.parent_id=$2 AND c.school_id=$1 AND c.deleted_at IS NULL AND st.deleted_at IS NULL AND c.enseignant_id IS NOT NULL
      UNION SELECT ta.teacher_id FROM teacher_assignments ta JOIN students st ON st.classe_id=ta.class_id AND st.school_id=ta.school_id JOIN student_parents sp ON sp.student_id=st.id AND sp.school_id=st.school_id
        WHERE sp.parent_id=$2 AND ta.school_id=$1 AND st.deleted_at IS NULL))`, [s, user.id])).rows;
  else if (user.role === 'Enseignant') rows = (await db.query(`${base} AND (role='Administrateur' OR id IN (
      SELECT sp.parent_id FROM student_parents sp JOIN students st ON st.id=sp.student_id AND st.school_id=sp.school_id
        WHERE sp.school_id=$1 AND st.deleted_at IS NULL AND st.classe_id IN (SELECT id FROM classes WHERE school_id=$1 AND deleted_at IS NULL AND enseignant_id=$2
          UNION SELECT class_id FROM teacher_assignments WHERE school_id=$1 AND teacher_id=$2)))`, [s, user.id])).rows;
  return rows.map(r => ({ id: r.id, email: r.email, role: r.role, label: `${fullName(r)} (${ROLE_LABEL[r.role]})` })).sort((a, b) => a.label.localeCompare(b.label));
}

async function setStudentLinks(db, user, target, body) {
  if (target.role === 'Parent' && Array.isArray(body.student_ids)) {
    const ids = body.student_ids.map(Number).filter(Number.isInteger);
    if (ids.length) { const { rows } = await db.query('SELECT id FROM students WHERE school_id=$1 AND id=ANY($2::int[]) AND deleted_at IS NULL', [user.school_id, ids]); if (rows.length !== new Set(ids).size) throw bad('Élève hors de votre école'); }
    await db.query('DELETE FROM student_parents WHERE school_id=$1 AND parent_id=$2', [user.school_id, target.id]);
    for (const sid of new Set(ids)) await db.query('INSERT INTO student_parents(school_id,student_id,parent_id) VALUES($1,$2,$3)', [user.school_id, sid, target.id]);
  }
  if (target.role === 'Élève' && body.student_id !== undefined) {
    const sid = Number(body.student_id);
    const { rows: [st] } = await db.query('SELECT id,compte_id FROM students WHERE school_id=$1 AND id=$2 AND deleted_at IS NULL', [user.school_id, sid]);
    if (!st) throw bad('Élève hors de votre école');
    if (st.compte_id && st.compte_id !== target.id) throw conflict('Cet élève a déjà un compte');
    await db.query('UPDATE students SET compte_id=NULL WHERE school_id=$1 AND compte_id=$2', [user.school_id, target.id]);
    await db.query('UPDATE students SET compte_id=$3 WHERE school_id=$1 AND id=$2', [user.school_id, sid, target.id]);
  }
}

export function peopleRouter() {
  const r = express.Router();
  r.use(auth);

  // ---------- Enseignants (comptes de rôle Enseignant) ----------
  const teacherRows = async (s, id = null) => (await pool.query(`SELECT ${userCols} FROM users WHERE school_id=$1 AND role='Enseignant' AND deleted_at IS NULL ${id ? 'AND id=$2' : ''} ORDER BY nom,prenom`, id ? [s, id] : [s])).rows;
  r.get('/r/teachers', requireRole('Administrateur'), wrap(async (req, res) => res.json(await teacherRows(req.user.school_id))));
  r.post('/r/teachers', requireRole('Administrateur'), wrap(async (req, res) => {
    const { nom, prenom, email, matiere, password } = req.body || {};
    if (!nom || !validEmail(email) || !validPassword(password)) throw bad('Nom, e-mail valide et mot de passe (12 caractères minimum) obligatoires');
    const id = newId();
    try { await pool.query('INSERT INTO users(id,school_id,email,password_hash,nom,prenom,role,matiere) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id, req.user.school_id, normEmail(email), await hash(password), String(nom).trim(), String(prenom || '').trim(), 'Enseignant', matiere || null]); }
    catch (e) { if (e.code === '23505') throw conflict('E-mail déjà utilisé'); throw e; }
    await audit(req.user, 'create', 'teachers', id, null, { nom, prenom, email, matiere });
    res.status(201).json((await teacherRows(req.user.school_id, id))[0]);
  }));
  r.put('/r/teachers/:id', requireRole('Administrateur'), wrap(async (req, res) => {
    const [old] = await teacherRows(req.user.school_id, req.params.id); if (!old) throw notFound();
    const b = req.body || {}, n = { nom: b.nom ?? old.nom, prenom: b.prenom ?? old.prenom, email: b.email ? normEmail(b.email) : old.email, matiere: b.matiere ?? old.matiere };
    if (!validEmail(n.email) || !n.nom) throw bad('Nom et e-mail valides obligatoires');
    try { await pool.query('UPDATE users SET nom=$3,prenom=$4,email=$5,matiere=$6 WHERE id=$1 AND school_id=$2', [old.id, req.user.school_id, n.nom, n.prenom, n.email, n.matiere]); }
    catch (e) { if (e.code === '23505') throw conflict('E-mail déjà utilisé'); throw e; }
    await audit(req.user, 'update', 'teachers', old.id, { nom: old.nom, prenom: old.prenom, email: old.email, matiere: old.matiere }, n);
    res.json((await teacherRows(req.user.school_id, old.id))[0]);
  }));
  r.delete('/r/teachers/:id', requireRole('Administrateur'), wrap(async (req, res) => {
    const [old] = await teacherRows(req.user.school_id, req.params.id); if (!old) throw notFound();
    const s = req.user.school_id;
    const { rows: [c] } = await pool.query(`SELECT (SELECT count(*) FROM classes WHERE school_id=$1 AND enseignant_id=$2 AND deleted_at IS NULL)::int c,(SELECT count(*) FROM teacher_assignments WHERE school_id=$1 AND teacher_id=$2)::int a,
      (SELECT count(*) FROM schedule WHERE school_id=$1 AND teacher_id=$2 AND deleted_at IS NULL)::int s`, [s, old.id]);
    if (c.c || c.a || c.s) throw conflict('Cet enseignant est titulaire d’une classe, affecté à des matières ou présent dans l’emploi du temps : retirez ces liens d’abord.');
    await pool.query(`UPDATE users SET deleted_at=now(), active=false, email='supprime-'||id||'@supprime.invalid' WHERE id=$1 AND school_id=$2`, [old.id, s]);
    await audit(req.user, 'delete', 'teachers', old.id, { email: old.email }, null);
    res.json({ ok: true });
  }));

  // ---------- Comptes utilisateurs (direction de l'école) ----------
  r.get('/users', wrap(async (req, res) => {
    if (req.user.role !== 'Administrateur') return res.json([]);
    const { rows } = await pool.query(`SELECT u.id,u.email,u.nom,u.prenom,u.role,u.active,u.last_login,
      COALESCE((SELECT json_agg(json_build_object('id',st.id,'label',st.prenom||' '||st.nom) ORDER BY st.nom) FROM student_parents sp JOIN students st ON st.id=sp.student_id AND st.school_id=sp.school_id WHERE sp.parent_id=u.id AND sp.school_id=u.school_id AND st.deleted_at IS NULL),'[]') AS parent_of,
      (SELECT st.prenom||' '||st.nom FROM students st WHERE st.compte_id=u.id AND st.school_id=u.school_id AND st.deleted_at IS NULL LIMIT 1) AS student_label,
      (SELECT st.id FROM students st WHERE st.compte_id=u.id AND st.school_id=u.school_id AND st.deleted_at IS NULL LIMIT 1) AS student_id
      FROM users u WHERE u.school_id=$1 AND u.deleted_at IS NULL ORDER BY u.role,u.nom,u.email`, [req.user.school_id]);
    res.json(rows);
  }));
  r.post('/users', requireRole('Administrateur'), wrap(async (req, res) => {
    const b = req.body || {};
    if (!validEmail(b.email) || !validPassword(b.password) || !CREATABLE.includes(b.role)) throw bad('E-mail, rôle ou mot de passe invalide (12 caractères minimum)');
    const created = await tx(async db => {
      const id = newId();
      try { await db.query('INSERT INTO users(id,school_id,email,password_hash,nom,prenom,role) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, req.user.school_id, normEmail(b.email), await hash(b.password), String(b.nom || '').trim(), String(b.prenom || '').trim(), b.role]); }
      catch (e) { if (e.code === '23505') throw conflict('E-mail déjà utilisé'); throw e; }
      if (b.role === 'Parent' && !(b.student_ids || []).length) throw bad('Associez au moins un élève à ce parent');
      if (b.role === 'Élève' && !b.student_id) throw bad('Choisissez l’élève associé');
      await setStudentLinks(db, req.user, { id, role: b.role }, b);
      await audit(req.user, 'create', 'users', id, null, { email: normEmail(b.email), role: b.role }, db);
      return id;
    });
    res.status(201).json({ id: created, email: normEmail(b.email), role: b.role });
  }));
  const target = async (req, db = pool) => {
    const { rows: [t] } = await db.query('SELECT id,email,role,active,nom,prenom FROM users WHERE id=$1 AND school_id=$2 AND deleted_at IS NULL', [req.params.id, req.user.school_id]);
    if (!t) throw notFound('Compte introuvable');
    if (t.role === 'Administrateur' || t.id === req.user.id) throw forbidden('Les comptes de direction sont gérés par le Super Admin');
    return t;
  };
  r.patch('/users/:id', requireRole('Administrateur'), wrap(async (req, res) => {
    const b = req.body || {};
    await tx(async db => {
      const t = await target(req, db);
      const n = { active: b.active ?? t.active, nom: b.nom ?? t.nom, prenom: b.prenom ?? t.prenom, email: b.email ? normEmail(b.email) : t.email };
      if (!validEmail(n.email)) throw bad('E-mail invalide');
      try { await db.query('UPDATE users SET active=$3,nom=$4,prenom=$5,email=$6 WHERE id=$1 AND school_id=$2', [t.id, req.user.school_id, !!n.active, n.nom, n.prenom, n.email]); }
      catch (e) { if (e.code === '23505') throw conflict('E-mail déjà utilisé'); throw e; }
      await setStudentLinks(db, req.user, t, b);
      await audit(req.user, b.active !== undefined && b.active !== t.active ? (b.active ? 'enable_user' : 'disable_user') : 'update', 'users', t.id, { active: t.active, email: t.email }, { active: !!n.active, email: n.email }, db);
    });
    res.json({ ok: true });
  }));
  r.post('/users/:id/reset-password', requireRole('Administrateur'), wrap(async (req, res) => {
    if (!validPassword(req.body?.password)) throw bad('Mot de passe : 12 caractères minimum');
    const t = await target(req);
    await pool.query('UPDATE users SET password_hash=$3 WHERE id=$1 AND school_id=$2', [t.id, req.user.school_id, await hash(req.body.password)]);
    await audit(req.user, 'reset_password', 'users', t.id);
    res.json({ ok: true });
  }));
  r.delete('/users/:id', requireRole('Administrateur'), wrap(async (req, res) => {
    const t = await target(req);
    await tx(async db => {
      await db.query('UPDATE students SET compte_id=NULL WHERE school_id=$1 AND compte_id=$2', [req.user.school_id, t.id]);
      await db.query('DELETE FROM student_parents WHERE school_id=$1 AND parent_id=$2', [req.user.school_id, t.id]);
      await db.query(`UPDATE users SET deleted_at=now(), active=false, email='supprime-'||id||'@supprime.invalid' WHERE id=$1 AND school_id=$2`, [t.id, req.user.school_id]);
      await audit(req.user, 'delete', 'users', t.id, { email: t.email, role: t.role }, null, db);
    });
    res.json({ ok: true });
  }));
  r.post('/password', wrap(async (req, res) => {
    const { old_password, new_password } = req.body || {};
    const bcrypt = (await import('bcryptjs')).default;
    if (typeof old_password !== 'string' || !validPassword(new_password)) throw bad('Nouveau mot de passe invalide (12 caractères minimum)');
    if (old_password === new_password) throw bad('Choisissez un mot de passe différent');
    if (req.user.impersonated) throw forbidden('Changez votre mot de passe depuis votre compte Super Admin');
    if (!await bcrypt.compare(old_password, req.user.password_hash)) throw forbidden('Mot de passe actuel incorrect');
    await pool.query('UPDATE users SET password_hash=$2 WHERE id=$1', [req.user.id, await hash(new_password)]);
    await audit(req.user, 'change_password', 'users', req.user.id);
    res.json({ ok: true, relogin: true });
  }));

  // ---------- Messagerie ----------
  r.get('/recipients', wrap(async (req, res) => res.json(await recipientsOf(req.user))));

  const MSG = `SELECT m.id,m.objet,m.corps,m.statut,m.created_at,m.sent_at,m.lu,m.hidden_by_recipient,m.sender_id,m.recipient_id,m.student_id,
    (SELECT trim(prenom||' '||nom) FROM users u WHERE u.id=m.sender_id AND u.school_id=m.school_id) AS sender_label,
    (SELECT trim(prenom||' '||nom) FROM users u WHERE u.id=m.recipient_id AND u.school_id=m.school_id) AS recipient_label FROM messages m WHERE m.school_id=$1`;
  r.get('/messages', wrap(async (req, res) => {
    const box = req.query.box || 'inbox', u = req.user;
    const f = box === 'sent' ? ` AND m.sender_id=$2 AND m.statut='envoye' ORDER BY m.sent_at DESC` : box === 'drafts' ? ` AND m.sender_id=$2 AND m.statut='brouillon' ORDER BY m.created_at DESC`
      : ` AND m.recipient_id=$2 AND m.statut='envoye' AND NOT m.hidden_by_recipient ORDER BY m.sent_at DESC`;
    res.json((await pool.query(MSG + f, [u.school_id, u.id])).rows);
  }));
  const loadMsg = async (req, db = pool) => {
    const id = Number(req.params.id); if (!Number.isInteger(id)) throw notFound();
    const { rows: [m] } = await db.query(MSG + ' AND m.id=$2 AND (m.sender_id=$3 OR (m.recipient_id=$3 AND m.statut=\'envoye\'))', [req.user.school_id, id, req.user.id]);
    if (!m) throw notFound('Message introuvable'); return m;
  };
  async function checkRecipient(user, rid) {
    if (!(await recipientsOf(user)).some(x => x.id === rid)) throw forbidden('Vous ne pouvez pas écrire à ce destinataire');
  }
  async function dispatch(db, user, id, objet) {
    const { rows: [m] } = await db.query(`UPDATE messages SET statut='envoye', sent_at=now() WHERE id=$1 AND school_id=$2 AND sender_id=$3 AND statut='brouillon' RETURNING recipient_id`, [id, user.school_id, user.id]);
    if (!m) throw conflict('Message déjà envoyé');
    await notify(db, user.school_id, m.recipient_id, 'Nouveau message', objet, '/messages');
    await logDelivery(db, user.school_id, m.recipient_id, 'messagerie', objet, 'envoye', `message #${id}`);
  }
  r.post('/messages', requireRole('Administrateur', 'Enseignant', 'Parent', 'Comptable'), wrap(async (req, res) => {
    const b = req.body || {}, u = req.user;
    if (!b.recipient_id || !String(b.objet || '').trim() || !String(b.corps || '').trim()) throw bad('Destinataire, objet et message obligatoires');
    if (String(b.objet).length > 200 || String(b.corps).length > 10000) throw bad('Message trop long');
    await checkRecipient(u, b.recipient_id);
    const id = await tx(async db => {
      const { rows: [m] } = await db.query(`INSERT INTO messages(school_id,sender_id,recipient_id,objet,corps,statut) VALUES($1,$2,$3,$4,$5,'brouillon') RETURNING id`, [u.school_id, u.id, b.recipient_id, String(b.objet).trim(), String(b.corps).trim()]);
      if (!b.draft) await dispatch(db, u, m.id, String(b.objet).trim());
      await audit(u, b.draft ? 'draft' : 'send', 'messages', m.id, null, { to: b.recipient_id }, db);
      return m.id;
    });
    res.status(201).json({ id, statut: b.draft ? 'brouillon' : 'envoye' });
  }));
  r.put('/messages/:id', wrap(async (req, res) => {
    const m = await loadMsg(req); const b = req.body || {};
    if (m.sender_id !== req.user.id) throw forbidden();
    if (m.statut !== 'brouillon') throw conflict('Un message envoyé est immuable : il ne peut plus être modifié.');
    const n = { recipient_id: b.recipient_id ?? m.recipient_id, objet: String(b.objet ?? m.objet).trim(), corps: String(b.corps ?? m.corps).trim() };
    if (!n.objet || !n.corps) throw bad('Objet et message obligatoires');
    await checkRecipient(req.user, n.recipient_id);
    await tx(async db => {
      await db.query('UPDATE messages SET recipient_id=$3,objet=$4,corps=$5 WHERE id=$1 AND school_id=$2', [m.id, req.user.school_id, n.recipient_id, n.objet, n.corps]);
      if (b.send) await dispatch(db, req.user, m.id, n.objet);
      await audit(req.user, b.send ? 'send' : 'update_draft', 'messages', m.id, null, null, db);
    });
    res.json({ ok: true });
  }));
  r.delete('/messages/:id', wrap(async (req, res) => {
    const m = await loadMsg(req);
    if (m.sender_id !== req.user.id) throw forbidden('Vous pouvez seulement masquer un message reçu');
    if (m.statut !== 'brouillon') throw conflict('Un message envoyé est immuable : il ne peut pas être supprimé.');
    await pool.query('DELETE FROM messages WHERE id=$1 AND school_id=$2', [m.id, req.user.school_id]);
    await audit(req.user, 'delete_draft', 'messages', m.id);
    res.json({ ok: true });
  }));
  r.post('/messages/:id/hide', wrap(async (req, res) => { // suppression logique côté destinataire uniquement
    const m = await loadMsg(req); if (m.recipient_id !== req.user.id) throw forbidden('Seul le destinataire peut masquer ce message');
    await pool.query('UPDATE messages SET hidden_by_recipient=true WHERE id=$1 AND school_id=$2', [m.id, req.user.school_id]); res.json({ ok: true });
  }));
  r.post('/messages/:id/unread', wrap(async (req, res) => {
    const m = await loadMsg(req); if (m.recipient_id !== req.user.id) throw forbidden();
    await pool.query('UPDATE messages SET lu=false WHERE id=$1 AND school_id=$2', [m.id, req.user.school_id]); res.json({ ok: true });
  }));
  r.get('/messages/:id', wrap(async (req, res) => {
    const m = await loadMsg(req);
    if (m.recipient_id === req.user.id && !m.lu) await pool.query('UPDATE messages SET lu=true WHERE id=$1 AND school_id=$2', [m.id, req.user.school_id]);
    await audit(req.user, 'read_message', 'messages', m.id); // journalisation des accès à l'historique
    const other = m.sender_id === req.user.id ? m.recipient_id : m.sender_id;
    const thread = (await pool.query(MSG + ` AND m.statut='envoye' AND ((m.sender_id=$2 AND m.recipient_id=$3) OR (m.sender_id=$3 AND m.recipient_id=$2)) ORDER BY m.sent_at`, [req.user.school_id, req.user.id, other])).rows;
    res.json({ message: { ...m, lu: true }, thread });
  }));

  // ---------- Annonces (immuables) ----------
  r.get('/announcements', wrap(async (req, res) => {
    const aud = { Parent: 'parents', Enseignant: 'enseignants', 'Élève': 'eleves' }[req.user.role];
    const { rows } = await pool.query(`SELECT a.id,a.titre,a.corps,a.audience,a.created_at,(SELECT trim(prenom||' '||nom) FROM users u WHERE u.id=a.author_id AND u.school_id=a.school_id) AS author_label
      FROM announcements a WHERE a.school_id=$1 AND ($2::text IS NULL AND $3 OR a.audience='tous' OR a.audience=$2) ORDER BY a.created_at DESC LIMIT 100`, [req.user.school_id, aud ?? null, req.user.role === 'Administrateur']);
    res.json(rows);
  }));
  r.post('/announcements', requireRole('Administrateur'), wrap(async (req, res) => {
    const b = req.body || {};
    if (!String(b.titre || '').trim() || !String(b.corps || '').trim() || !['tous', 'parents', 'enseignants', 'eleves'].includes(b.audience || 'tous')) throw bad('Titre, texte et audience valides obligatoires');
    const row = await tx(async db => {
      const { rows: [a] } = await db.query('INSERT INTO announcements(school_id,author_id,titre,corps,audience) VALUES($1,$2,$3,$4,$5) RETURNING *', [req.user.school_id, req.user.id, b.titre.trim(), b.corps.trim(), b.audience || 'tous']);
      const roleOf = { tous: ['Enseignant', 'Parent', 'Élève', 'Comptable'], parents: ['Parent'], enseignants: ['Enseignant'], eleves: ['Élève'] }[a.audience];
      const ids = (await db.query('SELECT id FROM users WHERE school_id=$1 AND deleted_at IS NULL AND active AND role=ANY($2)', [req.user.school_id, roleOf])).rows.map(x => x.id);
      await notifyMany(db, req.user.school_id, ids, 'Annonce : ' + a.titre, a.corps.slice(0, 140), '/announcements');
      await audit(req.user, 'publish', 'announcements', a.id, null, { titre: a.titre, audience: a.audience }, db);
      return a;
    });
    res.status(201).json(row);
  }));
  r.all('/announcements/:id', (req, res, next) => next(conflict('Une annonce publiée est immuable : publiez une annonce corrective.')));

  // ---------- Notifications ----------
  r.get('/notifications', wrap(async (req, res) => {
    const { rows } = await pool.query('SELECT id,titre,corps,lien,lu,created_at FROM notifications WHERE school_id=$1 AND user_id=$2 ORDER BY created_at DESC,id DESC LIMIT 40', [req.user.school_id, req.user.id]);
    res.json({ items: rows, unread: rows.filter(x => !x.lu).length });
  }));
  r.post('/notifications/read', wrap(async (req, res) => {
    await pool.query('UPDATE notifications SET lu=true WHERE school_id=$1 AND user_id=$2 AND ($3::int IS NULL OR id=$3)', [req.user.school_id, req.user.id, req.body?.id ?? null]); res.json({ ok: true });
  }));
  return r;
}
export { recipientsOf };
