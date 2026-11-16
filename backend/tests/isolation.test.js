import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, call, ok, denied, login, makeSchool, OWNER, suffix } from './helpers.js';

let owner, A, B;
before(async () => { await start(); owner = await login(OWNER.email, OWNER.password); A = await makeSchool(owner, 'A'); B = await makeSchool(owner, 'B'); });
after(stop);

const RESOURCES = ['students', 'classes', 'subjects', 'rooms', 'assignments', 'grades', 'absences', 'schedule', 'fees', 'payments', 'homework'];

test('Chaque liste ne contient que des données de SA école (A→B et B→A)', async () => {
  for (const [me, other] of [[A, B], [B, A]]) {
    const students = await ok('GET', '/r/students', me.admin);
    assert.ok(students.length >= 4);
    assert.ok(students.every(s => s.nom.startsWith(me.L + '-')), 'élèves étrangers visibles !');
    assert.ok(!students.some(s => other.students.some(o => o.id === s.id) && s.school_id !== me.id));
    for (const res of RESOURCES) for (const row of await ok('GET', `/r/${res}`, me.admin)) assert.equal(row.school_id, me.id, `${res} fuit d'une autre école`);
    const boot = await ok('GET', '/bootstrap', me.admin);
    assert.equal(boot.data.students.length, students.length);
    assert.ok(boot.data.teachers.every(t => t.email.includes(`.${me.L.toLowerCase()}.`)));
  }
});

test('Accès direct par identifiant à une donnée de l’autre école : introuvable / refusé', async () => {
  for (const [me, other] of [[A, B], [B, A]]) {
    await denied('PUT', `/r/students/${other.students[0].id}`, me.admin, { nom: 'Pirate' });
    await denied('DELETE', `/r/students/${other.students[0].id}`, me.admin);
    await denied('PUT', `/r/payments/${other.payment.id}`, me.admin, { montant: 1 });
    await denied('DELETE', `/r/payments/${other.payment.id}`, me.admin);
    await denied('PUT', `/r/grades/${other.grade.id}`, me.admin, { valeur: 1 });
    await denied('PUT', `/r/classes/${other.cls.id}`, me.admin, { capacite: 1 });
    await denied('GET', `/pdf/bulletin/${other.students[0].id}`, me.admin);
    await denied('GET', `/pdf/recu/${other.payment.id}`, me.admin);
    await denied('GET', `/homework/1/submissions`, me.teacher);
    await denied('PUT', `/users/${other.teacherUser.id}`, me.admin, {}, [403, 404, 405]);
    await denied('PATCH', `/users/${other.teacherUser.id}`, me.admin, { active: false });
    await denied('DELETE', `/r/teachers/${other.teacherUser.id}`, me.admin);
    await denied('POST', `/users/${other.teacherUser.id}/reset-password`, me.admin, { password: 'UnMotDePasseLong123' });
  }
});

test('Créer une donnée qui référence une ligne d’une autre école est refusé', async () => {
  await denied('POST', '/r/students', A.admin, { nom: 'X', prenom: 'Y', classe_id: B.cls.id }, [400]);
  await denied('POST', '/r/grades', A.admin, { student_id: B.students[0].id, subject_id: A.maths.id, evaluation: 'x', valeur: 10 }, [400]);
  await denied('POST', '/r/payments', A.admin, { student_id: B.students[0].id, montant: 10, mode: 'especes' }, [400]);
  await denied('POST', '/r/classes', A.admin, { niveau: 'CP', section: 'Z', capacite: 10, enseignant_id: B.teacherUser.id }, [400]);
  await denied('POST', '/users', A.admin, { email: `x.${suffix}@example.test`, password: 'UnMotDePasseLong123', role: 'Parent', student_ids: [B.students[0].id] }, [400]);
});

test('Le serveur ignore school_id envoyé par le navigateur', async () => {
  const s = await ok('POST', '/r/students', A.admin, { nom: 'Inject', prenom: 'Test', school_id: B.id, classe_id: A.cls2.id });
  assert.equal(s.school_id, A.id);
  const list = await ok('GET', `/r/students?school_id=${B.id}`, A.admin);
  assert.ok(list.every(x => x.school_id === A.id));
});

test('La base elle-même refuse une référence inter-écoles (clés étrangères composites)', async () => {
  const { pool } = await import('./helpers.js');
  await assert.rejects(pool.query('UPDATE students SET classe_id=$1 WHERE id=$2 AND school_id=$3', [B.cls.id, A.students[0].id, A.id]), /foreign key/i);
});

test('Parents, enseignants, élèves : périmètre strict dans leur école', async () => {
  for (const me of [A, B]) {
    const kids = await ok('GET', '/r/students', me.parent);
    assert.deepEqual(kids.map(k => k.id).sort(), [me.students[0].id, me.students[1].id].sort());
    assert.equal((await ok('GET', '/r/payments', me.parent)).length, 1);
    await denied('GET', `/pdf/bulletin/${me.students[2].id}`, me.parent);           // élève non lié
    await denied('GET', `/pdf/recu/${me.payment.id}`, me.eleve, undefined, [403]);   // élève : pas de paiements
    assert.deepEqual((await ok('GET', '/r/students', me.eleve)).map(x => x.id), [me.students[0].id]);
    await denied('GET', '/r/payments', me.eleve, undefined, [403]);
    const tstudents = await ok('GET', '/r/students', me.teacher);                    // enseignant : seulement sa classe CP
    assert.ok(tstudents.length === 3 && !tstudents.some(s => s.id === me.outsider.id));
    await denied('POST', '/r/grades', me.teacher, { student_id: me.outsider.id, subject_id: me.maths.id, evaluation: 'x', valeur: 10 }, [403]);
    await denied('POST', '/r/students', me.parent, { nom: 'a', prenom: 'b' }, [403]);
    await denied('POST', '/r/payments', me.teacher, { student_id: me.students[0].id, montant: 5, mode: 'especes' }, [403]);
    await denied('GET', '/r/fees', me.parent, undefined, [403]);
    assert.deepEqual(await ok('GET', '/users', me.parent), []);
  }
});

test('Le Super Admin entre dans École A puis revient ; son jeton ne donne pas accès au SaaS', async () => {
  const enter = await ok('POST', `/saas/schools/${A.id}/enter`, owner);
  const boot = await ok('GET', '/bootstrap', enter.token);
  assert.equal(boot.user.impersonated, true); assert.equal(boot.user.school_id, A.id);
  assert.ok(boot.data.students.every(s => s.nom.startsWith('A-') || s.nom === 'Inject'));
  await denied('GET', '/saas/schools', enter.token);                 // pas de double casquette
  const ownerBoot = await ok('GET', '/bootstrap', owner);
  assert.equal(ownerBoot.data, null);
  await denied('GET', '/saas/schools', A.admin);                      // un admin d'école n'est pas Super Admin
  await denied('POST', `/saas/schools/${A.id}/enter`, A.admin);
  await denied('GET', '/r/students', owner);                          // le Super Admin hors contexte n'a pas de données scolaires
  const audit = await ok('GET', '/audit', A.admin);
  assert.ok(audit.some(a => a.action === 'enter_school' || a.impersonated));
});

test('Un administrateur de l’école A ne peut pas se faire passer pour le Super Admin avec un jeton modifié', async () => {
  const [h, p, s] = A.admin.split('.'); const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), ctx: B.id })).toString('base64url');
  await denied('GET', '/bootstrap', `${h}.${forged}.${s}`, undefined, [401]);
  // même avec un jeton valide portant ctx, un compte non Super Admin n'est jamais "en contexte"
  const jwt = (await import('jsonwebtoken')).default;
  const decoded = jwt.decode(A.admin);
  const own = jwt.sign({ sub: decoded.sub, v: decoded.v, ctx: B.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const boot = await ok('GET', '/bootstrap', own);
  assert.equal(boot.user.school_id, A.id);
});
