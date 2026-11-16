import express from 'express';
import PDFDocument from 'pdfkit';
import { pool, tx } from './db.js';
import { auth, audit, scopeOf, requireRole } from './auth.js';
import { bad, forbidden, notFound, conflict, wrap, today, money, MODES } from './util.js';
import { RES, listResource, loadSchool } from './resources.js';
import { notify, notifyMany, usersOfClass, parentsOfStudent, balanceOf } from './notify.js';

const FILE_TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const MAX_FILE = 5 * 1024 * 1024;

// Enregistre un fichier envoyé en base64 { filename, data } ; contrôle l'extension et la taille.
async function storeFile(db, user, f) {
  if (!f || typeof f.filename !== 'string' || typeof f.data !== 'string') throw bad('Fichier invalide');
  const ext = f.filename.split('.').pop().toLowerCase();
  if (!FILE_TYPES[ext]) throw bad('Type de fichier non autorisé (PDF, images, TXT, DOC/DOCX)');
  const buf = Buffer.from(f.data, 'base64');
  if (!buf.length || buf.length > MAX_FILE) throw bad('Fichier vide ou supérieur à 5 Mo');
  const name = f.filename.replace(/[^\w.\- ]/g, '_').slice(0, 200);
  const { rows: [r] } = await db.query('INSERT INTO files(school_id,owner_id,filename,mime,size,content) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [user.school_id, user.id, name, FILE_TYPES[ext], buf.length, buf]);
  return r.id;
}

export function schoolRouter() {
  const r = express.Router();
  r.use(auth);
  const fileLimit = express.json({ limit: '8mb' });

  // ---------- Données de démarrage de l'interface (déjà filtrées par rôle et école) ----------
  r.get('/bootstrap', wrap(async (req, res) => {
    const u = req.user;
    if (u.real_role === 'SuperAdmin' && !u.impersonated) return res.json({ user: { id: u.id, email: u.email, role: 'SuperAdmin', school_id: null }, data: null });
    const sc = await scopeOf(u);
    const school = await loadSchool(pool, u.school_id);
    const data = {};
    for (const k of ['students', 'classes', 'subjects', 'rooms', 'assignments', 'grades', 'absences', 'schedule', 'fees', 'payments', 'homework']) data[k] = await listResource(k, u, sc);
    data.teachers = u.role === 'Administrateur' ? (await pool.query(`SELECT id,nom,prenom,email,matiere,active FROM users WHERE school_id=$1 AND role='Enseignant' AND deleted_at IS NULL ORDER BY nom`, [u.school_id])).rows : [];
    const balances = {};
    if (['Administrateur', 'Comptable', 'Parent'].includes(u.role)) for (const s of data.students) balances[s.id] = await balanceOf(pool, u.school_id, s.id);
    const unread = (await pool.query(`SELECT (SELECT count(*) FROM notifications WHERE school_id=$1 AND user_id=$2 AND NOT lu)::int n, (SELECT count(*) FROM messages WHERE school_id=$1 AND recipient_id=$2 AND statut='envoye' AND NOT lu AND NOT hidden_by_recipient)::int m`, [u.school_id, u.id])).rows[0];
    res.json({
      user: { id: u.id, email: u.email, role: u.role, school_id: u.school_id, impersonated: !!u.impersonated, nom: u.nom, prenom: u.prenom },
      settings: { school: school.name, annee: school.annee_scolaire, tarif: school.tarif_annuel, address: school.address, email: school.email, phone: school.phone },
      data, balances, unread
    });
  }));

  r.patch('/settings', requireRole('Administrateur'), wrap(async (req, res) => {
    const b = req.body || {};
    const name = String(b.school ?? '').trim(), annee = String(b.annee ?? '').trim();
    if (name.length < 3 || name.length > 200) throw bad('Nom de l’école : 3 à 200 caractères');
    if (!/^\d{4}-\d{4}$/.test(annee)) throw bad('Année scolaire au format 2026-2027');
    const tarif = Number(b.tarif ?? 0); if (!(tarif >= 0)) throw bad('Tarif invalide');
    const old = await loadSchool(pool, req.user.school_id);
    await pool.query('UPDATE schools SET name=$2,annee_scolaire=$3,tarif_annuel=$4,address=$5,email=$6,phone=$7 WHERE id=$1', [req.user.school_id, name, annee, tarif, b.address || null, b.email || null, b.phone || null]);
    await audit(req.user, 'update', 'settings', req.user.school_id, { name: old.name, annee: old.annee_scolaire, tarif: old.tarif_annuel }, { name, annee, tarif });
    res.json({ ok: true });
  }));

  r.get('/audit', requireRole('Administrateur'), wrap(async (req, res) => {
    res.json((await pool.query(`SELECT id,actor_email,impersonated,action,entity,entity_id,old_values,new_values,at FROM audit_log WHERE school_id=$1 ORDER BY id DESC LIMIT 300`, [req.user.school_id])).rows);
  }));
  r.get('/delivery-log', requireRole('Administrateur', 'Comptable'), wrap(async (req, res) => {
    res.json((await pool.query(`SELECT d.id,d.canal,d.sujet,d.statut,d.detail,d.at,(SELECT email FROM users u WHERE u.id=d.recipient_id AND u.school_id=d.school_id) AS destinataire FROM delivery_log d WHERE d.school_id=$1 ORDER BY d.id DESC LIMIT 200`, [req.user.school_id])).rows);
  }));

  // ---------- Pré-inscription par un parent (validée ensuite par l'administration) ----------
  r.post('/preinscription', requireRole('Parent'), wrap(async (req, res) => {
    const b = req.body || {};
    if (!String(b.nom || '').trim() || !String(b.prenom || '').trim()) throw bad('Nom et prénom obligatoires');
    if (b.date_naissance && !/^\d{4}-\d{2}-\d{2}$/.test(b.date_naissance)) throw bad('Date de naissance invalide');
    const school = await loadSchool(pool, req.user.school_id);
    const id = await tx(async db => {
      const { rows: [s] } = await db.query(`INSERT INTO students(school_id,nom,prenom,date_naissance,medical,parent_label,annee_scolaire,statut) VALUES($1,$2,$3,$4,$5,$6,$7,'preinscrit') RETURNING id`,
        [req.user.school_id, b.nom.trim(), b.prenom.trim(), b.date_naissance || null, b.medical || null, `${req.user.prenom} ${req.user.nom}`.trim() || req.user.email, school.annee_scolaire]);
      await db.query('INSERT INTO student_parents(school_id,student_id,parent_id) VALUES($1,$2,$3)', [req.user.school_id, s.id, req.user.id]);
      const admins = (await db.query(`SELECT id FROM users WHERE school_id=$1 AND role='Administrateur' AND deleted_at IS NULL AND active`, [req.user.school_id])).rows.map(x => x.id);
      await notifyMany(db, req.user.school_id, admins, 'Nouvelle pré-inscription', `${b.prenom} ${b.nom} — à valider`, '/students');
      await audit(req.user, 'create', 'preinscription', s.id, null, { nom: b.nom, prenom: b.prenom }, db);
      return s.id;
    });
    res.status(201).json({ id });
  }));

  // ---------- Justification d'absence par le parent ----------
  r.post('/absences/:id/justify', requireRole('Parent'), wrap(async (req, res) => {
    const sc = await scopeOf(req.user); const text = String(req.body?.justification || '').trim();
    if (!text) throw bad('Saisissez le motif de la justification');
    const { rows: [a] } = await pool.query('SELECT id,student_id FROM absences WHERE id=$1 AND school_id=$2 AND deleted_at IS NULL', [Number(req.params.id), req.user.school_id]);
    if (!a || !sc.studentIds.includes(a.student_id)) throw notFound();
    await pool.query('UPDATE absences SET justifiee=true, justification=$3 WHERE id=$1 AND school_id=$2', [a.id, req.user.school_id, text.slice(0, 2000)]);
    await audit(req.user, 'justify', 'absences', a.id, null, { justification: text.slice(0, 200) });
    res.json({ ok: true });
  }));

  // ---------- Fichiers (devoirs, dépôts, corrections) ----------
  r.get('/files/:id', wrap(async (req, res) => {
    const u = req.user, sc = await scopeOf(u), id = Number(req.params.id), s = u.school_id;
    const { rows: [f] } = await pool.query('SELECT id,filename,mime,content,owner_id FROM files WHERE id=$1 AND school_id=$2', [id, s]);
    if (!f) throw notFound();
    let ok = u.role === 'Administrateur' || f.owner_id === u.id;
    if (!ok) {
      const classIds = sc.classIds ?? [], studentIds = sc.studentIds ?? [];
      const hw = (await pool.query(`SELECT 1 FROM homework WHERE school_id=$1 AND deleted_at IS NULL AND class_id=ANY($2::int[]) AND (attachment_file_id=$3 OR (correction_file_id=$3 AND ($4::bool OR echeance < CURRENT_DATE)))`, [s, classIds, id, u.role === 'Enseignant'])).rowCount;
      const sub = (await pool.query('SELECT 1 FROM homework_submissions WHERE school_id=$1 AND file_id=$2 AND student_id=ANY($3::int[])', [s, id, studentIds])).rowCount;
      ok = !!(hw || sub);
    }
    if (!ok) throw notFound();
    res.setHeader('Content-Type', f.mime); res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(f.filename)}"`);
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.send(f.content);
  }));

  const hwOf = async (req, db = pool) => {
    const sc = await scopeOf(req.user);
    const { rows: [h] } = await db.query('SELECT * FROM homework WHERE id=$1 AND school_id=$2 AND deleted_at IS NULL', [Number(req.params.id), req.user.school_id]);
    if (!h || (sc.classIds && !sc.classIds.includes(h.class_id))) throw notFound('Devoir introuvable');
    return { h, sc };
  };
  const teacherSide = requireRole('Administrateur', 'Enseignant');

  r.put('/homework/:id/attachment', fileLimit, teacherSide, wrap(async (req, res) => {
    const { h } = await hwOf(req);
    const fid = await tx(async db => { const f = await storeFile(db, req.user, req.body); await db.query('UPDATE homework SET attachment_file_id=$3 WHERE id=$1 AND school_id=$2', [h.id, req.user.school_id, f]); await audit(req.user, 'update', 'homework', h.id, null, { attachment: req.body.filename }, db); return f; });
    res.json({ file_id: fid });
  }));
  r.put('/homework/:id/correction', fileLimit, teacherSide, wrap(async (req, res) => {
    const { h } = await hwOf(req);
    const text = String(req.body?.text || '').trim().slice(0, 4000);
    if (!text && !req.body?.file) throw bad('Joignez un fichier ou saisissez un texte de correction');
    await tx(async db => {
      const fid = req.body.file ? await storeFile(db, req.user, req.body.file) : h.correction_file_id;
      await db.query('UPDATE homework SET correction_file_id=$3, correction_text=$4 WHERE id=$1 AND school_id=$2', [h.id, req.user.school_id, fid, text || null]);
      await notifyMany(db, req.user.school_id, await usersOfClass(db, req.user.school_id, h.class_id), 'Correction disponible', `${h.titre} — visible après le ${h.echeance}`, '/homework');
      await audit(req.user, 'correction', 'homework', h.id, null, null, db);
    });
    res.json({ ok: true });
  }));

  // Dépôts : enseignant/admin = tous les élèves de la classe ; parent = ses enfants ; élève = lui-même
  r.get('/homework/:id/submissions', wrap(async (req, res) => {
    const { h, sc } = await hwOf(req), s = req.user.school_id;
    const ids = sc.studentIds;
    const { rows } = await pool.query(`SELECT st.id AS student_id, st.prenom||' '||st.nom AS student_label, sub.id, sub.contenu, sub.file_id, sub.submitted_at, sub.en_retard, sub.note, sub.commentaire, sub.note_publiee, sub.vu_parent,
        (SELECT filename FROM files f WHERE f.id=sub.file_id AND f.school_id=sub.school_id) AS file_name
      FROM students st LEFT JOIN homework_submissions sub ON sub.student_id=st.id AND sub.school_id=st.school_id AND sub.homework_id=$2
      WHERE st.school_id=$1 AND st.classe_id=$3 AND st.deleted_at IS NULL AND ($4::int[] IS NULL OR st.id=ANY($4::int[])) ORDER BY st.nom`, [s, h.id, h.class_id, ids]);
    const mine = ['Parent', 'Élève'].includes(req.user.role);
    res.json({ homework: { id: h.id, titre: h.titre, echeance: h.echeance, bareme: h.bareme }, items: rows.map(x => ({ ...x,
      statut: !x.id ? (today() > h.echeance ? 'non rendu (échéance dépassée)' : 'non rendu') : x.note_publiee ? 'noté' : x.en_retard ? 'rendu en retard' : 'rendu',
      note: mine && !x.note_publiee ? null : x.note, commentaire: mine && !x.note_publiee ? null : x.commentaire })) });
  }));
  r.put('/homework/:id/submission', fileLimit, requireRole('Élève'), wrap(async (req, res) => {
    const { h, sc } = await hwOf(req);
    const sid = sc.studentIds[0]; if (!sid) throw forbidden('Aucun dossier élève associé à ce compte');
    const contenu = String(req.body?.contenu || '').trim().slice(0, 8000);
    if (!contenu && !req.body?.file) throw bad('Joignez un fichier ou écrivez votre travail');
    await tx(async db => {
      const { rows: [old] } = await db.query('SELECT * FROM homework_submissions WHERE school_id=$1 AND homework_id=$2 AND student_id=$3', [req.user.school_id, h.id, sid]);
      const late = today() > h.echeance;
      if (old && late) throw conflict('La date de remise est dépassée : le dépôt ne peut plus être remplacé.');
      if (old?.note_publiee) throw conflict('Ce travail est déjà noté.');
      const fid = req.body.file ? await storeFile(db, req.user, req.body.file) : old?.file_id ?? null;
      await db.query(`INSERT INTO homework_submissions(school_id,homework_id,student_id,contenu,file_id,submitted_at,en_retard) VALUES($1,$2,$3,$4,$5,now(),$6)
        ON CONFLICT (school_id,homework_id,student_id) DO UPDATE SET contenu=EXCLUDED.contenu,file_id=EXCLUDED.file_id,submitted_at=now(),en_retard=EXCLUDED.en_retard`, [req.user.school_id, h.id, sid, contenu, fid, late]);
      if (h.teacher_id) await notify(db, req.user.school_id, h.teacher_id, 'Travail déposé', `${req.user.prenom || req.user.email} a déposé « ${h.titre} »`, '/homework');
      await audit(req.user, old ? 'replace' : 'submit', 'homework_submissions', h.id, null, null, db);
    });
    res.json({ ok: true });
  }));
  r.patch('/homework/:id/grade/:studentId', teacherSide, wrap(async (req, res) => {
    const { h } = await hwOf(req), s = req.user.school_id, sid = Number(req.params.studentId), b = req.body || {};
    const note = Number(b.note); if (!Number.isFinite(note) || note < 0 || note > Number(h.bareme)) throw bad(`La note doit être comprise entre 0 et ${h.bareme}`);
    await tx(async db => {
      const { rows: [sub] } = await db.query('SELECT id FROM homework_submissions WHERE school_id=$1 AND homework_id=$2 AND student_id=$3', [s, h.id, sid]);
      if (!sub) throw notFound('Aucun dépôt pour cet élève');
      await db.query('UPDATE homework_submissions SET note=$2,commentaire=$3,note_publiee=$4 WHERE id=$1 AND school_id=$5', [sub.id, note, String(b.commentaire || '').slice(0, 2000) || null, b.publier !== false, s]);
      if (b.publier !== false) {
        const { rows: [st] } = await db.query('SELECT compte_id FROM students WHERE id=$1 AND school_id=$2', [sid, s]);
        const targets = (await parentsOfStudent(db, s, sid)).map(p => p.id); if (st?.compte_id) targets.push(st.compte_id);
        await notifyMany(db, s, targets, 'Note de devoir publiée', `${h.titre} : ${note}/${h.bareme}`, '/homework');
      }
      await audit(req.user, 'grade', 'homework_submissions', sub.id, null, { note }, db);
    });
    res.json({ ok: true });
  }));
  r.post('/homework/:id/seen/:studentId', requireRole('Parent'), wrap(async (req, res) => {
    const { sc, h } = await hwOf(req), sid = Number(req.params.studentId);
    if (!sc.studentIds.includes(sid)) throw notFound();
    await pool.query('UPDATE homework_submissions SET vu_parent=true WHERE school_id=$1 AND homework_id=$2 AND student_id=$3', [req.user.school_id, h.id, sid]); res.json({ ok: true });
  }));

  // ---------- Import / export CSV des élèves ----------
  const csvCell = v => { let x = String(v ?? ''); if (/^[\s]*[=+@\-\t\r]/.test(x)) x = "'" + x; return '"' + x.replaceAll('"', '""') + '"'; };
  r.get('/export/students.csv', requireRole('Administrateur', 'Comptable', 'Enseignant'), wrap(async (req, res) => {
    const rows = await listResource('students', req.user, await scopeOf(req.user));
    const cols = ['nom', 'prenom', 'classe_label', 'date_naissance', 'parent_label', 'annee_scolaire', 'statut'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="eleves-edugestion.csv"'); res.setHeader('Cache-Control', 'no-store');
    res.send('\uFEFF' + [['nom', 'prenom', 'classe', 'date_naissance', 'parent', 'annee_scolaire', 'statut'].join(';'), ...rows.map(s => cols.map(k => csvCell(s[k])).join(';'))].join('\r\n'));
  }));
  r.post('/students/import', requireRole('Administrateur', 'Comptable'), wrap(async (req, res) => {
    const rows = req.body?.rows; if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw bad('Fournir entre 1 et 500 lignes');
    const school = await loadSchool(pool, req.user.school_id), errors = []; let created = 0;
    await tx(async db => {
      const classes = (await db.query(`SELECT c.id,c.capacite,lower(c.niveau||' '||c.section) AS label,(SELECT count(*)::int FROM students s WHERE s.school_id=c.school_id AND s.classe_id=c.id AND s.deleted_at IS NULL) AS n FROM classes c WHERE c.school_id=$1 AND c.deleted_at IS NULL`, [req.user.school_id])).rows;
      for (const [i, x] of rows.entries()) {
        const line = i + 2, nom = String(x.nom || '').trim(), prenom = String(x.prenom || '').trim();
        if (!nom || !prenom) { errors.push({ line, msg: 'nom et prénom obligatoires' }); continue; }
        if (x.date_naissance && !/^\d{4}-\d{2}-\d{2}$/.test(x.date_naissance)) { errors.push({ line, msg: 'date_naissance attendue au format AAAA-MM-JJ' }); continue; }
        let cid = null;
        if (x.classe) { const c = classes.find(c => c.label === String(x.classe).trim().toLowerCase()); if (!c) { errors.push({ line, msg: `classe « ${x.classe} » introuvable` }); continue; } if (c.n >= c.capacite) { errors.push({ line, msg: `classe « ${x.classe} » complète` }); continue; } c.n++; cid = c.id; }
        await db.query(`INSERT INTO students(school_id,nom,prenom,date_naissance,parent_label,classe_id,annee_scolaire,statut) VALUES($1,$2,$3,$4,$5,$6,$7,'inscrit')`, [req.user.school_id, nom.slice(0, 100), prenom.slice(0, 100), x.date_naissance || null, String(x.parent || '').slice(0, 150) || null, cid, school.annee_scolaire]);
        created++;
      }
      await audit(req.user, 'import', 'students', null, null, { created, errors: errors.length }, db);
    });
    res.json({ created, errors });
  }));

  // ---------- PDF : bulletin et reçu ----------
  const pdfOut = (res, name, build) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 50, info: { Title: name } });
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${name}"`); res.setHeader('Cache-Control', 'private, no-store');
    pdf.pipe(res); build(pdf); pdf.end();
  };
  const hr = pdf => { pdf.moveDown(0.4); pdf.moveTo(50, pdf.y).lineTo(545, pdf.y).strokeColor('#cfd8e6').stroke(); pdf.moveDown(0.6); };
  r.get('/pdf/bulletin/:studentId', requireRole('Administrateur', 'Enseignant', 'Parent', 'Élève'), wrap(async (req, res) => {
    const sc = await scopeOf(req.user), sid = Number(req.params.studentId), s = req.user.school_id;
    if (!Number.isInteger(sid) || (sc.studentIds && !sc.studentIds.includes(sid))) throw notFound('Élève introuvable');
    const school = await loadSchool(pool, s);
    const { rows: [st] } = await pool.query(`SELECT st.*, (SELECT niveau||' '||section FROM classes c WHERE c.id=st.classe_id AND c.school_id=st.school_id) AS classe FROM students st WHERE st.id=$1 AND st.school_id=$2 AND st.deleted_at IS NULL`, [sid, s]);
    if (!st) throw notFound('Élève introuvable');
    const tri = [1, 2, 3].includes(Number(req.query.trimestre)) ? Number(req.query.trimestre) : null;
    const { rows } = await pool.query(`SELECT sj.nom, sj.coefficient, avg(g.valeur/g.bareme*20) AS moy, count(*)::int n FROM grades g JOIN subjects sj ON sj.id=g.subject_id AND sj.school_id=g.school_id
      WHERE g.school_id=$1 AND g.student_id=$2 AND g.annee_scolaire=$3 AND g.deleted_at IS NULL AND ($4::int IS NULL OR g.trimestre=$4) GROUP BY sj.id,sj.nom,sj.coefficient ORDER BY sj.nom`, [s, sid, school.annee_scolaire, tri]);
    const sumC = rows.reduce((a, x) => a + Number(x.coefficient), 0), general = sumC ? rows.reduce((a, x) => a + Number(x.moy) * Number(x.coefficient), 0) / sumC : null;
    const abs = (await pool.query('SELECT count(*) FILTER (WHERE justifiee)::int j, count(*) FILTER (WHERE NOT justifiee)::int nj FROM absences WHERE school_id=$1 AND student_id=$2 AND annee_scolaire=$3 AND deleted_at IS NULL', [s, sid, school.annee_scolaire])).rows[0];
    pdfOut(res, `bulletin-${st.nom}-${st.prenom}.pdf`.replace(/[^\w.\-]/g, '_'), pdf => {
      pdf.fontSize(20).fillColor('#152746').text(school.name).fontSize(15).fillColor('#285ac0').text(`Bulletin scolaire${tri ? ' — trimestre ' + tri : ''}`);
      hr(pdf);
      pdf.fontSize(11).fillColor('#192947').text(`Élève : ${st.prenom} ${st.nom}`).text(`Classe : ${st.classe || '—'}`).text(`Année scolaire : ${school.annee_scolaire}`).moveDown();
      pdf.fontSize(10).fillColor('#5b6b86').text('Matière', 50, pdf.y, { continued: true, width: 220 }).text('Coef.', 270, pdf.y, { continued: true, width: 60 }).text('Évaluations', 330, pdf.y, { continued: true, width: 80 }).text('Moyenne /20', 420, pdf.y, { width: 120 });
      hr(pdf);
      if (!rows.length) pdf.fillColor('#192947').text('Aucune note enregistrée pour cette période.');
      for (const x of rows) { const y = pdf.y; pdf.fillColor('#192947').fontSize(11).text(x.nom, 50, y, { width: 220 }).text(String(x.coefficient), 270, y, { width: 60 }).text(String(x.n), 330, y, { width: 80 }).text(Number(x.moy).toFixed(2), 420, y, { width: 120 }); pdf.moveDown(0.3); }
      hr(pdf);
      pdf.fontSize(14).fillColor('#152746').text(`Moyenne générale (coefficients appliqués) : ${general == null ? '—' : general.toFixed(2) + ' / 20'}`);
      pdf.moveDown().fontSize(11).fillColor('#192947').text(`Absences : ${abs.nj} non justifiée(s), ${abs.j} justifiée(s)`);
      if (general != null) pdf.text(`Appréciation : ${general >= 16 ? 'Très bien' : general >= 14 ? 'Bien' : general >= 12 ? 'Assez bien' : general >= 10 ? 'Passable' : 'Insuffisant — à encourager'}`);
      pdf.moveDown(2).fontSize(8).fillColor('#8a96a9').text(`Généré le ${today()} par EduGestion.`);
    });
    await audit(req.user, 'download_bulletin', 'students', sid);
  }));
  r.get('/pdf/recu/:paymentId', requireRole('Administrateur', 'Comptable', 'Parent'), wrap(async (req, res) => {
    const sc = await scopeOf(req.user), pid = Number(req.params.paymentId), s = req.user.school_id;
    const { rows: [p] } = await pool.query('SELECT * FROM payments WHERE id=$1 AND school_id=$2 AND deleted_at IS NULL', [pid, s]);
    if (!p || (sc.studentIds && !sc.studentIds.includes(p.student_id))) throw notFound('Paiement introuvable');
    const school = await loadSchool(pool, s);
    const { rows: [st] } = await pool.query(`SELECT st.prenom,st.nom,(SELECT niveau||' '||section FROM classes c WHERE c.id=st.classe_id AND c.school_id=st.school_id) AS classe,
      (SELECT string_agg(trim(u.prenom||' '||u.nom),', ') FROM student_parents sp JOIN users u ON u.id=sp.parent_id AND u.school_id=sp.school_id WHERE sp.student_id=st.id AND sp.school_id=st.school_id) AS parents FROM students st WHERE st.id=$1 AND st.school_id=$2`, [p.student_id, s]);
    const bal = await balanceOf(pool, s, p.student_id);
    const cumul = Number((await pool.query('SELECT COALESCE(sum(montant),0) t FROM payments WHERE school_id=$1 AND student_id=$2 AND annee_scolaire=$3 AND deleted_at IS NULL AND id<=$4', [s, p.student_id, p.annee_scolaire, p.id])).rows[0].t);
    pdfOut(res, `${p.numero_recu || 'recu-' + p.id}.pdf`, pdf => {
      pdf.fontSize(20).fillColor('#152746').text(school.name).fontSize(15).fillColor('#285ac0').text(`Reçu de paiement n° ${p.numero_recu || p.id}`); hr(pdf);
      pdf.fontSize(11).fillColor('#192947').text(`Date : ${p.date_paiement}`).text(`Élève : ${st.prenom} ${st.nom}`).text(`Classe : ${st.classe || '—'}`).text(`Parent(s) : ${st.parents || '—'}`).text(`Mode de paiement : ${MODES[p.mode]}`).text(`Objet : ${p.objet || '—'}`).text(`Année scolaire : ${p.annee_scolaire}`);
      pdf.moveDown().fontSize(18).fillColor('#285ac0').text(`Montant reçu : ${money(p.montant)}`);
      pdf.moveDown().fontSize(11).fillColor('#192947').text(`Total dû pour l’année : ${money(bal.du)}`).text(`Total payé à la date de ce reçu : ${money(cumul)}`).text(`Solde restant à ce jour : ${money(Math.max(0, bal.du - cumul))}`);
      pdf.moveDown(2).fontSize(8).fillColor('#8a96a9').text(`Généré le ${today()} par EduGestion.`);
    });
    await audit(req.user, 'download_receipt', 'payments', pid);
  }));
  return r;
}
