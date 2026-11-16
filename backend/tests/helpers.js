// Tests : utiliser UNIQUEMENT une base de test (nom contenant "test"). Voir docs/TESTS.md
import 'dotenv/config';
import assert from 'node:assert/strict';
const url = process.env.DATABASE_URL || '';
if (!/test/i.test(url.split('/').pop())) throw new Error('Refus : DATABASE_URL doit pointer vers une base dont le nom contient "test" (ne jamais tester sur la vraie base).');
const { createApp } = await import('../src/app.js');
const { migrate, pool } = await import('../src/db.js');
const { hash, newId } = await import('../src/util.js');

export let base, server;
export const suffix = Date.now().toString(36);
export async function start() {
  await migrate();
  // compte propriétaire de test, recréé à chaque exécution (la base est une base de TEST, voir le garde-fou ci-dessus)
  await pool.query("DELETE FROM users WHERE lower(email)=lower($1)", [process.env.SUPERADMIN_EMAIL]);
  await pool.query("INSERT INTO users(id,email,password_hash,nom,prenom,role) VALUES($1,$2,$3,'Owner','Test','SuperAdmin')", [newId(), process.env.SUPERADMIN_EMAIL, await hash(process.env.SUPERADMIN_PASSWORD)]);
  server = createApp().listen(0); base = `http://127.0.0.1:${server.address().port}`;
}
export async function stop() { await new Promise(r => server.close(r)); await pool.end(); }
export { pool };

export async function call(method, path, token, body) {
  const r = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { status: r.status, data, ct, headers: r.headers };
}
export async function login(email, password) { const r = await call('POST', '/login', null, { email, password }); assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.data)}`); return r.data.token; }
export async function ok(method, path, token, body) { const r = await call(method, path, token, body); assert.ok(r.status >= 200 && r.status < 300, `${method} ${path} -> ${r.status} ${JSON.stringify(r.data)}`); return r.data; }
export async function denied(method, path, token, body, codes = [403, 404]) { const r = await call(method, path, token, body); assert.ok(codes.includes(r.status), `${method} ${path}: attendu ${codes}, reçu ${r.status} ${JSON.stringify(r.data)}`); return r; }

export const OWNER = { email: process.env.SUPERADMIN_EMAIL, password: process.env.SUPERADMIN_PASSWORD };
// Crée une école de test complète (via l'API réelle, comme le ferait le Super Admin) avec tous les rôles.
export async function makeSchool(owner, L) {
  const P = x => `${x}_${L}_${suffix}_Password2026`;
  const e = x => `${x}.${L.toLowerCase()}.${suffix}@example.test`;
  const created = await ok('POST', '/saas/schools', owner, { name: `École ${L} Test ${suffix}`, admin_email: e('direction'), admin_password: P('Dir'), admin_nom: 'Dir', plan: 'basic', tarif_annuel: 1000 });
  const admin = await login(e('direction'), P('Dir'));
  const teacher = await ok('POST', '/r/teachers', admin, { nom: `Prof${L}`, prenom: 'Test', email: e('prof'), matiere: 'Maths', password: P('Prof') });
  const cls = await ok('POST', '/r/classes', admin, { niveau: 'CP', section: L, capacite: 3, enseignant_id: teacher.id });
  const cls2 = await ok('POST', '/r/classes', admin, { niveau: 'CE1', section: L, capacite: 30 });
  const subjects = await ok('GET', '/r/subjects', admin);
  const maths = subjects.find(s => s.nom === 'Mathématiques');
  const students = [];
  for (let i = 1; i <= 3; i++) students.push(await ok('POST', '/r/students', admin, { nom: `${L}-Nom${i}`, prenom: `${L}-Élève${i}`, classe_id: cls.id, date_naissance: '2019-05-05' }));
  const outsider = await ok('POST', '/r/students', admin, { nom: `${L}-Autre`, prenom: `${L}-Élève4`, classe_id: cls2.id });
  await ok('POST', '/users', admin, { email: e('parent'), password: P('Parent'), role: 'Parent', nom: 'Parent', student_ids: [students[0].id, students[1].id] });
  await ok('POST', '/users', admin, { email: e('eleve'), password: P('Eleve'), role: 'Élève', nom: 'Eleve', student_id: students[0].id });
  await ok('POST', '/users', admin, { email: e('compta'), password: P('Compta'), role: 'Comptable', nom: 'Compta' });
  const grade = await ok('POST', '/r/grades', admin, { student_id: students[0].id, subject_id: maths.id, evaluation: 'Test', valeur: 15, bareme: 20 });
  const payment = await ok('POST', '/r/payments', admin, { student_id: students[0].id, montant: 100, mode: 'especes' });
  return { L, id: created.id, admin, teacherUser: teacher, teacher: await login(e('prof'), P('Prof')), parent: await login(e('parent'), P('Parent')), eleve: await login(e('eleve'), P('Eleve')), compta: await login(e('compta'), P('Compta')),
    cls, cls2, maths, students, outsider, grade, payment, emails: { admin: e('direction'), parent: e('parent') }, pass: { admin: P('Dir'), parent: P('Parent') } };
}
