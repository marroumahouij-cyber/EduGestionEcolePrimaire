import express from 'express';
import { pool, tx } from './db.js';
import { auth, audit, scopeOf } from './auth.js';
import { bad, forbidden, notFound, conflict, wrap, today, money, MODES } from './util.js';
import { notifyMany, notify, parentsOfStudent, usersOfClass, logDelivery, balanceOf } from './notify.js';

const ALL = ['Administrateur', 'Enseignant', 'Parent', 'Élève', 'Comptable'];
const ADMIN = ['Administrateur'];
const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const lbl = {
  student: sid => `(SELECT s.prenom||' '||s.nom FROM students s WHERE s.id=${sid} AND s.school_id=t.school_id)`,
  cls: cid => `(SELECT c.niveau||' '||c.section FROM classes c WHERE c.id=${cid} AND c.school_id=t.school_id)`,
  subj: x => `(SELECT s.nom FROM subjects s WHERE s.id=${x} AND s.school_id=t.school_id)`,
  user: x => `(SELECT trim(u.prenom||' '||u.nom) FROM users u WHERE u.id=${x} AND u.school_id=t.school_id)`
};

// Filtre de périmètre : retourne [sql, paramètre] ou null (= pas de filtre) ou false (= rien de visible)
const by = (key, col) => (sc) => sc.all ? null : [`t.${col}=ANY($N::int[])`, key === 'student' ? sc.studentIds : sc.classIds];

export const RES = {
  students: {
    table: 'students', read: ALL, write: ['Administrateur', 'Comptable'], scope: by('student', 'id'),
    select: `t.*, ${lbl.cls('t.classe_id')} AS classe_label`,
    fields: { nom: { t: 'text', req: 1, max: 100 }, prenom: { t: 'text', req: 1, max: 100 }, date_naissance: { t: 'date' }, parent_label: { t: 'text', max: 150 }, medical: { t: 'text', max: 2000 },
      classe_id: { t: 'ref', table: 'classes' }, annee_scolaire: { t: 'text', max: 9 }, statut: { t: 'enum', v: ['preinscrit', 'inscrit'] } },
    async before({ data, old, db, user }) {
      if (data.classe_id) {
        const { rows: [c] } = await db.query('SELECT capacite, (SELECT count(*)::int FROM students s WHERE s.school_id=c.school_id AND s.classe_id=c.id AND s.deleted_at IS NULL AND s.id<>COALESCE($3,0)) AS n FROM classes c WHERE c.id=$1 AND c.school_id=$2', [data.classe_id, user.school_id, old?.id ?? null]);
        if (c.n >= c.capacite) throw conflict('Cette classe est complète (capacité atteinte)');
      }
    },
    async guard(row, db, user) {
      const { rows: [r] } = await db.query(`SELECT (SELECT count(*) FROM grades WHERE school_id=$1 AND student_id=$2 AND deleted_at IS NULL)::int g,(SELECT count(*) FROM payments WHERE school_id=$1 AND student_id=$2 AND deleted_at IS NULL)::int p`, [user.school_id, row.id]);
      return r.g || r.p ? { force: true, msg: 'Cet élève a des notes ou des paiements. La suppression est logique (l’historique est conservé) et demande une confirmation explicite.' } : null;
    }
  },
  classes: {
    table: 'classes', read: ALL, write: ADMIN, scope: by('class', 'id'),
    select: `t.*, t.niveau||' '||t.section AS label, ${lbl.user('t.enseignant_id')} AS enseignant_label, (SELECT count(*)::int FROM students s WHERE s.school_id=t.school_id AND s.classe_id=t.id AND s.deleted_at IS NULL) AS effectif`,
    fields: { niveau: { t: 'text', req: 1, max: 30 }, section: { t: 'text', req: 1, max: 10 }, capacite: { t: 'int', req: 1, min: 1, max: 100 },
      enseignant_id: { t: 'ref', table: 'users', role: 'Enseignant' }, annee_scolaire: { t: 'text', max: 9 } },
    async before({ data, old, db, user }) {
      if (old && data.capacite != null) {
        const { rows: [r] } = await db.query('SELECT count(*)::int n FROM students WHERE school_id=$1 AND classe_id=$2 AND deleted_at IS NULL', [user.school_id, old.id]);
        if (data.capacite < r.n) throw bad(`La capacité (${data.capacite}) est inférieure au nombre d’élèves inscrits (${r.n})`);
      }
    },
    async guard(row, db, user) {
      const q = async s => (await db.query(s, [user.school_id, row.id])).rows[0].n;
      if (await q('SELECT count(*)::int n FROM students WHERE school_id=$1 AND classe_id=$2 AND deleted_at IS NULL')) return { block: 'Cette classe contient des élèves : réaffectez-les avant de la supprimer.' };
      if (await q('SELECT count(*)::int n FROM schedule WHERE school_id=$1 AND class_id=$2 AND deleted_at IS NULL') || await q('SELECT count(*)::int n FROM homework WHERE school_id=$1 AND class_id=$2 AND deleted_at IS NULL')) return { block: 'Cette classe est utilisée dans l’emploi du temps ou les devoirs.' };
      await db.query('DELETE FROM teacher_assignments WHERE school_id=$1 AND class_id=$2', [user.school_id, row.id]);
    }
  },
  subjects: {
    table: 'subjects', read: ALL, write: ADMIN, scope: () => null,
    fields: { nom: { t: 'text', req: 1, max: 100 }, coefficient: { t: 'num', req: 1, min: 0.1, max: 20 }, niveau: { t: 'text', max: 30 } },
    async guard(row, db, user) {
      const { rows: [r] } = await db.query(`SELECT (SELECT count(*) FROM grades WHERE school_id=$1 AND subject_id=$2 AND deleted_at IS NULL)::int g,(SELECT count(*) FROM teacher_assignments WHERE school_id=$1 AND subject_id=$2)::int a,
        (SELECT count(*) FROM schedule WHERE school_id=$1 AND subject_id=$2 AND deleted_at IS NULL)::int s,(SELECT count(*) FROM homework WHERE school_id=$1 AND subject_id=$2 AND deleted_at IS NULL)::int h`, [user.school_id, row.id]);
      if (r.g || r.a || r.s || r.h) return { block: 'Cette matière est utilisée (notes, affectations enseignant, emploi du temps ou devoirs).' };
    }
  },
  rooms: {
    table: 'rooms', read: ['Administrateur', 'Enseignant'], write: ADMIN, scope: () => null,
    fields: { nom: { t: 'text', req: 1, max: 100 }, capacite: { t: 'int', req: 1, min: 1, max: 500 }, disponible: { t: 'bool' } },
    async guard(row, db, user) {
      const { rows: [r] } = await db.query('SELECT count(*)::int n FROM schedule WHERE school_id=$1 AND room_id=$2 AND deleted_at IS NULL', [user.school_id, row.id]);
      if (r.n) return { block: 'Cette salle est utilisée dans l’emploi du temps.' };
    }
  },
  assignments: {
    table: 'teacher_assignments', soft: false, read: ['Administrateur', 'Enseignant'], write: ADMIN,
    scope: (sc, u) => u.role === 'Administrateur' ? null : ['t.teacher_id=$N', u.id],
    select: `t.*, ${lbl.user('t.teacher_id')} AS teacher_label, ${lbl.subj('t.subject_id')} AS subject_label, ${lbl.cls('t.class_id')} AS class_label`,
    fields: { teacher_id: { t: 'ref', table: 'users', role: 'Enseignant', req: 1 }, subject_id: { t: 'ref', table: 'subjects', req: 1 }, class_id: { t: 'ref', table: 'classes', req: 1 } }
  },
  grades: {
    table: 'grades', read: ['Administrateur', 'Enseignant', 'Parent', 'Élève'], write: ['Administrateur', 'Enseignant'], scope: by('student', 'student_id'), writeScope: 'student',
    select: `t.*, ${lbl.student('t.student_id')} AS student_label, ${lbl.subj('t.subject_id')} AS subject_label, (SELECT coefficient FROM subjects s WHERE s.id=t.subject_id AND s.school_id=t.school_id) AS coefficient`,
    fields: { student_id: { t: 'ref', table: 'students', req: 1 }, subject_id: { t: 'ref', table: 'subjects', req: 1 }, evaluation: { t: 'text', req: 1, max: 120 },
      type: { t: 'enum', v: ['controle', 'examen'] }, trimestre: { t: 'int', min: 1, max: 3 }, valeur: { t: 'num', req: 1, min: 0 }, bareme: { t: 'num', min: 1, max: 100 }, date_eval: { t: 'date' } },
    before({ data, old }) {
      const v = data.valeur ?? old?.valeur, b = data.bareme ?? old?.bareme ?? 20;
      if (v != null && Number(v) > Number(b)) throw bad(`La note (${v}) ne peut pas dépasser le barème (${b})`);
    }
  },
  absences: {
    table: 'absences', read: ['Administrateur', 'Enseignant', 'Parent', 'Élève'], write: ['Administrateur', 'Enseignant'], scope: by('student', 'student_id'), writeScope: 'student',
    select: `t.*, ${lbl.student('t.student_id')} AS student_label`,
    fields: { student_id: { t: 'ref', table: 'students', req: 1 }, date_absence: { t: 'date', req: 1 }, motif: { t: 'text', max: 300 }, justifiee: { t: 'bool' } }
  },
  schedule: {
    table: 'schedule', read: ['Administrateur', 'Enseignant', 'Parent', 'Élève'], write: ADMIN, scope: by('class', 'class_id'),
    select: `t.*, to_char(t.debut,'HH24:MI') AS debut, to_char(t.fin,'HH24:MI') AS fin, ${lbl.cls('t.class_id')} AS class_label, ${lbl.subj('t.subject_id')} AS subject_label, ${lbl.user('t.teacher_id')} AS teacher_label, (SELECT nom FROM rooms r WHERE r.id=t.room_id AND r.school_id=t.school_id) AS room_label`,
    fields: { class_id: { t: 'ref', table: 'classes', req: 1 }, subject_id: { t: 'ref', table: 'subjects' }, teacher_id: { t: 'ref', table: 'users', role: 'Enseignant' }, room_id: { t: 'ref', table: 'rooms' },
      jour: { t: 'enum', v: DAYS, req: 1 }, debut: { t: 'time', req: 1 }, fin: { t: 'time', req: 1 } },
    // Détection des conflits : classe, enseignant ou salle déjà occupé(e) au même moment
    async before({ data, old, db, user }) {
      const d = { ...old, ...data };
      if (!hhmm.test(d.debut) || !hhmm.test(d.fin) || d.debut >= d.fin) throw bad('Horaires invalides (le début doit précéder la fin)');
      const { rows } = await db.query(`SELECT class_id,teacher_id,room_id FROM schedule WHERE school_id=$1 AND deleted_at IS NULL AND jour=$2 AND id<>COALESCE($3,0)
        AND debut < $5::time AND fin > $4::time`, [user.school_id, d.jour, old?.id ?? null, d.debut, d.fin]);
      if (rows.some(r => r.class_id === Number(d.class_id))) throw conflict('Conflit : cette classe a déjà un cours sur ce créneau');
      if (d.teacher_id && rows.some(r => r.teacher_id === d.teacher_id)) throw conflict('Conflit : cet enseignant a déjà un cours sur ce créneau');
      if (d.room_id && rows.some(r => r.room_id === Number(d.room_id))) throw conflict('Conflit : cette salle est déjà occupée sur ce créneau');
    }
  },
  fees: {
    table: 'fees', read: ['Administrateur', 'Comptable'], write: ['Administrateur', 'Comptable'], scope: () => null,
    fields: { libelle: { t: 'text', req: 1, max: 150 }, montant: { t: 'num', req: 1, min: 0 }, niveau: { t: 'text', max: 30 }, annee_scolaire: { t: 'text', max: 9 } }
  },
  payments: {
    table: 'payments', read: ['Administrateur', 'Comptable', 'Parent'], write: ['Administrateur', 'Comptable'], scope: by('student', 'student_id'),
    select: `t.*, ${lbl.student('t.student_id')} AS student_label`,
    fields: { student_id: { t: 'ref', table: 'students', req: 1 }, montant: { t: 'num', req: 1, min: 0.001 }, mode: { t: 'enum', v: Object.keys(MODES), req: 1 }, date_paiement: { t: 'date' }, objet: { t: 'text', max: 150 } },
    // Après chaque paiement : reçu numéroté + message automatique au(x) parent(s) + journal d'envoi
    async after({ row, user, db }) {
      const numero = `REC-${String(row.annee_scolaire).slice(0, 4)}-${String(row.id).padStart(5, '0')}`;
      await db.query('UPDATE payments SET numero_recu=$1, created_by=$2 WHERE id=$3 AND school_id=$4', [numero, user.id, row.id, user.school_id]);
      row.numero_recu = numero;
      const bal = await balanceOf(db, user.school_id, row.student_id);
      const { rows: [st] } = await db.query('SELECT prenom, nom FROM students WHERE id=$1 AND school_id=$2', [row.student_id, user.school_id]);
      const corps = `Paiement de ${money(row.montant)} reçu le ${row.date_paiement} (${MODES[row.mode]}) pour ${st.prenom} ${st.nom}.\nNouveau solde restant : ${money(bal.reste)}.\nReçu n° ${numero} : télécharger depuis la page Paiements (lien : /paiements/recu/${row.id}).`;
      for (const p of await parentsOfStudent(db, user.school_id, row.student_id)) {
        const m = await db.query(`INSERT INTO messages(school_id,sender_id,recipient_id,student_id,objet,corps,statut,sent_at) VALUES($1,$2,$3,$4,$5,$6,'envoye',now()) RETURNING id`,
          [user.school_id, user.id, p.id, row.student_id, 'Paiement enregistré', corps]);
        await notify(db, user.school_id, p.id, 'Paiement enregistré', `${money(row.montant)} — solde restant ${money(bal.reste)}`, '/messages');
        await logDelivery(db, user.school_id, p.id, 'messagerie', 'Paiement enregistré', 'envoye', `message #${m.rows[0].id}`);
      }
    }
  },
  homework: {
    table: 'homework', read: ['Administrateur', 'Enseignant', 'Parent', 'Élève'], write: ['Administrateur', 'Enseignant'], scope: by('class', 'class_id'), writeScope: 'class',
    select: `t.*, ${lbl.cls('t.class_id')} AS class_label, ${lbl.subj('t.subject_id')} AS subject_label, ${lbl.user('t.teacher_id')} AS teacher_label,
      (SELECT filename FROM files f WHERE f.id=t.attachment_file_id AND f.school_id=t.school_id) AS attachment_name,
      (SELECT filename FROM files f WHERE f.id=t.correction_file_id AND f.school_id=t.school_id) AS correction_name,
      (SELECT count(*)::int FROM homework_submissions h WHERE h.homework_id=t.id AND h.school_id=t.school_id) AS nb_depots`,
    fields: { titre: { t: 'text', req: 1, max: 200 }, description: { t: 'text', max: 4000 }, class_id: { t: 'ref', table: 'classes', req: 1 }, subject_id: { t: 'ref', table: 'subjects' },
      echeance: { t: 'date', req: 1 }, bareme: { t: 'num', min: 1, max: 100 } },
    async after({ row, user, db }) {
      const targets = await usersOfClass(db, user.school_id, row.class_id);
      await notifyMany(db, user.school_id, targets, 'Nouveau devoir', `${row.titre} — à rendre pour le ${row.echeance}`, '/homework');
    },
    async guard(row, db, user) {
      const { rows: [r] } = await db.query('SELECT count(*)::int n FROM homework_submissions WHERE school_id=$1 AND homework_id=$2', [user.school_id, row.id]);
      if (r.n) return { force: true, msg: `${r.n} travail(aux) d’élève(s) ont déjà été déposés. Confirmer la suppression ?` };
    }
  }
};

async function loadSchool(db, sid) { return (await db.query('SELECT * FROM schools WHERE id=$1', [sid])).rows[0]; }

function coerce(spec, v, name) {
  if (v === '' || v === undefined || v === null) return null;
  switch (spec.t) {
    case 'text': { const s = String(v).trim(); if (spec.max && s.length > spec.max) throw bad(`${name} : ${spec.max} caractères maximum`); return s; }
    case 'int': { const n = Number(v); if (!Number.isInteger(n)) throw bad(`${name} : entier attendu`); if ((spec.min != null && n < spec.min) || (spec.max != null && n > spec.max)) throw bad(`${name} : valeur hors limites`); return n; }
    case 'num': { const n = Number(v); if (!Number.isFinite(n)) throw bad(`${name} : nombre attendu`); if ((spec.min != null && n < spec.min) || (spec.max != null && n > spec.max)) throw bad(`${name} : valeur hors limites`); return n; }
    case 'date': { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || isNaN(Date.parse(v))) throw bad(`${name} : date invalide`); return String(v); }
    case 'time': { if (!hhmm.test(String(v))) throw bad(`${name} : heure invalide`); return String(v); }
    case 'bool': return v === true || v === 'true' || v === 'oui' || v === 1;
    case 'enum': { if (!spec.v.includes(v)) throw bad(`${name} : valeur non autorisée`); return v; }
    case 'ref': { const n = spec.table === 'users' ? String(v) : Number(v); if (spec.table !== 'users' && !Number.isInteger(n)) throw bad(`${name} invalide`); return n; }
  }
}

async function buildData(R, body, db, user, partial) {
  const data = {};
  for (const [k, spec] of Object.entries(R.fields)) {
    if (body[k] === undefined) { if (!partial && spec.req) throw bad(`Champ obligatoire : ${k}`); continue; }
    const v = coerce(spec, body[k], k);
    if (v === null && spec.req) throw bad(`Champ obligatoire : ${k}`);
    data[k] = v;
    // une référence doit exister DANS la même école (et ne pas être supprimée)
    if (spec.t === 'ref' && v !== null) {
      const sql = spec.table === 'users'
        ? `SELECT 1 FROM users WHERE id=$1 AND school_id=$2 AND deleted_at IS NULL${spec.role ? ' AND role=$3' : ''}`
        : `SELECT 1 FROM ${spec.table} WHERE id=$1 AND school_id=$2${['students','classes','subjects','rooms'].includes(spec.table) ? ' AND deleted_at IS NULL' : ''}`;
      const { rowCount } = await db.query(sql, spec.role ? [v, user.school_id, spec.role] : [v, user.school_id]);
      if (!rowCount) throw bad(`${k} : élément introuvable dans votre école`);
    }
  }
  return data;
}

function listSql(R, user, sc, extraWhere = '', extraParams = []) {
  const params = [user.school_id];
  let where = 't.school_id=$1' + (R.soft === false ? '' : ' AND t.deleted_at IS NULL');
  const f = R.scope ? R.scope(sc, user) : null;
  if (f === false) where += ' AND FALSE';
  else if (f) { params.push(f[1]); where += ' AND ' + f[0].replace('$N', '$' + params.length); }
  for (const p of extraParams) params.push(p);
  where += extraWhere.replace(/\$X(\d)/g, (_, i) => '$' + (params.length - extraParams.length + Number(i)));
  return [`SELECT ${R.select || 't.*'} FROM ${R.table} t WHERE ${where} ORDER BY t.id`, params];
}

export async function listResource(name, user, sc, db = pool) {
  const R = RES[name];
  if (!R.read.includes(user.role)) return [];
  const [sql, params] = listSql(R, user, sc);
  const { rows } = await db.query(sql, params);
  return rows.map(r => hideCorrection(name, r, user));
}

// La correction n'est visible des élèves/parents qu'après la date de remise
function hideCorrection(name, r, user) {
  if (name === 'homework' && ['Parent', 'Élève'].includes(user.role) && today() <= r.echeance) return { ...r, correction_file_id: null, correction_name: null, correction_text: null };
  return r;
}

async function loadOne(R, name, id, user, sc, db) {
  if (!Number.isInteger(id)) throw notFound();
  const [sql, params] = listSql(R, user, sc, ' AND t.id=$X1', [id]);
  const { rows: [r] } = await db.query(sql, params);
  if (!r) throw notFound(); // inexistant OU appartenant à une autre école OU hors périmètre : même réponse
  return r;
}

export function resourceRouter() {
  const r = express.Router();
  r.use(auth);
  const get = (req) => { const R = RES[req.params.res]; if (!R) throw notFound('Module inconnu'); return R; };
  const canWrite = (R, u) => { if (!R.write.includes(u.role)) throw forbidden(); };
  const checkWriteScope = (R, data, sc, user) => {
    if (user.role !== 'Enseignant') return;
    if (R.writeScope === 'student' && !sc.studentIds.includes(Number(data.student_id))) throw forbidden('Cet élève n’est pas dans vos classes');
    if (R.writeScope === 'class' && !sc.classIds.includes(Number(data.class_id))) throw forbidden('Cette classe ne vous est pas affectée');
  };

  r.get('/:res', wrap(async (req, res) => { const R = get(req); if (!R.read.includes(req.user.role)) throw forbidden(); res.json(await listResource(req.params.res, req.user, await scopeOf(req.user))); }));

  r.post('/:res', wrap(async (req, res) => {
    const R = get(req), u = req.user, name = req.params.res; canWrite(R, u);
    const row = await tx(async db => {
      const sc = await scopeOf(u), school = await loadSchool(db, u.school_id);
      const data = await buildData(R, req.body || {}, db, u, false);
      if (R.fields.annee_scolaire && !data.annee_scolaire) data.annee_scolaire = school.annee_scolaire;
      else if (!R.fields.annee_scolaire && ['grades', 'absences', 'payments', 'schedule'].includes(R.table)) data.annee_scolaire = school.annee_scolaire;
      if (R.table === 'students' && !data.statut) data.statut = 'inscrit';
      if (R.table === 'grades') { data.type ??= 'controle'; data.trimestre ??= 1; data.bareme ??= 20; data.date_eval ??= today(); }
      if (R.table === 'payments') data.date_paiement ??= today();
      if (R.table === 'homework') { data.teacher_id = u.id; data.bareme ??= 20; data.description ??= ''; }
      if (R.table === 'rooms') data.disponible ??= true;
      checkWriteScope(R, data, sc, u);
      await R.before?.({ data, old: null, db, user: u, sc });
      const cols = Object.keys(data), vals = Object.values(data);
      const ins = await db.query(`INSERT INTO ${R.table}(school_id,${cols.join(',')}) VALUES($1,${cols.map((_, i) => '$' + (i + 2)).join(',')}) RETURNING *`, [u.school_id, ...vals]);
      const created = ins.rows[0];
      await R.after?.({ row: created, user: u, db });
      await audit(u, 'create', name, created.id, null, data, db);
      return created;
    });
    res.status(201).json(await loadOne(R, req.params.res, row.id, u, await scopeOf(u), pool));
  }));

  r.put('/:res/:id', wrap(async (req, res) => {
    const R = get(req), u = req.user, name = req.params.res; canWrite(R, u);
    const id = Number(req.params.id);
    await tx(async db => {
      const sc = await scopeOf(u);
      const old = await loadOne(R, name, id, u, sc, db);
      const data = await buildData(R, req.body || {}, db, u, true);
      if (!Object.keys(data).length) throw bad('Rien à modifier');
      checkWriteScope(R, { ...old, ...data }, sc, u);
      await R.before?.({ data, old, db, user: u, sc });
      const cols = Object.keys(data);
      await db.query(`UPDATE ${R.table} SET ${cols.map((c, i) => `${c}=$${i + 3}`).join(',')} WHERE id=$1 AND school_id=$2`, [id, u.school_id, ...Object.values(data)]);
      const diffOld = {}, diffNew = {};
      for (const c of cols) if (String(old[c] ?? '') !== String(data[c] ?? '')) { diffOld[c] = old[c] ?? null; diffNew[c] = data[c]; }
      await audit(u, 'update', name, id, diffOld, diffNew, db);
    });
    res.json(await loadOne(R, name, id, u, await scopeOf(u), pool));
  }));

  r.delete('/:res/:id', wrap(async (req, res) => {
    const R = get(req), u = req.user, name = req.params.res; canWrite(R, u);
    const id = Number(req.params.id), force = req.query.force === '1';
    await tx(async db => {
      const sc = await scopeOf(u);
      const old = await loadOne(R, name, id, u, sc, db);
      if (u.role === 'Enseignant') checkWriteScope(R, old, sc, u);
      const g = await R.guard?.(old, db, u);
      if (g?.block) throw conflict(g.block);
      if (g?.force && !force) { const e = conflict(g.msg); e.needsConfirm = true; throw e; }
      if (R.soft === false) await db.query(`DELETE FROM ${R.table} WHERE id=$1 AND school_id=$2`, [id, u.school_id]);
      else await db.query(`UPDATE ${R.table} SET deleted_at=now() WHERE id=$1 AND school_id=$2`, [id, u.school_id]);
      await audit(u, 'delete', name, id, Object.fromEntries(Object.entries(old).filter(([k]) => R.fields[k])), null, db);
    });
    res.json({ ok: true });
  }));
  return r;
}
export { loadSchool, listSql };
