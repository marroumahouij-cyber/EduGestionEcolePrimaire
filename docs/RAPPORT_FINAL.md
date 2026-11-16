# Rapport final — EduGestion V7 (multi-écoles)

## A. Problèmes constatés dans l'application d'origine (V6)
Constats faits en lisant le code livré (`backend/server.js`, `src/App.jsx`, `docker-compose.yml`) :
1. Les données métier étaient stockées en **JSON générique** (`records`) avec des liens **par nom** (classe « 1A », enseignant « Mme Saidi ») : pas de clés étrangères, pas de contraintes réelles, suppression non contrôlée.
2. Le Super Admin pouvait créer une école mais **ne pouvait pas y entrer**, ni la modifier, ni gérer ses administrateurs, ni l'archiver/supprimer ; pas d'écoles A et B réelles prêtes à l'emploi.
3. Un parent n'était lié qu'à **un seul** enfant ; pas de lien enseignant ↔ matière ↔ classe.
4. Absents du cahier des charges : devoirs avec dépôts/notes/corrections, notifications, messagerie (brouillons, immuabilité, masquage), annonces, solde et grille tarifaire, reçus PDF numérotés, message automatique après paiement, détection de conflits d'emploi du temps, justification d'absence, pré-inscription, import CSV, journal avec anciennes/nouvelles valeurs.
5. Les enseignants voyaient les paiements ; pas de désactivation de compte ni de réinitialisation de mot de passe par la direction.
6. Docker : seule la base était conteneurisée ; pas d'image applicative.
7. Mots de passe de développement définis seulement via variables d'environnement, pas de comptes de démonstration documentés.

## B. Corrections et ajouts réalisés
- **Nouvelle base relationnelle PostgreSQL** (`backend/migrations/001_init.sql`) : `school_id` sur chaque table métier, **clés étrangères composites `(id, school_id)`** : la base elle-même refuse qu'une ligne d'une école référence une ligne d'une autre. Suppression logique (`deleted_at`), index, contraintes (barème, capacité, horaires…).
- **Authentification réelle** : e-mail + mot de passe haché bcrypt (coût 12), JWT 4 h, vérification du compte **à chaque requête** (compte désactivé / école suspendue / mot de passe changé ⇒ session coupée), limitation des tentatives, helmet (CSP, etc.).
- **Isolation** : l'école vient **uniquement** du compte connecté ; tout identifiant d'une autre école renvoie « introuvable » ; références inter-écoles refusées avant même la base ; périmètres par rôle (enseignant : ses classes ; parent : ses enfants ; élève : lui-même).
- **Super Admin** : créer, modifier, rechercher/filtrer, suspendre, archiver, restaurer, supprimer définitivement (avec saisie du nom) des écoles ; gérer les administrateurs (ajout, mot de passe, désactivation) ; **entrer dans une école** par contexte signé et audité, bannière + retour ; configuration initiale (6 matières) à la création.
- **Modules du cahier des charges** (voir §D) et interface : **thème, couleurs, logo, sidebar, tableau de bord, formulaires et login conservés** ; seules quelques règles CSS ont été ajoutées pour de nouveaux éléments (cloche, bannière, vue semaine).
- Corrections trouvées pendant les tests : `#` dans `.env` tronquant les mots de passe ; requête SQL de modification d'école ; doublons renvoyant une erreur 500 au lieu d'un message ; minuteur de messages qui masquait une erreur ; recherche qui cherchait dans les identifiants internes ; rechargements avec un mauvais jeton après « Entrer ».
- Docker : `Dockerfile` (build frontend + serveur), `docker-compose.yml` (db + app, volume persistant, healthchecks), base seule (`docker-compose.db.yml`), base de test jetable (`docker-compose.test.yml`).
- Données de démonstration retirées du code front (`data.js` supprimé) : **toutes les valeurs affichées viennent de la base**.

## C. Comparaison avec l'application GitHub de référence (`salmamhj424-lgtm/ecole-app`)
**Méthode** : j'ai cloné le dépôt et lu son `init.sql`, `lib_ecoles.php`, `lib_messages.php`, `lib_paiements.php`, `ecoles.php` en détail, et parcouru par recherche ciblée `comptes.php`, `notes.php`, `eleves.php`, `maj3-eleves.php`, `messages.php`, `dashboard.php`, `classes.php`, `bulletins.php`, `lib_mail.php`. **Je n'ai pas exécuté l'application PHP** : la comparaison porte sur le code lu, pas sur son comportement à l'écran. Elle est en PHP (un schéma PostgreSQL par école) ; la vôtre reste en React/Express avec une colonne `school_id` (méthode décrite dans votre document « isolation entre écoles »).

| Fonction de la référence | Équivalent dans votre application |
|---|---|
| Gestion des écoles (créer, activer/désactiver, mot de passe admin) | ✅ + modifier, archiver, supprimer, entrer dans l'école |
| Comptes par école, rôles | ✅ (5 rôles + Super Admin) |
| Élèves, classes (niveau/section/capacité), notes, bulletin PDF | ✅ |
| Paiements, reçus numérotés, solde | ✅ + message automatique au parent |
| Messagerie (lu/non lu, masquer, destinataires selon le rôle) | ✅ + brouillons, historique, journal d'accès |
| Tableau de bord par rôle | ✅ (valeurs issues de la base) |
| Import/mise à jour d'élèves (`maj3-eleves.php`) | ✅ import et export CSV (non comparé ligne à ligne) |
| E-mail (`lib_mail.php`) | ❌ non branché (voir limites) |

Je n'ai pas relevé de fonction de la référence absente de la vôtre parmi celles que j'ai lues, mais la lecture de certains fichiers a été partielle (voir ci-dessus).

## D. Checklist du cahier des charges
Légende : ✅ implémenté **et** couvert par un test ; 🟡 implémenté, non testé automatiquement ; ⚠️ partiel ; ❌ non fait.

| Exigence | État |
|---|---|
| CRUD classes, matières, enseignants, élèves, salles, paiements, devoirs, messages (brouillon), emploi du temps, notes | ✅ |
| Modification journalisée (utilisateur, date, ancien/nouveau) | ✅ |
| Suppression contrôlée + suppression logique | ✅ |
| Pré-inscription en ligne par les parents + validation | ✅ |
| Dossier élève : état civil, parents, antécédents médicaux, année d'entrée | ✅ (⚠️ **pas de photo**) |
| Affectation manuelle à une classe avec contrôle des effectifs | ✅ (❌ affectation automatique par âge) |
| Import/export CSV | ✅ (Excel natif ❌ ; CSV ouvrable dans Excel) |
| Classes, matières (coefficient), salles, affectation matière↔enseignant↔classe | ✅ |
| Emploi du temps + détection de conflits (enseignant, salle, classe) | ✅ ; vue semaine 🟡 (⚠️ pas de vue « jour » dédiée) |
| Notes par évaluation, moyennes pondérées, bulletin PDF téléchargeable par les parents | ✅ (évaluation = champs de la note, pas d'entité séparée) |
| Absences + justification par les parents | ✅ |
| Grille tarifaire, paiements 3 modes, reçu PDF, solde | ✅ |
| Message automatique après paiement + journal d'envoi | ✅ (canal : messagerie interne + notification) |
| Impayés / relances automatiques | ⚠️ soldes visibles ; **relances automatiques ❌** |
| Devoirs : enseignant, dépôt élève, notes, correction, « vu » parent | ✅ |
| Notifications devoirs | ✅ (cloche interne) |
| Messagerie : canaux, RBAC, immuabilité, brouillons, masquage destinataire, historique, journal d'accès | ✅ |
| Annonces immuables par audience | ✅ |
| Notifications **push (PWA/FCM) et e-mail (SendGrid)** | ❌ non implémentés |
| RBAC, bcrypt, journalisation, HTTPS | ✅ RBAC/bcrypt/journal ; HTTPS = étape de déploiement (non réalisée) |
| RGPD : consentement parental, effacement, portabilité | ⚠️ suppression logique + export CSV des élèves ; pas de module de consentement ni d'export complet des données personnelles |
| `annee_scolaire` sur classes, notes, paiements | ✅ |
| Stockage S3 des fichiers | ⚠️ fichiers (5 Mo max) stockés **dans PostgreSQL** (couverts par la sauvegarde) |
| Sauvegarde/restauration | 🟡 commandes documentées, **non exécutées** |
| Responsive / PWA | 🟡 design d'origine conservé (mobile) ; WCAG AA **non audité** |
| Performance (500 utilisateurs) | ❌ **non mesurée** |
| Déploiement HTTPS public, Figma, staging | ❌ hors périmètre de cette livraison |

**Écart assumé avec le cahier des charges** : celui-ci demande une application **mono-école sans Super Admin**. Votre demande (et le document « isolation entre écoles ») impose le contraire ; j'ai suivi votre demande. Le reste du cahier s'applique à chaque école.

## E. Vérifications réellement effectuées
Environnement de test : **PostgreSQL réel** (binaire embarqué), Node 22, Chromium piloté par Playwright.

| Vérification | Résultat |
|---|---|
| Tests d'API automatisés (`backend/tests`) : isolation A↔B dans les deux sens, accès par identifiant, références inter-écoles, jeton falsifié, rôles, règles métier, paiements/messages/devoirs, persistance après « redémarrage » d'une 2ᵉ instance | **26/26 réussis** |
| Parcours navigateur Super Admin (`e2e/e2e_superadmin.py`) : connexion, refus du mauvais mot de passe, liste A/B, création école C, recherche, entrer/revenir A et B, rafraîchissement (F5), connexion de l'admin C, reconnexion | **12/12** |
| Parcours navigateur des rôles (`e2e/e2e_ecole.py`) : direction (classe, élèves, capacité, modification, suppression, paiement + reçu PDF, comptes, annonce, journal), parent, enseignant, élève (dépôt), enseignant (note), comptable, isolation vers l'école B | **30/30**, aucune erreur console (hors polices Google, hors-ligne) |
| Démarrage en mode production + garde-fous (`DEV_SEED` interdit, secret d'exemple refusé, secret court refusé) | ✅ |
| Build du frontend (Vite) | ✅ |
| Validité syntaxique des 3 fichiers `docker-compose` | ✅ |

## F. Ce qui n'a PAS été testé (soyez-en conscient)
- **Docker n'a pas pu être exécuté** dans mon environnement : le `Dockerfile` et `docker-compose.yml` n'ont **pas été construits**. Ils sont écrits avec soin mais le premier lancement chez vous est leur premier vrai test. Le même code a été exécuté hors Docker (mêmes commandes `node`, même base PostgreSQL, interface compilée servie par le backend).
- Les commandes de sauvegarde/restauration, l'envoi réel d'e-mails/push (non implémentés), l'accessibilité WCAG, la charge à 500 utilisateurs, les navigateurs autres que Chromium, l'affichage sur téléphone réel.
- Le téléchargement de fichiers joints a été testé en API (autorisations) mais pas cliqué dans le navigateur.

## G. Limites connues
- Pas de « mot de passe oublié » par e-mail : la réinitialisation est faite par la direction, le Super Admin ou la commande `reset-password`.
- Jeton de session en `sessionStorage` (4 h) ; pas de double authentification.
- Les e-mails sont uniques dans toute la base (une même personne ne peut pas avoir un compte dans deux écoles avec la même adresse).
- Aucune sécurité « Row Level Security » PostgreSQL : l'isolation repose sur les requêtes filtrées par école **et** les clés étrangères composites.
