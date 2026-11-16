// Description des modules : colonnes du tableau (cols) et champs du formulaire (fields).
// Types de champ : text, number, date, time, textarea, bool, password, select (opts.options), ref (opts.list)
const yn = v => v ? 'Oui' : 'Non';
export const MODES = [['especes', 'Espèces'], ['virement', 'Virement'], ['mobile_money', 'Mobile money']];
export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const modeLabel = v => (MODES.find(m => m[0] === v) || [])[1] || v;

export const schemas = {
  students: { title: 'Élèves', cols: [['nom', 'Nom'], ['prenom', 'Prénom'], ['classe_label', 'Classe'], ['parent_label', 'Parent / tuteur'], ['annee_scolaire', 'Année'], ['statut', 'Statut', v => v === 'preinscrit' ? 'Pré-inscrit' : 'Inscrit']],
    fields: [['nom', 'Nom', 'text', { req: 1 }], ['prenom', 'Prénom', 'text', { req: 1 }], ['date_naissance', 'Date de naissance', 'date'], ['classe_id', 'Classe', 'ref', { list: 'classes' }], ['parent_label', 'Parent / tuteur (nom)', 'text'], ['medical', 'Antécédents médicaux', 'textarea'], ['statut', 'Statut', 'select', { options: [['inscrit', 'Inscrit'], ['preinscrit', 'Pré-inscrit']] }]] },
  classes: { title: 'Classes', cols: [['label', 'Classe'], ['enseignant_label', 'Titulaire'], ['capacite', 'Capacité'], ['effectif', 'Effectif'], ['annee_scolaire', 'Année']],
    fields: [['niveau', 'Niveau (CP, CE1…)', 'text', { req: 1 }], ['section', 'Section', 'text', { req: 1 }], ['capacite', 'Capacité maximale', 'number', { req: 1 }], ['enseignant_id', 'Enseignant titulaire', 'ref', { list: 'teachers' }]] },
  teachers: { title: 'Enseignants', cols: [['nom', 'Nom'], ['prenom', 'Prénom'], ['email', 'E-mail'], ['matiere', 'Matière principale']],
    fields: [['nom', 'Nom', 'text', { req: 1 }], ['prenom', 'Prénom', 'text'], ['email', 'E-mail (identifiant de connexion)', 'text', { req: 1 }], ['matiere', 'Matière principale', 'text'], ['password', 'Mot de passe initial (12 caractères min.)', 'password', { req: 1, createOnly: 1 }]] },
  assignments: { title: 'Affectations enseignant', cols: [['teacher_label', 'Enseignant'], ['subject_label', 'Matière'], ['class_label', 'Classe']],
    fields: [['teacher_id', 'Enseignant', 'ref', { list: 'teachers', req: 1 }], ['subject_id', 'Matière', 'ref', { list: 'subjects', req: 1 }], ['class_id', 'Classe', 'ref', { list: 'classes', req: 1 }]] },
  subjects: { title: 'Matières', cols: [['nom', 'Matière'], ['coefficient', 'Coefficient'], ['niveau', 'Niveau']],
    fields: [['nom', 'Nom', 'text', { req: 1 }], ['coefficient', 'Coefficient', 'number', { req: 1 }], ['niveau', 'Niveau concerné', 'text']] },
  rooms: { title: 'Salles', cols: [['nom', 'Salle'], ['capacite', 'Capacité'], ['disponible', 'Disponible', yn]],
    fields: [['nom', 'Nom', 'text', { req: 1 }], ['capacite', 'Capacité', 'number', { req: 1 }], ['disponible', 'Disponible', 'bool']] },
  grades: { title: 'Notes et évaluations', cols: [['student_label', 'Élève'], ['subject_label', 'Matière'], ['evaluation', 'Évaluation'], ['type', 'Type'], ['trimestre', 'Trim.'], ['valeur', 'Note', (v, r) => `${v} / ${r.bareme}`], ['coefficient', 'Coef.']],
    fields: [['student_id', 'Élève', 'ref', { list: 'students', req: 1 }], ['subject_id', 'Matière', 'ref', { list: 'subjects', req: 1 }], ['evaluation', 'Évaluation (ex. Contrôle 1)', 'text', { req: 1 }], ['type', 'Type', 'select', { options: [['controle', 'Contrôle continu'], ['examen', 'Examen']] }], ['trimestre', 'Trimestre', 'select', { options: [['1', '1'], ['2', '2'], ['3', '3']] }], ['valeur', 'Note obtenue', 'number', { req: 1 }], ['bareme', 'Barème (sur…)', 'number'], ['date_eval', 'Date', 'date']] },
  absences: { title: 'Absences', cols: [['student_label', 'Élève'], ['date_absence', 'Date'], ['motif', 'Motif'], ['justifiee', 'Justifiée', yn], ['justification', 'Justification du parent']],
    fields: [['student_id', 'Élève', 'ref', { list: 'students', req: 1 }], ['date_absence', 'Date', 'date', { req: 1 }], ['motif', 'Motif', 'text'], ['justifiee', 'Justifiée', 'bool']] },
  schedule: { title: 'Emploi du temps', cols: [['jour', 'Jour'], ['debut', 'Début'], ['fin', 'Fin'], ['class_label', 'Classe'], ['subject_label', 'Matière'], ['teacher_label', 'Enseignant'], ['room_label', 'Salle']],
    fields: [['class_id', 'Classe', 'ref', { list: 'classes', req: 1 }], ['subject_id', 'Matière', 'ref', { list: 'subjects' }], ['teacher_id', 'Enseignant', 'ref', { list: 'teachers' }], ['room_id', 'Salle', 'ref', { list: 'rooms' }], ['jour', 'Jour', 'select', { options: DAYS.map(d => [d, d]), req: 1 }], ['debut', 'Début', 'time', { req: 1 }], ['fin', 'Fin', 'time', { req: 1 }]] },
  fees: { title: 'Grille tarifaire', cols: [['libelle', 'Libellé'], ['montant', 'Montant (DT)'], ['niveau', 'Niveau', v => v || 'Tous'], ['annee_scolaire', 'Année']],
    fields: [['libelle', 'Libellé (inscription, scolarité, tranche…)', 'text', { req: 1 }], ['montant', 'Montant (DT)', 'number', { req: 1 }], ['niveau', 'Niveau concerné (vide = tous)', 'text']] },
  payments: { title: 'Paiements', cols: [['numero_recu', 'Reçu n°'], ['student_label', 'Élève'], ['montant', 'Montant', v => Number(v).toFixed(3) + ' DT'], ['mode', 'Mode', modeLabel], ['date_paiement', 'Date'], ['objet', 'Objet']],
    fields: [['student_id', 'Élève', 'ref', { list: 'students', req: 1 }], ['montant', 'Montant (DT)', 'number', { req: 1 }], ['mode', 'Mode de paiement', 'select', { options: MODES, req: 1 }], ['date_paiement', 'Date', 'date'], ['objet', 'Objet du paiement', 'text']] },
  homework: { title: 'Devoirs', cols: [['titre', 'Titre'], ['class_label', 'Classe'], ['subject_label', 'Matière'], ['echeance', 'Date de remise'], ['nb_depots', 'Dépôts']],
    fields: [['titre', 'Titre', 'text', { req: 1 }], ['description', 'Description', 'textarea'], ['class_id', 'Classe', 'ref', { list: 'classes', req: 1 }], ['subject_id', 'Matière', 'ref', { list: 'subjects' }], ['echeance', 'Date de remise', 'date', { req: 1 }], ['bareme', 'Barème (sur…)', 'number']] }
};
export const refLabel = {
  students: s => `${s.prenom} ${s.nom}${s.classe_label ? ' (' + s.classe_label + ')' : ''}`, classes: c => c.label, teachers: t => `${t.prenom || ''} ${t.nom}`.trim(),
  subjects: s => s.nom, rooms: r => r.nom
};
export const EDIT = {
  students: ['Administrateur', 'Comptable'], classes: ['Administrateur'], teachers: ['Administrateur'], assignments: ['Administrateur'], subjects: ['Administrateur'], rooms: ['Administrateur'],
  grades: ['Administrateur', 'Enseignant'], absences: ['Administrateur', 'Enseignant'], schedule: ['Administrateur'], fees: ['Administrateur', 'Comptable'], payments: ['Administrateur', 'Comptable'], homework: ['Administrateur', 'Enseignant']
};
