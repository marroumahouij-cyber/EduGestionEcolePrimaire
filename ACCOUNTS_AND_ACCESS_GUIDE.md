# Guide des comptes et des accès — EduGestion

> Les comptes ci-dessous sont des **comptes de DÉVELOPPEMENT**. Ils sont créés automatiquement quand `DEV_SEED=true`
> (fichier `.env`). **Ne les utilisez jamais tels quels sur Internet** : changez les mots de passe ou mettez `DEV_SEED=false`.
> Tous les mots de passe sont stockés **hachés (bcrypt)** dans la base ; aucun mot de passe n'est affiché dans l'application.

## 1. Adresses de connexion

| Mode de lancement | Adresse |
|---|---|
| Docker (recommandé) | **http://localhost:3001** |
| Développement (`npm run dev`) | **http://localhost:5173** |

## 2. Comptes créés par défaut (valeurs de `.env.example`)

| Rôle | E-mail | Mot de passe initial |
|---|---|---|
| **Super Admin** (propriétaire de la plateforme) | `superadmin@edugestion.test` | `SuperAdmin-Dev-2026` |
| École A — Direction | `admin.a@ecole-a.test` | `EcoleA-Dev-2026` |
| École A — Enseignant | `enseignant.a@ecole-a.test` | `EcoleA-Dev-2026` |
| École A — Parent (2 enfants : A-Élève1, A-Élève2) | `parent.a@ecole-a.test` | `EcoleA-Dev-2026` |
| École A — Élève (A-Élève1) | `eleve.a@ecole-a.test` | `EcoleA-Dev-2026` |
| École A — Comptable | `comptable.a@ecole-a.test` | `EcoleA-Dev-2026` |
| École B — Direction / Enseignant / Parent / Élève / Comptable | `admin.b@ecole-b.test`, `enseignant.b@ecole-b.test`, `parent.b@ecole-b.test`, `eleve.b@ecole-b.test`, `comptable.b@ecole-b.test` | `EcoleB-Dev-2026` |

Ces valeurs viennent de `.env` (`SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `DEV_PASSWORD_A`, `DEV_PASSWORD_B`) et de `backend/src/seed.js`.
Si vous changez ces valeurs dans `.env` **avant le premier démarrage**, ce sont elles qui seront utilisées.
Après le premier démarrage, modifier `.env` ne change plus les mots de passe déjà enregistrés : utilisez les méthodes des §5 et §6.

> **Règle importante** : si un mot de passe contient le caractère `#`, mettez-le entre guillemets dans `.env` (`"Mot#DePasse"`), sinon tout ce qui suit `#` est ignoré.

## 3. Comment se connecter avec chaque rôle
1. Ouvrez l'adresse du §1. 2. Saisissez l'e-mail et le mot de passe. 3. Cliquez « Se connecter ».
- **Super Admin** : arrive sur la console « Super-administration » (liste des écoles).
- **Autres rôles** : arrivent sur le tableau de bord de **leur** école ; le menu dépend du rôle.
- Une session dure 4 heures. « Déconnexion » la ferme.

## 4. Créer des comptes
- **Nouvelle école + son administrateur** : Super Admin → formulaire « Ajouter une école » (voir le guide utilisateur). Le compte de direction est créé en même temps.
- **Autre administrateur pour une école** : Super Admin → ligne de l'école → **Admins** → « Ajouter un administrateur ».
- **Enseignant** : direction → menu **Enseignants** → Ajouter (e-mail + mot de passe initial), ou **Comptes utilisateurs**.
- **Parent / Élève / Comptable** : direction → **Comptes utilisateurs** → « Créer un compte ». Un parent doit être associé à au moins un élève (plusieurs possibles) ; un compte élève à un dossier élève.
- Communiquez le mot de passe initial de façon sécurisée ; demandez à la personne de le changer (bouton « Mot de passe » en haut).

## 5. Changer / réinitialiser un mot de passe
| Qui | Comment |
|---|---|
| Un utilisateur (lui-même) | Bouton **Mot de passe** en haut à droite → ancien + nouveau (12 caractères minimum). Il doit ensuite se reconnecter. |
| Un parent, enseignant, élève, comptable | La **direction** : Comptes utilisateurs → **Mot de passe** sur la ligne. |
| Un administrateur d'école | Le **Super Admin** : Établissements → **Admins** → **Mot de passe**. |
| **Super Admin (mot de passe oublié)** | En ligne de commande : `docker compose exec app node scripts/reset-password.js superadmin@edugestion.test "NouveauMotDePasse-2026"` (mode développement : `cd backend` puis `npm run password:reset -- email "motdepasse"`). |

Après un changement ou une réinitialisation, **toutes les sessions ouvertes de ce compte sont fermées**.
Il n'y a pas de « mot de passe oublié » par e-mail dans cette version (voir les limites dans `docs/RAPPORT_FINAL.md`).

## 6. Désactiver un compte
- Utilisateur d'école : direction → Comptes utilisateurs → **Désactiver** (réversible avec **Réactiver**). Il est déconnecté immédiatement et ne peut plus se connecter.
- Administrateur d'école : Super Admin → **Admins** → Désactiver (impossible pour le dernier administrateur actif).
- **Supprimer** retire le compte (suppression logique ; l'e-mail redevient disponible).

## 7. Permissions par rôle
| | Direction | Enseignant | Parent | Élève | Comptable |
|---|---|---|---|---|---|
| Élèves, classes, matières, salles, affectations, emploi du temps | Tout | Ses classes (lecture) | Ses enfants (lecture) | Lui-même (lecture) | Élèves : lecture/écriture |
| Notes, absences | Tout | Saisie pour ses élèves | Lecture + justifier une absence | Lecture | — |
| Paiements, grille tarifaire | Tout | — | Paiements de ses enfants | — | Tout |
| Devoirs | Tout | Ses classes | Consulte, marque « vu » | Dépose son travail | — |
| Messagerie | Tous les comptes de l'école | Direction + parents de ses élèves | Direction, comptable, enseignants de ses enfants | Reçoit seulement | Direction + parents |
| Annonces | Publie | Lit | Lit | Lit | Lit |
| Comptes, journal d'audit, paramètres | Oui | — | — | — | — |

Ces règles sont **appliquées par le serveur** (pas seulement par l'affichage des boutons).

## 8. Gérer l'accès aux écoles (Super Admin)
- **Entrer** dans une école : vous agissez comme administrateur de cette école ; une bannière rappelle le mode, chaque entrée est enregistrée dans le journal.
- **Retour au tableau Super Admin** : bouton dans la bannière.
- **Suspendre** : plus personne de l'école ne peut se connecter (réversible : **Activer**).
- **Archiver** : l'école devient inaccessible, données conservées (**Restaurer** possible).
- **Supprimer définitivement** : seulement après archivage, en retapant le nom exact de l'école. Toutes ses données sont effacées.
