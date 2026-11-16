import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, call, ok, denied, login, makeSchool, OWNER, suffix, pool } from './helpers.js';

let owner, A, B;
before(async () => { await start(); owner = await login(OWNER.email, OWNER.password); A = await makeSchool(owner, 'C'); B = await makeSchool(owner, 'D'); });
after(stop);
const b64 = s => Buffer.from(s).toString('base64');

test('Authentification : mauvais mot de passe, compte désactivé, session invalidée après reset', async () => {
  await denied('POST', '/login', null, { email: A.emails.admin, password: 'mauvais-mot-de-passe' }, [401]);
  await denied('GET', '/bootstrap', null, undefined, [401]);
  await denied('GET', '/bootstrap', 'abc.def.ghi', undefined, [401]);
  const users = await ok('GET', '/users', A.admin);
  const parentAcc = users.find(u => u.role === 'Parent');
  await ok('PATCH', `/users/${parentAcc.id}`, A.admin, { active: false });
  await denied('GET', '/bootstrap', A.parent, undefined, [401]);                                   // session existante coupée
  await denied('POST', '/login', null, { email: A.emails.parent, password: A.pass.parent }, [403]); // connexion refusée
  await ok('PATCH', `/users/${parentAcc.id}`, A.admin, { active: true });
  A.parent = await login(A.emails.parent, A.pass.parent);
  await ok('POST', `/users/${parentAcc.id}/reset-password`, A.admin, { password: 'NouveauMotDePasse-2026' });
  await denied('GET', '/bootstrap', A.parent, undefined, [401]);
  await denied('POST', '/login', null, { email: A.emails.parent, password: A.pass.parent }, [401]);
  A.parent = await login(A.emails.parent, 'NouveauMotDePasse-2026');
  await denied('POST', `/users/${parentAcc.id}/reset-password`, A.admin, { password: 'court' }, [400]);
});

test('Mot de passe : stocké haché (bcrypt), jamais en clair', async () => {
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE lower(email)=$1', [A.emails.admin]);
  assert.match(rows[0].password_hash, /^\$2[aby]\$12\$/); assert.ok(!rows[0].password_hash.includes(A.pass.admin));
});

test('Super Admin : crée l’école C complète, l’admin se connecte, e-mail unique dans toute la base', async () => {
  const mail = `directeur.new.${suffix}@example.test`;
  const r = await ok('POST', '/saas/schools', owner, { name: `École Nouvelle ${suffix}`, address: '1 rue X', email: 'contact@x.test', phone: '71 111 111', admin_email: mail, admin_password: 'DirecteurNouveau-2026', admin_nom: 'Nouveau' });
  const t = await login(mail, 'DirecteurNouveau-2026');
  const boot = await ok('GET', '/bootstrap', t);
  assert.equal(boot.settings.school, `École Nouvelle ${suffix}`);
  assert.ok(boot.data.subjects.length >= 6);   // configuration initiale
  assert.equal(boot.data.students.length, 0);   // base vierge : aucune donnée d'une autre école
  await denied('POST', '/saas/schools', owner, { name: 'Doublon école', admin_email: mail, admin_password: 'DirecteurNouveau-2026' }, [409]);
  await denied('POST', '/saas/schools', owner, { name: 'ab', admin_email: mail, admin_password: 'x' }, [400]);
  const list = await ok('GET', '/saas/schools?q=nouvelle', owner);
  assert.ok(list.some(s => s.id === r.id && s.admins[0].email === mail));
  // créer un élève dans l'école nouvelle ne modifie pas A
  const before = (await ok('GET', '/r/students', A.admin)).length;
  await ok('POST', '/r/students', t, { nom: 'Nouveau', prenom: 'Élève' });
  assert.equal((await ok('GET', '/r/students', A.admin)).length, before);
});

test('Super Admin : modifier, suspendre, archiver, restaurer, supprimer (avec confirmation)', async () => {
  const mail = `directeur.s.${suffix}@example.test`;
  const s = await ok('POST', '/saas/schools', owner, { name: `École Suspendue ${suffix}`, admin_email: mail, admin_password: 'DirecteurSuspendu-2026' });
  const t = await login(mail, 'DirecteurSuspendu-2026');
  await ok('PATCH', `/saas/schools/${s.id}`, owner, { name: `École Suspendue ${suffix} (renommée)`, phone: '70 000 000', status: 'suspended' });
  await denied('GET', '/bootstrap', t, undefined, [403]);
  await denied('POST', '/login', null, { email: mail, password: 'DirecteurSuspendu-2026' }, [403]);
  await ok('PATCH', `/saas/schools/${s.id}`, owner, { status: 'active' });
  await ok('GET', '/bootstrap', t);
  const admin = (await ok('GET', `/saas/schools/${s.id}`, owner)).admins[0];
  await denied('PATCH', `/saas/schools/${s.id}/admins/${admin.id}`, owner, { active: false }, [409]); // dernier admin actif
  await ok('POST', `/saas/schools/${s.id}/admins/${admin.id}/reset-password`, owner, { password: 'AutreMotDePasse-2026' });
  await denied('GET', '/bootstrap', t, undefined, [401]);
  await login(mail, 'AutreMotDePasse-2026');
  await denied('DELETE', `/saas/schools/${s.id}`, owner, { confirm_name: 'x' }, [409]);            // pas archivée
  await ok('PATCH', `/saas/schools/${s.id}`, owner, { status: 'archived' });
  await denied('POST', '/login', null, { email: mail, password: 'AutreMotDePasse-2026' }, [403]);
  await denied('DELETE', `/saas/schools/${s.id}`, owner, { confirm_name: 'mauvais nom' }, [400]);
  await ok('DELETE', `/saas/schools/${s.id}`, owner, { confirm_name: `École Suspendue ${suffix} (renommée)` });
  await denied('GET', `/saas/schools/${s.id}`, owner, undefined, [404]);
  assert.equal((await pool.query('SELECT count(*)::int n FROM users WHERE school_id=$1', [s.id])).rows[0].n, 0);
});

test('Classes : capacité, suppression contrôlée, titulaire', async () => {
  // classe CP de capacité 3, déjà pleine (3 élèves)
  await denied('POST', '/r/students', A.admin, { nom: 'Trop', prenom: 'Plein', classe_id: A.cls.id }, [409]);
  await denied('PUT', `/r/classes/${A.cls.id}`, A.admin, { capacite: 2 }, [400]);
  await denied('DELETE', `/r/classes/${A.cls.id}`, A.admin, undefined, [409]);
  const extra = await ok('POST', '/r/classes', A.admin, { niveau: 'CM1', section: 'Z', capacite: 5 });
  await ok('DELETE', `/r/classes/${extra.id}`, A.admin);                                       // vide : suppression logique OK
  assert.ok(!(await ok('GET', '/r/classes', A.admin)).some(c => c.id === extra.id));
  const withLabel = (await ok('GET', '/r/classes', A.admin)).find(c => c.id === A.cls.id);
  assert.equal(withLabel.effectif, 3); assert.match(withLabel.enseignant_label, /ProfC/);
});

test('Matières / salles / enseignants : suppression contrôlée si référencés', async () => {
  await denied('DELETE', `/r/subjects/${A.maths.id}`, A.admin, undefined, [409]);              // des notes y sont rattachées
  await denied('DELETE', `/r/teachers/${A.teacherUser.id}`, A.admin, undefined, [409]);        // titulaire de classe
  const s = await ok('POST', '/r/subjects', A.admin, { nom: 'Dessin', coefficient: 1, niveau: 'CP' });
  await ok('PUT', `/r/subjects/${s.id}`, A.admin, { coefficient: 2 });
  await ok('DELETE', `/r/subjects/${s.id}`, A.admin);
  await denied('POST', '/r/subjects', A.admin, { nom: 'X', coefficient: 0 }, [400]);
  const room = await ok('POST', '/r/rooms', A.admin, { nom: 'Salle X', capacite: 20 });
  await ok('DELETE', `/r/rooms/${room.id}`, A.admin);
  // affectation enseignant ↔ matière ↔ classe
  const asg = await ok('POST', '/r/assignments', A.admin, { teacher_id: A.teacherUser.id, subject_id: A.maths.id, class_id: A.cls.id });
  assert.match(asg.subject_label, /Math/);
  await denied('POST', '/r/assignments', A.admin, { teacher_id: A.teacherUser.id, subject_id: A.maths.id, class_id: A.cls.id }, [409]);
});

test('Élèves : suppression logique avec confirmation si notes/paiements', async () => {
  const r = await denied('DELETE', `/r/students/${A.students[0].id}`, A.admin, undefined, [409]);
  assert.equal(r.data.needsConfirm, true);
  const solo = await ok('POST', '/r/students', A.admin, { nom: 'Solo', prenom: 'Sans', classe_id: A.cls2.id });
  await ok('DELETE', `/r/students/${solo.id}`, A.admin);                                       // aucun lien : OK direct
  await ok('DELETE', `/r/students/${A.students[2].id}?force=1`, A.admin);                       // avec confirmation explicite
  const { rows } = await pool.query('SELECT deleted_at FROM students WHERE id=$1', [A.students[2].id]);
  assert.ok(rows[0].deleted_at, 'suppression logique : la ligne est conservée');
});

test('Notes : barème, moyennes pondérées par coefficient dans le bulletin PDF', async () => {
  await denied('POST', '/r/grades', A.admin, { student_id: A.students[0].id, subject_id: A.maths.id, evaluation: 'X', valeur: 25 }, [400]);
  await denied('POST', '/r/grades', A.admin, { student_id: A.students[0].id, subject_id: A.maths.id, evaluation: 'X', valeur: -1 }, [400]);
  const fr = (await ok('GET', '/r/subjects', A.admin)).find(s => s.nom === 'Français');
  await ok('POST', '/r/grades', A.teacher, { student_id: A.students[0].id, subject_id: fr.id, evaluation: 'Dictée', valeur: 9, bareme: 10 }); // 9/10 = 18/20
  const { rows: g } = await pool.query(`SELECT sj.nom, avg(g.valeur/g.bareme*20)::float m, sj.coefficient::float c FROM grades g JOIN subjects sj ON sj.id=g.subject_id WHERE g.student_id=$1 AND g.deleted_at IS NULL GROUP BY sj.id,sj.nom,sj.coefficient`, [A.students[0].id]);
  const expected = g.reduce((a, x) => a + x.m * x.c, 0) / g.reduce((a, x) => a + x.c, 0);   // (15*3 + 18*3)/6 = 16.5
  assert.ok(Math.abs(expected - 16.5) < 0.001, `attendu 16.5, calcul ${expected}`);
  const pdf = await call('GET', `/pdf/bulletin/${A.students[0].id}`, A.parent);
  assert.equal(pdf.status, 200); assert.match(pdf.ct, /application\/pdf/); assert.equal(pdf.data.subarray(0, 4).toString(), '%PDF');
  await denied('GET', `/pdf/bulletin/${A.students[0].id}`, A.compta, undefined, [403]);
});

test('Absences : saisie, justification par le parent', async () => {
  const a = await ok('POST', '/r/absences', A.teacher, { student_id: A.students[0].id, date_absence: '2026-11-10', motif: 'Inconnu' });
  assert.equal(a.justifiee, false);
  await ok('POST', `/absences/${a.id}/justify`, A.parent, { justification: 'Rendez-vous médical' });
  const mine = (await ok('GET', '/r/absences', A.parent)).find(x => x.id === a.id);
  assert.equal(mine.justifiee, true);
  await denied('POST', `/absences/${a.id}/justify`, B.parent, { justification: 'pirate' }, [403, 404]);
});

test('Emploi du temps : détection des conflits (classe, enseignant, salle)', async () => {
  const room = await ok('POST', '/r/rooms', A.admin, { nom: 'Salle EDT', capacite: 25 });
  const slot = await ok('POST', '/r/schedule', A.admin, { class_id: A.cls.id, subject_id: A.maths.id, teacher_id: A.teacherUser.id, room_id: room.id, jour: 'Mardi', debut: '09:00', fin: '10:00' });
  assert.equal(slot.debut, '09:00');
  await denied('POST', '/r/schedule', A.admin, { class_id: A.cls.id, jour: 'Mardi', debut: '09:30', fin: '10:30' }, [409]);                                 // même classe
  await denied('POST', '/r/schedule', A.admin, { class_id: A.cls2.id, teacher_id: A.teacherUser.id, jour: 'Mardi', debut: '09:30', fin: '10:30' }, [409]);   // même enseignant
  await denied('POST', '/r/schedule', A.admin, { class_id: A.cls2.id, room_id: room.id, jour: 'Mardi', debut: '09:59', fin: '11:00' }, [409]);                // même salle
  await ok('POST', '/r/schedule', A.admin, { class_id: A.cls2.id, room_id: room.id, jour: 'Mardi', debut: '10:00', fin: '11:00' });                        // créneaux contigus : OK
  await denied('POST', '/r/schedule', A.admin, { class_id: A.cls2.id, jour: 'Mardi', debut: '12:00', fin: '11:00' }, [400]);
  await ok('PUT', `/r/schedule/${slot.id}`, A.admin, { debut: '08:00', fin: '09:00' });
  assert.ok((await ok('GET', '/r/schedule', A.parent)).some(x => x.id === slot.id));
  await denied('POST', '/r/schedule', A.teacher, { class_id: A.cls.id, jour: 'Jeudi', debut: '08:00', fin: '09:00' }, [403]);
});

test('Paiement : reçu numéroté, solde mis à jour, message automatique + notification + journal', async () => {
  const before = (await ok('GET', '/bootstrap', A.compta)).balances[A.students[0].id];
  assert.equal(before.du, 1000); assert.equal(before.reste, 900);   // 1000 dû, 100 payé à la création de l'école
  const p = await ok('POST', '/r/payments', A.compta, { student_id: A.students[0].id, montant: 250.5, mode: 'virement', objet: 'Tranche 2' });
  assert.match(p.numero_recu, /^REC-\d{4}-\d{5}$/);
  const after = (await ok('GET', '/bootstrap', A.parent)).balances[A.students[0].id];
  assert.equal(after.reste, 649.5);
  const inbox = await ok('GET', '/messages?box=inbox', A.parent);
  const m = inbox.find(x => x.objet === 'Paiement enregistré' && x.corps.includes('250.500'));
  assert.ok(m, 'message automatique manquant'); assert.match(m.corps, /649\.500/); assert.match(m.corps, /Virement/); assert.match(m.corps, new RegExp(p.numero_recu));
  const notes = await ok('GET', '/notifications', A.parent); assert.ok(notes.unread >= 1);
  const log = await ok('GET', '/delivery-log', A.compta); assert.ok(log.some(l => l.sujet === 'Paiement enregistré' && l.statut === 'envoye' && l.destinataire === A.emails.parent));
  const pdf = await call('GET', `/pdf/recu/${p.id}`, A.parent); assert.equal(pdf.status, 200); assert.equal(pdf.data.subarray(0, 4).toString(), '%PDF');
  await denied('GET', `/pdf/recu/${p.id}`, B.parent);
  await denied('POST', '/r/payments', A.admin, { student_id: A.students[0].id, montant: 0, mode: 'especes' }, [400]);
  await denied('POST', '/r/payments', A.admin, { student_id: A.students[0].id, montant: 10, mode: 'bitcoin' }, [400]);
  await ok('PUT', `/r/payments/${p.id}`, A.compta, { montant: 200 });
  const audit = await ok('GET', '/audit', A.admin);
  const upd = audit.find(a => a.action === 'update' && a.entity === 'payments' && a.entity_id === String(p.id));
  assert.equal(upd.old_values.montant, 250.5); assert.equal(upd.new_values.montant, 200);   // ancienne et nouvelle valeur journalisées
  await ok('DELETE', `/r/payments/${p.id}`, A.compta);
  assert.equal((await ok('GET', '/bootstrap', A.parent)).balances[A.students[0].id].reste, 900);
});

test('Messagerie : canaux autorisés, brouillon, immuabilité, masquage, historique journalisé', async () => {
  const rec = await ok('GET', '/recipients', A.parent);
  assert.ok(rec.some(r => r.role === 'Enseignant') && rec.some(r => r.role === 'Administrateur'));
  assert.ok(!rec.some(r => r.role === 'Parent'));
  const recB = await ok('GET', '/recipients', B.parent); assert.ok(!recB.some(r => r.email.includes('.c.')));
  const teacherRec = rec.find(r => r.role === 'Enseignant');
  const adminRec = rec.find(r => r.role === 'Administrateur');
  await denied('POST', '/messages', A.parent, { recipient_id: B.teacherUser.id, objet: 'x', corps: 'y' }, [403]);                 // autre école
  await denied('POST', '/messages', A.eleve, { recipient_id: adminRec.id, objet: 'x', corps: 'y' }, [403]);                       // élève : lecture seule
  const parentsOfA = (await ok('GET', '/users', A.admin)).find(u => u.role === 'Comptable');
  await denied('POST', '/messages', A.teacher, { recipient_id: parentsOfA.id, objet: 'x', corps: 'y' }, [403]);                   // enseignant ↔ comptable : non
  const d = await ok('POST', '/messages', A.parent, { recipient_id: teacherRec.id, objet: 'Question', corps: 'Bonjour', draft: true });
  assert.equal((await ok('GET', '/messages?box=drafts', A.parent)).length, 1);
  assert.equal((await ok('GET', '/messages?box=inbox', A.teacher)).filter(m => m.objet === 'Question').length, 0);               // un brouillon n'est pas reçu
  await ok('PUT', `/messages/${d.id}`, A.parent, { corps: 'Bonjour, une question sur les devoirs', send: true });
  const got = (await ok('GET', '/messages?box=inbox', A.teacher)).find(m => m.objet === 'Question');
  assert.ok(got && got.lu === false);
  await denied('PUT', `/messages/${d.id}`, A.parent, { corps: 'modifié' }, [409]);        // immuable
  await denied('DELETE', `/messages/${d.id}`, A.parent, undefined, [409]);                 // immuable
  await denied('DELETE', `/messages/${d.id}`, A.teacher, undefined, [403]);                // le destinataire ne supprime pas
  await denied('GET', `/messages/${d.id}`, B.admin);                                       // autre école
  await denied('GET', `/messages/${d.id}`, A.compta);                                      // tiers
  const read = await ok('GET', `/messages/${d.id}`, A.teacher); assert.equal(read.thread.length, 1);
  assert.equal((await ok('GET', '/notifications', A.teacher)).items.some(n => n.titre === 'Nouveau message'), true);
  const audit = await ok('GET', '/audit', A.admin); assert.ok(audit.some(a => a.action === 'read_message' && a.entity_id === String(d.id)));
  await ok('POST', `/messages/${d.id}/hide`, A.teacher);
  assert.ok(!(await ok('GET', '/messages?box=inbox', A.teacher)).some(m => m.id === d.id));
  assert.ok((await ok('GET', '/messages?box=sent', A.parent)).some(m => m.id === d.id), 'la copie de l’expéditeur est conservée');
  const d2 = await ok('POST', '/messages', A.parent, { recipient_id: adminRec.id, objet: 'Brouillon à jeter', corps: 'x', draft: true });
  await ok('DELETE', `/messages/${d2.id}`, A.parent);
});

test('Annonces : audience, notification, immuabilité', async () => {
  const a = await ok('POST', '/announcements', A.admin, { titre: 'Réunion parents', corps: 'Vendredi 18h', audience: 'parents' });
  assert.ok((await ok('GET', '/announcements', A.parent)).some(x => x.id === a.id));
  assert.ok(!(await ok('GET', '/announcements', A.teacher)).some(x => x.id === a.id));
  assert.ok(!(await ok('GET', '/announcements', B.parent)).some(x => x.id === a.id));
  assert.ok((await ok('GET', '/notifications', A.parent)).items.some(n => n.titre.includes('Réunion')));
  await denied('PUT', `/announcements/${a.id}`, A.admin, { titre: 'x' }, [409]);
  await denied('DELETE', `/announcements/${a.id}`, A.admin, undefined, [409]);
  await denied('POST', '/announcements', A.parent, { titre: 'x', corps: 'y' }, [403]);
});

test('Devoirs : publication, dépôt élève, note, correction après échéance, vu parent, fichiers isolés', async () => {
  const hw = await ok('POST', '/r/homework', A.teacher, { titre: 'Exercice 4', description: 'Page 12', class_id: A.cls.id, subject_id: A.maths.id, echeance: '2999-01-01', bareme: 10 });
  await denied('POST', '/r/homework', A.teacher, { titre: 'x', class_id: A.cls2.id, echeance: '2999-01-01' }, [403]);          // classe non affectée
  assert.ok((await ok('GET', '/notifications', A.eleve)).items.some(n => n.titre === 'Nouveau devoir'));
  assert.ok((await ok('GET', '/notifications', A.parent)).items.some(n => n.titre === 'Nouveau devoir'));
  assert.ok(!(await ok('GET', '/r/homework', B.eleve)).some(h => h.id === hw.id));
  const att = await ok('PUT', `/homework/${hw.id}/attachment`, A.teacher, { filename: 'enonce.pdf', data: b64('%PDF-1.4 fake') });
  await denied('PUT', `/homework/${hw.id}/attachment`, A.teacher, { filename: 'virus.exe', data: b64('MZ') }, [400]);
  assert.equal((await call('GET', `/files/${att.file_id}`, A.eleve)).status, 200);
  await denied('GET', `/files/${att.file_id}`, B.eleve);                                                                       // autre école
  await denied('GET', `/files/${att.file_id}`, B.admin);
  const dep = await ok('PUT', `/homework/${hw.id}/submission`, A.eleve, { contenu: 'Mon travail', file: { filename: 'travail.txt', data: b64('réponse') } });
  await ok('PUT', `/homework/${hw.id}/submission`, A.eleve, { contenu: 'Version corrigée' });                                    // remplacement avant échéance
  assert.ok((await ok('GET', '/notifications', A.teacherUser && A.teacher)).items.some(n => n.titre === 'Travail déposé'));
  const subs = await ok('GET', `/homework/${hw.id}/submissions`, A.teacher);
  assert.equal(subs.items.length, 3 - 1 /* élève 3 supprimé par un test précédent */ );
  const mine = subs.items.find(x => x.student_id === A.students[0].id); assert.equal(mine.statut, 'rendu'); assert.equal(mine.contenu, 'Version corrigée');
  await denied('PUT', `/homework/${hw.id}/submission`, A.parent, { contenu: 'x' }, [403]);                                        // le parent ne dépose pas
  await denied('PATCH', `/homework/${hw.id}/grade/${A.students[0].id}`, A.eleve, { note: 10 }, [403]);
  await denied('PATCH', `/homework/${hw.id}/grade/${A.students[0].id}`, A.teacher, { note: 11 }, [400]);                          // > barème
  const before = await ok('GET', `/homework/${hw.id}/submissions`, A.parent);
  assert.equal(before.items[0].note, null);                                                                                      // note non publiée : invisible
  await ok('PATCH', `/homework/${hw.id}/grade/${A.students[0].id}`, A.teacher, { note: 8.5, commentaire: 'Bien', publier: true });
  const after = await ok('GET', `/homework/${hw.id}/submissions`, A.parent);
  assert.equal(after.items[0].note, 8.5); assert.equal(after.items[0].statut, 'noté');
  assert.ok((await ok('GET', '/notifications', A.eleve)).items.some(n => n.titre === 'Note de devoir publiée'));
  await ok('POST', `/homework/${hw.id}/seen/${A.students[0].id}`, A.parent);
  assert.equal((await ok('GET', `/homework/${hw.id}/submissions`, A.teacher)).items.find(x => x.student_id === A.students[0].id).vu_parent, true);
  await denied('PUT', `/homework/${hw.id}/submission`, A.eleve, { contenu: 'tard' }, [409]);                                       // déjà noté
  // correction : masquée aux élèves/parents avant la date de remise
  await ok('PUT', `/homework/${hw.id}/correction`, A.teacher, { text: 'Réponse : 42', file: { filename: 'corrige.pdf', data: b64('%PDF corrigé') } });
  const hwStudent = (await ok('GET', '/r/homework', A.eleve)).find(h => h.id === hw.id);
  assert.equal(hwStudent.correction_text, null); assert.equal(hwStudent.correction_file_id, null);
  const corrId = (await ok('GET', '/r/homework', A.teacher)).find(h => h.id === hw.id).correction_file_id;
  await denied('GET', `/files/${corrId}`, A.eleve);                                                                              // fichier correction interdit avant l'échéance
  assert.equal((await call('GET', `/files/${corrId}`, A.teacher)).status, 200);
  await pool.query(`UPDATE homework SET echeance='2020-01-01' WHERE id=$1`, [hw.id]);                                            // simule le passage de la date
  assert.equal((await ok('GET', '/r/homework', A.eleve)).find(h => h.id === hw.id).correction_text, 'Réponse : 42');
  assert.equal((await call('GET', `/files/${corrId}`, A.parent)).status, 200);
  const del = await denied('DELETE', `/r/homework/${hw.id}`, A.teacher, undefined, [409]); assert.equal(del.data.needsConfirm, true);
  await ok('DELETE', `/r/homework/${hw.id}?force=1`, A.teacher);
});

test('Retard : dépôt après l’échéance marqué « en retard » ; remplacement interdit', async () => {
  const hw = await ok('POST', '/r/homework', A.admin, { titre: 'Ancien', class_id: A.cls.id, echeance: '2020-01-01' });
  await ok('PUT', `/homework/${hw.id}/submission`, A.eleve, { contenu: 'En retard' });
  const s = await ok('GET', `/homework/${hw.id}/submissions`, A.eleve); assert.equal(s.items[0].statut, 'rendu en retard');
  await denied('PUT', `/homework/${hw.id}/submission`, A.eleve, { contenu: 'Remplacement' }, [409]);
});

test('Pré-inscription par un parent, validation par la direction, import/export CSV', async () => {
  const pre = await ok('POST', '/preinscription', A.parent, { nom: 'Petit', prenom: 'Nouveau', date_naissance: '2020-03-03' });
  const mine = (await ok('GET', '/r/students', A.parent)).find(s => s.id === pre.id); assert.equal(mine.statut, 'preinscrit');
  assert.ok((await ok('GET', '/notifications', A.admin)).items.some(n => n.titre === 'Nouvelle pré-inscription'));
  await ok('PUT', `/r/students/${pre.id}`, A.admin, { statut: 'inscrit', classe_id: A.cls2.id });
  const imp = await ok('POST', '/students/import', A.admin, { rows: [{ nom: 'Import1', prenom: 'Csv', classe: 'CE1 C', date_naissance: '2019-01-01' }, { nom: 'Mauvais', prenom: 'Csv', classe: 'XX Q' }, { nom: '', prenom: 'Vide' }] });
  assert.equal(imp.created, 1); assert.equal(imp.errors.length, 2);
  const csv = await call('GET', '/export/students.csv', A.admin); assert.match(csv.ct, /text\/csv/); assert.ok(csv.data.toString().includes('Import1'));
  assert.ok(!csv.data.toString().includes('D-Nom'), 'le CSV ne doit contenir que l’école courante');
  await denied('POST', '/students/import', A.parent, { rows: [{ nom: 'a', prenom: 'b' }] }, [403]);
});

test('Comptes : création, désactivation, suppression, rôles et liens parent-enfants', async () => {
  const e = `nouveau.parent.${suffix}@example.test`;
  await denied('POST', '/users', A.admin, { email: e, password: 'MotDePasseLong-2026', role: 'Administrateur' }, [400]);          // les directions sont créées par le Super Admin
  await denied('POST', '/users', A.admin, { email: e, password: 'MotDePasseLong-2026', role: 'Parent', student_ids: [] }, [400]);
  const u = await ok('POST', '/users', A.admin, { email: e, password: 'MotDePasseLong-2026', role: 'Parent', nom: 'Nouveau', student_ids: [A.students[1].id] });
  const t = await login(e, 'MotDePasseLong-2026');
  assert.equal((await ok('GET', '/r/students', t)).length, 1);
  await ok('PATCH', `/users/${u.id}`, A.admin, { student_ids: [A.students[0].id, A.students[1].id] });
  assert.equal((await ok('GET', '/r/students', t)).length, 2);
  await denied('POST', '/users', B.admin, { email: e, password: 'MotDePasseLong-2026', role: 'Comptable' }, [409]);                // e-mail unique globalement
  await ok('DELETE', `/users/${u.id}`, A.admin);
  await denied('POST', '/login', null, { email: e, password: 'MotDePasseLong-2026' }, [401]);
  await ok('POST', '/users', A.admin, { email: e, password: 'MotDePasseLong-2026', role: 'Comptable' });                          // l'adresse est de nouveau libre
  const adminAcc = (await ok('GET', '/users', A.admin)).find(x => x.role === 'Administrateur');
  await denied('PATCH', `/users/${adminAcc.id}`, A.admin, { active: false }, [403]);
  await ok('POST', '/password', A.parent, { old_password: 'NouveauMotDePasse-2026', new_password: 'EncoreUnAutre-2026-Mdp' });
  await denied('GET', '/bootstrap', A.parent, undefined, [401]);
  await login(A.emails.parent, 'EncoreUnAutre-2026-Mdp');
  await denied('POST', '/password', A.teacher, { old_password: 'faux', new_password: 'EncoreUnAutre-2026-Mdp' }, [403]);
});

test('Paramètres de l’école et persistance après redémarrage du serveur', async () => {
  await ok('PATCH', '/settings', A.admin, { school: 'École C Renommée', annee: '2026-2027', tarif: 1500, address: 'Sousse' });
  await denied('PATCH', '/settings', A.teacher, { school: 'Pirate', annee: '2026-2027' }, [403]);
  await denied('PATCH', '/settings', A.admin, { school: 'ab', annee: '2026-2027' }, [400]);
  // "redémarrage" : nouvelle instance de l'application sur la même base
  const { createApp } = await import('../src/app.js');
  const s2 = createApp().listen(0); const url = `http://127.0.0.1:${s2.address().port}/api`;
  const r = await (await fetch(url + '/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: A.emails.admin, password: A.pass.admin }) })).json();
  const boot = await (await fetch(url + '/bootstrap', { headers: { Authorization: 'Bearer ' + r.token } })).json();
  assert.equal(boot.settings.school, 'École C Renommée'); assert.ok(boot.data.students.length >= 3);
  await new Promise(x => s2.close(x));
});
