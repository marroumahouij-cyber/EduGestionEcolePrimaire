# Guide d'utilisation complet — EduGestion

Ce guide explique, en français simple, comment utiliser l'application **rôle par rôle**.
Chaque information saisie est enregistrée dans la **base de données PostgreSQL** : elle reste là après une déconnexion, un rafraîchissement de la page (F5) ou un redémarrage.

**Repères** : le menu est à gauche (sur téléphone : bouton ☰). En haut à droite : votre rôle, la cloche 🔔 (notifications), « Mot de passe » et « Déconnexion ».

---
## 1. Exemple complet de A à Z : créer l'école C et la faire fonctionner
1. **Super Admin** : ouvrez http://localhost:3001, connectez-vous avec `superadmin@edugestion.test`.
2. À gauche, formulaire **« Ajouter une école »** : Nom `École C`, adresse, e-mail, téléphone ; plus bas **« Administrateur de l'école »** : nom `Directrice C`, e-mail `directrice@ecole-c.test`, mot de passe de 12 caractères minimum. Cliquez **Créer cette école**.
3. Message vert « École et compte de direction créés ». L'école apparaît dans **Établissements**.
   *Stockage : tables `schools` et `users` ; 6 matières de base sont créées automatiquement.*
4. Cliquez **Déconnexion**, puis connectez-vous avec `directrice@ecole-c.test` : vous êtes dans le tableau de bord de l'École C (vide, aucune donnée des autres écoles).
5. **Paramètres** : vérifiez l'année scolaire (ex. 2026-2027) et le tarif annuel → **Enregistrer**.
6. **Classes → Ajouter** : niveau `CP`, section `A`, capacité `25` → Enregistrer.
7. **Enseignants → Ajouter** : nom, e-mail, mot de passe initial → Enregistrer. Puis **Classes → crayon** de CP A → choisissez l'enseignant titulaire.
8. **Élèves → Ajouter** : nom, prénom, date de naissance, classe `CP A`. Répétez pour plusieurs élèves.
9. **Comptes utilisateurs → Créer un compte** : type `Parent`, e-mail, mot de passe, et **associez ses enfants** (Ctrl + clic pour en choisir plusieurs).
10. **Comptes utilisateurs** : créez aussi un compte `Élève` (associé à un dossier élève) et un `Comptable`.
11. **Grille tarifaire → Ajouter** : « Frais de scolarité », 1200 DT.
12. **Paiements → Ajouter** : élève, montant, mode → le **reçu** est généré et un **message automatique** part au parent avec le nouveau solde.
13. Déconnectez-vous et connectez-vous en **parent** : vous voyez seulement vos enfants, leurs notes, devoirs, le solde et le message de paiement.

---
## 2. Super Admin (propriétaire de la plateforme)
Après connexion : console **« Super-administration »**.

| Je veux… | Comment | Ce qui se passe |
|---|---|---|
| Voir toutes les écoles | Tableau **Établissements** | Nombre d'utilisateurs, d'élèves, statut de chaque école. |
| Chercher / filtrer | Barre de recherche ; liste « Tous les statuts » | Filtre immédiat. |
| **Ajouter une école** | Formulaire à gauche (§1) | École + administrateur créés ; l'administrateur peut se connecter tout de suite. |
| **Entrer dans une école** | Bouton **Entrer** | Vous gérez l'école comme son administrateur. Bannière en haut ; l'entrée est notée dans le journal. |
| Revenir | Bannière → **← Retour au tableau Super Admin** | Retour à la console. |
| Modifier une école | **Modifier** | Nom, adresse, e-mail, téléphone, formule, statut, fin d'abonnement. |
| Gérer les administrateurs | **Admins** | Liste, **Mot de passe** (réinitialisation), **Désactiver/Réactiver**, ajout d'un administrateur. |
| Suspendre / activer | **Suspendre** / **Activer** | Suspendue = plus aucune connexion pour cette école. |
| Archiver / restaurer | **Archiver** / **Restaurer** | Données conservées, école inaccessible. |
| **Supprimer définitivement** | Sur une école archivée : **Supprimer**, puis tapez le nom exact | Toutes les données de l'école sont effacées. **Irréversible.** |
| Voir l'historique | **Journal de la plateforme** | Créations d'écoles, entrées, réinitialisations, connexions. |

**Isolation** : l'École A ne voit jamais les données de l'École B, même en modifiant une adresse ou un numéro (le serveur répond « introuvable »).

---
## 3. Direction de l'école (Administrateur)
Menu complet. Les listes (Élèves, Classes…) ont toutes : **recherche**, **Ajouter**, **crayon = Modifier**, **corbeille = Supprimer**.

### Règles communes de suppression (cahier des charges)
- On **ne peut pas supprimer** une classe qui contient des élèves, une matière utilisée (notes, affectations, emploi du temps, devoirs), une salle utilisée, ou un enseignant titulaire/affecté → un message explique quoi faire.
- Un élève ayant des notes ou paiements : l'application demande une **confirmation explicite** ; la suppression est **logique** (l'historique reste en base).
- Toute création, modification, suppression est enregistrée dans **Journal** (qui, quand, ancienne et nouvelle valeur).

### Élèves
**Élèves → Ajouter** : nom, prénom, date de naissance, classe, parent, antécédents médicaux, statut. La **capacité** de la classe est contrôlée (« classe complète »). Les parents peuvent faire une **pré-inscription** (statut « Pré-inscrit ») : ouvrez la fiche (crayon), choisissez une classe et le statut **Inscrit** pour valider. L'icône imprimante télécharge le **bulletin PDF**.
**Import / export CSV** : menu **Paramètres** (§ « Import / export des élèves »).
Format du CSV importé : première ligne `nom;prenom;classe;date_naissance;parent`, puis un élève par ligne (classe `CP A`, date `2019-04-23`). Le résultat indique les lignes refusées et pourquoi.

### Classes, matières, salles, affectations
- **Classes** : niveau, section, capacité, enseignant titulaire. L'année scolaire est celle des Paramètres.
- **Matières** : nom, **coefficient**, niveau.
- **Salles** : nom, capacité, disponibilité.
- **Affectations** : relie un enseignant à une matière **et** une classe (un enseignant peut en avoir plusieurs). Un enseignant voit les classes dont il est titulaire **ou** affecté.

### Emploi du temps
**Emploi du temps → Ajouter** : classe, matière, enseignant, salle, jour, début, fin. Le serveur **refuse les conflits** : même classe, même enseignant ou même salle sur des horaires qui se chevauchent. Bouton **Vue semaine** pour un affichage par jour.

### Notes, absences
- **Notes / Bulletins → Ajouter** : élève, matière, évaluation (ex. « Contrôle 1 »), type, trimestre, note et barème. La note ne peut pas dépasser le barème.
- **Moyennes** : chaque note est ramenée sur 20 ; moyenne par matière ; **moyenne générale pondérée par les coefficients** ; visibles dans le bulletin PDF.
- **Absences → Ajouter** : élève, date, motif. Le parent peut ensuite la **justifier**.

### Finances
- **Grille tarifaire** : lignes (libellé, montant, niveau facultatif) pour l'année en cours. Le **solde** d'un élève = total de la grille applicable (ou tarif annuel des Paramètres si la grille est vide) − paiements.
- **Paiements → Ajouter** : élève, montant, mode (espèces, virement, mobile money). Automatiquement : **numéro de reçu**, mise à jour du solde, **message au(x) parent(s)** (montant, date, mode, nouveau solde, reçu), notification 🔔, ligne dans le **journal des envois** (Journal). L'imprimante télécharge le **reçu PDF**.

### Devoirs
Voir §4 (même écran). La direction peut tout faire que l'enseignant fait.

### Messagerie et annonces
- **Messagerie → Nouveau message** : destinataire, objet, message. **Enregistrer en brouillon** (modifiable/supprimable) ou **Envoyer**.
- **Un message envoyé est définitif** : ni l'expéditeur ni la direction ne peut le modifier ou le supprimer. Le **destinataire** peut le **masquer** de sa boîte (l'expéditeur et l'historique le gardent).
- Ouvrir un message (œil) montre la conversation ; chaque lecture est journalisée.
- **Annonces → Publier une annonce** : audience (tous, parents, enseignants, élèves). Une annonce publiée est **immuable** ; en cas d'erreur, publiez une annonce corrective.

### Comptes, journal, paramètres
- **Comptes utilisateurs** : créer, **Désactiver/Réactiver**, **Mot de passe** (réinitialiser), **Enfants** (modifier les liens parent-enfants), **Supprimer**. Les comptes de direction sont gérés par le Super Admin.
- **Journal** : 300 dernières actions et journal des envois automatiques.
- **Paramètres** : nom, année scolaire, tarif annuel, adresse, e-mail, téléphone.

---
## 4. Enseignant
Menu : Tableau de bord, Élèves, Classes, Notes, Absences, Emploi du temps, Devoirs, Messagerie, Annonces.
- Vous ne voyez **que vos classes et leurs élèves**.
- **Notes** / **Absences** : ajout, modification, suppression pour vos élèves.
- **Devoirs → Ajouter** : titre, description, classe, matière, date de remise, barème. Élèves et parents de la classe reçoivent une notification.
  Bouton **dossier** (📁) sur un devoir : joindre l'**énoncé** (PDF, image, document, 5 Mo max) ; voir les **dépôts** (rendu / en retard / non rendu) ; saisir **note + commentaire** puis **Publier la note** ; publier la **correction** (texte et/ou fichier). La correction n'est visible des élèves et parents **qu'après la date de remise**.
- **Messagerie** : vous écrivez à la direction et aux parents de vos élèves.

## 5. Parent
Menu : Tableau de bord, Élèves, Notes, Absences, Emploi du temps, Paiements, Devoirs, Messagerie, Annonces.
- Vous voyez **uniquement vos enfants**.
- **Élèves → Pré-inscrire un enfant** : formulaire envoyé à la direction.
- **Notes** : notes de vos enfants ; **Élèves → imprimante** : bulletin PDF.
- **Absences** : bouton ✔ pour **justifier** (saisissez le motif).
- **Paiements** : paiements, **solde restant**, **reçu PDF**.
- **Devoirs → 📁** : statut du dépôt, note et commentaire (une fois publiés), correction (après la date de remise), bouton **Marquer « vu »**.
- **Messagerie** : vous écrivez à la direction, au comptable et aux enseignants de vos enfants. 🔔 vous prévient de chaque nouveau message, paiement ou devoir.

## 6. Élève
Menu : Tableau de bord, Notes, Absences, Emploi du temps, Devoirs, Messagerie, Annonces (**lecture seule**, sauf le dépôt de devoirs).
- **Devoirs → 📁** : **Déposer mon travail** (texte et/ou fichier). Vous pouvez **remplacer** votre dépôt tant que la date de remise n'est pas dépassée. Un dépôt après la date est marqué « rendu en retard » et ne peut plus être remplacé. Après publication : note, commentaire et correction.
- **Messagerie** : vous recevez les messages de la direction (vous ne pouvez pas écrire).

## 7. Comptable / Secrétariat
Menu : Tableau de bord, Élèves, Grille tarifaire, Paiements, Messagerie, Annonces.
- **Élèves** : consulter, ajouter, modifier (inscriptions).
- **Grille tarifaire** et **Paiements** : voir §3 « Finances ». Le message automatique au parent part aussi quand c'est le comptable qui saisit.

---
## 8. Questions fréquentes
- **J'ai supprimé un élève par erreur** : la suppression est logique ; la donnée reste en base (récupération par un technicien).
- **Qui voit mes messages ?** Seulement vous et le destinataire.
- **Pourquoi « classe complète » ?** La capacité maximale de la classe est atteinte : augmentez-la (Classes) ou choisissez une autre classe.
- **Pourquoi « Conflit » dans l'emploi du temps ?** L'enseignant, la salle ou la classe est déjà occupé(e) sur ce créneau.
