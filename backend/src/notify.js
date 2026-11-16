// Notifications internes (cloche + messagerie) et journal d'envoi.
// E-mail / push : non branchés dans cette version (voir docs) — le journal indique le canal réellement utilisé.
export async function notify(db, schoolId, userId, titre, corps, lien) {
  await db.query('INSERT INTO notifications(school_id,user_id,titre,corps,lien) VALUES($1,$2,$3,$4,$5)', [schoolId, userId, titre, corps, lien]);
}
export async function notifyMany(db, schoolId, userIds, titre, corps, lien) {
  for (const id of new Set(userIds)) { await notify(db, schoolId, id, titre, corps, lien); await logDelivery(db, schoolId, id, 'notification', titre, 'envoye', null); }
}
export async function logDelivery(db, schoolId, recipientId, canal, sujet, statut, detail) {
  await db.query('INSERT INTO delivery_log(school_id,recipient_id,canal,sujet,statut,detail) VALUES($1,$2,$3,$4,$5,$6)', [schoolId, recipientId, canal, sujet, statut, detail]);
}
export async function parentsOfStudent(db, schoolId, studentId) {
  return (await db.query(`SELECT u.id,u.email FROM student_parents sp JOIN users u ON u.id=sp.parent_id AND u.school_id=sp.school_id
    WHERE sp.school_id=$1 AND sp.student_id=$2 AND u.deleted_at IS NULL AND u.active`, [schoolId, studentId])).rows;
}
// élèves (comptes) et parents de tous les élèves d'une classe
export async function usersOfClass(db, schoolId, classId) {
  const { rows } = await db.query(`SELECT st.compte_id AS id FROM students st WHERE st.school_id=$1 AND st.classe_id=$2 AND st.deleted_at IS NULL AND st.compte_id IS NOT NULL
    UNION SELECT sp.parent_id FROM student_parents sp JOIN students st ON st.id=sp.student_id AND st.school_id=sp.school_id
    WHERE sp.school_id=$1 AND st.classe_id=$2 AND st.deleted_at IS NULL`, [schoolId, classId]);
  return rows.map(r => r.id);
}
// Solde : (grille tarifaire applicable, sinon tarif annuel de l'école) − paiements de l'année
export async function balanceOf(db, schoolId, studentId) {
  const { rows: [s] } = await db.query('SELECT annee_scolaire, tarif_annuel FROM schools WHERE id=$1', [schoolId]);
  const { rows: [c] } = await db.query('SELECT c.niveau FROM students st LEFT JOIN classes c ON c.id=st.classe_id AND c.school_id=st.school_id WHERE st.id=$1 AND st.school_id=$2', [studentId, schoolId]);
  const f = (await db.query(`SELECT count(*)::int n, COALESCE(sum(montant),0) total FROM fees WHERE school_id=$1 AND deleted_at IS NULL AND annee_scolaire=$2 AND (niveau IS NULL OR niveau=$3)`, [schoolId, s.annee_scolaire, c?.niveau ?? '']))
    .rows[0];
  const du = f.n ? Number(f.total) : Number(s.tarif_annuel);
  const paye = Number((await db.query('SELECT COALESCE(sum(montant),0) t FROM payments WHERE school_id=$1 AND student_id=$2 AND annee_scolaire=$3 AND deleted_at IS NULL', [schoolId, studentId, s.annee_scolaire])).rows[0].t);
  return { du, paye, reste: Math.max(0, du - paye) };
}
