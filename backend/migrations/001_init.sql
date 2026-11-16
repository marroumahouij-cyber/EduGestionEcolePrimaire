-- EduGestion — schéma relationnel multi-écoles.
-- RÈGLE : chaque table métier porte school_id. Les clés étrangères sont COMPOSITES
-- (id, school_id) : la base de données refuse elle-même qu'une ligne de l'école A
-- référence une ligne de l'école B.

CREATE TABLE schools (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(200) NOT NULL,
  slug             VARCHAR(60)  NOT NULL UNIQUE,
  address          VARCHAR(300),
  email            VARCHAR(254),
  phone            VARCHAR(40),
  status           VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('trial','active','suspended','archived')),
  plan             VARCHAR(30)  NOT NULL DEFAULT 'basic',
  subscription_end DATE,
  annee_scolaire   VARCHAR(9)   NOT NULL DEFAULT '2026-2027',
  tarif_annuel     NUMERIC(10,3) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  archived_at      TIMESTAMPTZ
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  school_id     INT REFERENCES schools(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  nom           VARCHAR(100) NOT NULL DEFAULT '',
  prenom        VARCHAR(100) NOT NULL DEFAULT '',
  role          VARCHAR(20) NOT NULL CHECK (role IN ('SuperAdmin','Administrateur','Enseignant','Parent','Élève','Comptable')),
  matiere       VARCHAR(100),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at    TIMESTAMPTZ,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, school_id),
  CHECK ((role = 'SuperAdmin' AND school_id IS NULL) OR (role <> 'SuperAdmin' AND school_id IS NOT NULL))
);
-- e-mail unique dans TOUTE la base (évite l'ambiguïté de connexion entre écoles)
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));
CREATE INDEX users_school_idx ON users (school_id, role);

CREATE TABLE classes (
  id SERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  niveau VARCHAR(30) NOT NULL, section VARCHAR(10) NOT NULL DEFAULT 'A',
  capacite INT NOT NULL CHECK (capacite BETWEEN 1 AND 100),
  enseignant_id TEXT, annee_scolaire VARCHAR(9) NOT NULL, deleted_at TIMESTAMPTZ,
  UNIQUE (id, school_id),
  FOREIGN KEY (enseignant_id, school_id) REFERENCES users(id, school_id)
);
CREATE INDEX classes_school_idx ON classes (school_id);

CREATE TABLE subjects (
  id SERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  nom VARCHAR(100) NOT NULL, coefficient NUMERIC(4,1) NOT NULL DEFAULT 1 CHECK (coefficient > 0),
  niveau VARCHAR(30), deleted_at TIMESTAMPTZ, UNIQUE (id, school_id)
);
CREATE INDEX subjects_school_idx ON subjects (school_id);

CREATE TABLE rooms (
  id SERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  nom VARCHAR(100) NOT NULL, capacite INT NOT NULL CHECK (capacite > 0),
  disponible BOOLEAN NOT NULL DEFAULT TRUE, deleted_at TIMESTAMPTZ, UNIQUE (id, school_id)
);

-- Un enseignant peut être associé à plusieurs matières et plusieurs classes
CREATE TABLE teacher_assignments (
  id SERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL, subject_id INT NOT NULL, class_id INT NOT NULL,
  UNIQUE (school_id, teacher_id, subject_id, class_id),
  FOREIGN KEY (teacher_id, school_id) REFERENCES users(id, school_id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id, school_id) REFERENCES subjects(id, school_id),
  FOREIGN KEY (class_id, school_id) REFERENCES classes(id, school_id)
);

CREATE TABLE students (
  id SERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  nom VARCHAR(100) NOT NULL, prenom VARCHAR(100) NOT NULL, date_naissance DATE,
  parent_label VARCHAR(150), medical TEXT,
  classe_id INT, compte_id TEXT, annee_scolaire VARCHAR(9) NOT NULL,
  statut VARCHAR(20) NOT NULL DEFAULT 'inscrit' CHECK (statut IN ('preinscrit','inscrit')),
  deleted_at TIMESTAMPTZ, UNIQUE (id, school_id),
  FOREIGN KEY (classe_id, school_id) REFERENCES classes(id, school_id),
  FOREIGN KEY (compte_id, school_id) REFERENCES users(id, school_id)
);
CREATE INDEX students_school_idx ON students (school_id, classe_id);

-- Un parent peut avoir plusieurs enfants ; un enfant peut avoir plusieurs tuteurs
CREATE TABLE student_parents (
  school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id INT NOT NULL, parent_id TEXT NOT NULL,
  PRIMARY KEY (school_id, student_id, parent_id),
  FOREIGN KEY (student_id, school_id) REFERENCES students(id, school_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id, school_id) REFERENCES users(id, school_id) ON DELETE CASCADE
);

CREATE TABLE grades (
  id SERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id INT NOT NULL, subject_id INT NOT NULL,
  evaluation VARCHAR(120) NOT NULL, type VARCHAR(20) NOT NULL DEFAULT 'controle' CHECK (type IN ('controle','examen')),
  trimestre INT NOT NULL DEFAULT 1 CHECK (trimestre BETWEEN 1 AND 3),
  valeur NUMERIC(5,2) NOT NULL CHECK (valeur >= 0), bareme NUMERIC(5,1) NOT NULL DEFAULT 20 CHECK (bareme > 0),
  date_eval DATE NOT NULL DEFAULT CURRENT_DATE, annee_scolaire VARCHAR(9) NOT NULL, deleted_at TIMESTAMPTZ,
  CHECK (valeur <= bareme),
  UNIQUE (id, school_id),
  FOREIGN KEY (student_id, school_id) REFERENCES students(id, school_id),
  FOREIGN KEY (subject_id, school_id) REFERENCES subjects(id, school_id)
);
CREATE INDEX grades_student_idx ON grades (school_id, student_id);

CREATE TABLE absences (
  id SERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id INT NOT NULL, date_absence DATE NOT NULL, motif VARCHAR(300),
  justifiee BOOLEAN NOT NULL DEFAULT FALSE, justification TEXT, annee_scolaire VARCHAR(9) NOT NULL, deleted_at TIMESTAMPTZ,
  UNIQUE (id, school_id), FOREIGN KEY (student_id, school_id) REFERENCES students(id, school_id)
);

CREATE TABLE schedule (
  id SERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id INT NOT NULL, subject_id INT, teacher_id TEXT, room_id INT,
  jour VARCHAR(10) NOT NULL CHECK (jour IN ('Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi')),
  debut TIME NOT NULL, fin TIME NOT NULL, annee_scolaire VARCHAR(9) NOT NULL, deleted_at TIMESTAMPTZ,
  CHECK (debut < fin), UNIQUE (id, school_id),
  FOREIGN KEY (class_id, school_id) REFERENCES classes(id, school_id),
  FOREIGN KEY (subject_id, school_id) REFERENCES subjects(id, school_id),
  FOREIGN KEY (teacher_id, school_id) REFERENCES users(id, school_id),
  FOREIGN KEY (room_id, school_id) REFERENCES rooms(id, school_id)
);

-- Grille tarifaire par année scolaire (niveau NULL = tous niveaux)
CREATE TABLE fees (
  id SERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  libelle VARCHAR(150) NOT NULL, montant NUMERIC(10,3) NOT NULL CHECK (montant >= 0),
  niveau VARCHAR(30), annee_scolaire VARCHAR(9) NOT NULL, deleted_at TIMESTAMPTZ, UNIQUE (id, school_id)
);

CREATE TABLE payments (
  id SERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id INT NOT NULL, montant NUMERIC(10,3) NOT NULL CHECK (montant > 0),
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('especes','virement','mobile_money')),
  date_paiement DATE NOT NULL DEFAULT CURRENT_DATE, objet VARCHAR(150),
  annee_scolaire VARCHAR(9) NOT NULL, numero_recu VARCHAR(30), created_by TEXT, deleted_at TIMESTAMPTZ,
  UNIQUE (id, school_id), UNIQUE (school_id, numero_recu),
  FOREIGN KEY (student_id, school_id) REFERENCES students(id, school_id)
);
CREATE INDEX payments_student_idx ON payments (school_id, student_id);

CREATE TABLE files (
  id SERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  owner_id TEXT, filename VARCHAR(255) NOT NULL, mime VARCHAR(100) NOT NULL, size INT NOT NULL,
  content BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (id, school_id)
);

CREATE TABLE homework (
  id SERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  titre VARCHAR(200) NOT NULL, description TEXT NOT NULL DEFAULT '', class_id INT NOT NULL, subject_id INT,
  teacher_id TEXT, echeance DATE NOT NULL, bareme NUMERIC(5,1) NOT NULL DEFAULT 20,
  attachment_file_id INT, correction_file_id INT, correction_text TEXT, deleted_at TIMESTAMPTZ,
  UNIQUE (id, school_id),
  FOREIGN KEY (class_id, school_id) REFERENCES classes(id, school_id),
  FOREIGN KEY (subject_id, school_id) REFERENCES subjects(id, school_id),
  FOREIGN KEY (attachment_file_id, school_id) REFERENCES files(id, school_id),
  FOREIGN KEY (correction_file_id, school_id) REFERENCES files(id, school_id)
);

CREATE TABLE homework_submissions (
  id SERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  homework_id INT NOT NULL, student_id INT NOT NULL, contenu TEXT, file_id INT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(), en_retard BOOLEAN NOT NULL DEFAULT FALSE,
  note NUMERIC(5,2) CHECK (note >= 0), commentaire TEXT, note_publiee BOOLEAN NOT NULL DEFAULT FALSE,
  vu_parent BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (school_id, homework_id, student_id),
  FOREIGN KEY (homework_id, school_id) REFERENCES homework(id, school_id) ON DELETE CASCADE,
  FOREIGN KEY (student_id, school_id) REFERENCES students(id, school_id),
  FOREIGN KEY (file_id, school_id) REFERENCES files(id, school_id)
);

CREATE TABLE messages (
  id SERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL, recipient_id TEXT NOT NULL, student_id INT,
  objet VARCHAR(200) NOT NULL, corps TEXT NOT NULL, statut VARCHAR(10) NOT NULL DEFAULT 'envoye' CHECK (statut IN ('brouillon','envoye')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), sent_at TIMESTAMPTZ,
  hidden_by_recipient BOOLEAN NOT NULL DEFAULT FALSE, lu BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (id, school_id),
  FOREIGN KEY (sender_id, school_id) REFERENCES users(id, school_id),
  FOREIGN KEY (recipient_id, school_id) REFERENCES users(id, school_id),
  FOREIGN KEY (student_id, school_id) REFERENCES students(id, school_id)
);
CREATE INDEX messages_rcpt_idx ON messages (school_id, recipient_id);

CREATE TABLE announcements (
  id SERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL, titre VARCHAR(200) NOT NULL, corps TEXT NOT NULL,
  audience VARCHAR(20) NOT NULL DEFAULT 'tous' CHECK (audience IN ('tous','parents','enseignants','eleves')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (author_id, school_id) REFERENCES users(id, school_id)
);

CREATE TABLE notifications (
  id SERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, titre VARCHAR(200) NOT NULL, corps TEXT, lien VARCHAR(200),
  lu BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, school_id) REFERENCES users(id, school_id) ON DELETE CASCADE
);
CREATE INDEX notifications_user_idx ON notifications (school_id, user_id, lu);

-- Journal d'envoi des messages automatiques (date, destinataire, statut)
CREATE TABLE delivery_log (
  id BIGSERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  recipient_id TEXT, canal VARCHAR(20) NOT NULL, sujet VARCHAR(200), statut VARCHAR(20) NOT NULL, detail TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Journal d'audit : qui, quand, quoi, anciennes et nouvelles valeurs
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY, school_id INT REFERENCES schools(id) ON DELETE CASCADE,
  actor_id TEXT, actor_email TEXT, impersonated BOOLEAN NOT NULL DEFAULT FALSE,
  action VARCHAR(40) NOT NULL, entity VARCHAR(40), entity_id TEXT, old_values JSONB, new_values JSONB,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_school_idx ON audit_log (school_id, at DESC);
