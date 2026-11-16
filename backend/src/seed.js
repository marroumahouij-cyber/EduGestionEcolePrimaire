// Données de DÉVELOPPEMENT : École A et École B avec comptes de démonstration.
// Idempotent : ne recrée rien si l'école existe déjà. Interdit en production (voir index.js).
import { pool, tx } from './db.js';
import { newId, hash } from './util.js';

const SUBJECTS = [['Arabe', 3], ['Français', 3], ['Mathématiques', 3], ['Éveil scientifique', 2], ['Anglais', 1], ['Éducation civique', 1]];

export const DEV_ACCOUNTS = L => {
  const l = L.toLowerCase(), d = `ecole-${l}.test`;
  return { admin: `admin.${l}@${d}`, enseignant: `enseignant.${l}@${d}`, parent: `parent.${l}@${d}`, eleve: `eleve.${l}@${d}`, comptable: `comptable.${l}@${d}` };
};

async function seedSchool(L, password, log) {
  const slug = `ecole-${L.toLowerCase()}`;
  if ((await pool.query('SELECT 1 FROM schools WHERE slug=$1', [slug])).rowCount) { log(`École ${L} déjà présente : ignorée.`); return; }
  const acc = DEV_ACCOUNTS(L), pwd = await hash(password);
  await tx(async db => {
    const { rows: [s] } = await db.query(`INSERT INTO schools(name,slug,address,email,phone,status,plan,annee_scolaire,tarif_annuel) VALUES($1,$2,$3,$4,$5,'active','pro','2026-2027',1200) RETURNING id`,
      [`École ${L}`, slug, `${L === 'A' ? '12 rue des Oliviers' : '8 avenue de la Liberté'}, Tunis`, `contact@${slug}.test`, L === 'A' ? '71 000 001' : '71 000 002']);
    const sid = s.id;
    const user = async (email, nom, prenom, role, matiere = null) => { const id = newId(); await db.query('INSERT INTO users(id,school_id,email,password_hash,nom,prenom,role,matiere) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id, sid, email, pwd, nom, prenom, role, matiere]); return id; };
    const admin = await user(acc.admin, `Directeur-${L}`, 'Karim', 'Administrateur');
    const teacher = await user(acc.enseignant, `Saidi-${L}`, 'Sonia', 'Enseignant', 'Français');
    const parent = await user(acc.parent, `Parent-${L}`, 'Nadia', 'Parent');
    const pupil = await user(acc.eleve, `Élève1-${L}`, `${L}-Élève1`, 'Élève');
    await user(acc.comptable, `Comptable-${L}`, 'Hichem', 'Comptable');
    const subj = {}; for (const [nom, coef] of SUBJECTS) subj[nom] = (await db.query('INSERT INTO subjects(school_id,nom,coefficient) VALUES($1,$2,$3) RETURNING id', [sid, nom, coef])).rows[0].id;
    const cls = async (niveau, section, cap, t) => (await db.query('INSERT INTO classes(school_id,niveau,section,capacite,enseignant_id,annee_scolaire) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [sid, niveau, section, cap, t, '2026-2027'])).rows[0].id;
    const cp = await cls('CP', 'A', 25, teacher), ce1 = await cls('CE1', 'A', 25, null);
    await db.query('INSERT INTO teacher_assignments(school_id,teacher_id,subject_id,class_id) VALUES($1,$2,$3,$4),($1,$2,$5,$4)', [sid, teacher, subj['Français'], cp, subj['Arabe']]);
    const room = (await db.query('INSERT INTO rooms(school_id,nom,capacite) VALUES($1,$2,25) RETURNING id', [sid, `Salle ${L}1`])).rows[0].id;
    const students = [];
    for (let i = 1; i <= 5; i++) students.push((await db.query(`INSERT INTO students(school_id,nom,prenom,date_naissance,classe_id,annee_scolaire,parent_label,compte_id) VALUES($1,$2,$3,$4,$5,'2026-2027',$6,$7) RETURNING id`,
      [sid, `${L}-Famille${i}`, `${L}-Élève${i}`, `2019-0${i}-15`, i <= 3 ? cp : ce1, `Famille ${L}${i}`, i === 1 ? pupil : null])).rows[0].id);
    await db.query('INSERT INTO student_parents(school_id,student_id,parent_id) VALUES($1,$2,$3),($1,$4,$3)', [sid, students[0], parent, students[1]]);
    for (const [st, sj, v, ev] of [[0, 'Français', 16, 'Dictée 1'], [0, 'Mathématiques', 14, 'Contrôle 1'], [1, 'Français', 12, 'Dictée 1'], [2, 'Arabe', 15, 'Contrôle 1']])
      await db.query(`INSERT INTO grades(school_id,student_id,subject_id,evaluation,valeur,annee_scolaire) VALUES($1,$2,$3,$4,$5,'2026-2027')`, [sid, students[st], subj[sj], ev, v]);
    await db.query(`INSERT INTO fees(school_id,libelle,montant,annee_scolaire) VALUES($1,'Frais de scolarité annuels',1200,'2026-2027')`, [sid]);
    const pay = (await db.query(`INSERT INTO payments(school_id,student_id,montant,mode,date_paiement,objet,annee_scolaire,created_by) VALUES($1,$2,400,'especes','2026-10-20','Scolarité — 1re tranche','2026-2027',$3) RETURNING id`, [sid, students[0], admin])).rows[0].id;
    await db.query(`UPDATE payments SET numero_recu=$3 WHERE id=$1 AND school_id=$2`, [pay, sid, `REC-2026-${String(pay).padStart(5, '0')}`]);
    await db.query(`INSERT INTO homework(school_id,titre,description,class_id,subject_id,teacher_id,echeance) VALUES($1,'Lecture du chapitre 2','Lire et résumer le chapitre 2.',$2,$3,$4,'2026-12-20')`, [sid, cp, subj['Français'], teacher]);
    await db.query(`INSERT INTO schedule(school_id,class_id,subject_id,teacher_id,room_id,jour,debut,fin,annee_scolaire) VALUES($1,$2,$3,$4,$5,'Lundi','08:00','09:00','2026-2027')`, [sid, cp, subj['Français'], teacher, room]);
    await db.query(`INSERT INTO absences(school_id,student_id,date_absence,motif,annee_scolaire) VALUES($1,$2,'2026-11-03','Maladie','2026-2027')`, [sid, students[0]]);
    await db.query(`INSERT INTO announcements(school_id,author_id,titre,corps,audience) VALUES($1,$2,'Bienvenue','Bienvenue dans l’espace numérique de l’école.','tous')`, [sid, admin]);
  });
  log(`École ${L} créée avec ses comptes de développement.`);
}

export async function seedDev(log = console.log) {
  await seedSchool('A', process.env.DEV_PASSWORD_A || 'EcoleA-Dev-2026', log);
  await seedSchool('B', process.env.DEV_PASSWORD_B || 'EcoleB-Dev-2026', log);
}
