# Installation pas à pas sur Windows (Docker + PostgreSQL + VS Code)

Temps estimé : 30 à 45 minutes la première fois (le téléchargement de Docker est la partie la plus longue).
Vous allez **copier-coller des commandes** : chaque commande est suivie de ce qu'elle fait et de ce que vous devez voir.

## Partie 1 — Les logiciels à installer

| Logiciel | À quoi il sert | Où le télécharger |
|---|---|---|
| **Docker Desktop** | Lance PostgreSQL et l'application sans rien configurer à la main | https://www.docker.com/products/docker-desktop/ |
| **Visual Studio Code** | Éditeur pour ouvrir le projet | https://code.visualstudio.com |
| **Node.js 22 (LTS)** | Seulement pour le « mode développement » (Partie 8) | https://nodejs.org |

Installez-les avec les options par défaut. Docker Desktop peut demander d'activer **WSL 2** : acceptez, puis **redémarrez Windows** si on vous le demande.

### Vérifier que tout est installé
1. Ouvrez **VS Code**.
2. Menu **Terminal → Nouveau terminal** (en bas s'ouvre un terminal, PowerShell).
3. Tapez ces commandes, une par une, puis **Entrée** :
```powershell
docker --version
docker compose version
```
✅ Succès : vous voyez `Docker version 2x.x.x` puis `Docker Compose version v2.x.x`.
❌ « docker n'est pas reconnu » : Docker Desktop n'est pas installé ou pas redémarré. Redémarrez Windows et réessayez.
(Pour le mode développement : `node -v` doit afficher `v22…`.)

## Partie 2 — Placer le projet
1. Dézippez `EduGestion.zip` dans **`C:\Projets\EduGestion`** (créez `C:\Projets` si besoin). Évitez le Bureau et OneDrive.
2. Dans VS Code : **Fichier → Ouvrir le dossier…** → choisissez `C:\Projets\EduGestion` → **Sélectionner un dossier**. Cliquez « Oui, je fais confiance aux auteurs ».
3. Vous voyez à gauche : `backend`, `src`, `docs`, `docker-compose.yml`, etc.
4. Ouvrez le terminal : **Terminal → Nouveau terminal**. En bas doit apparaître `PS C:\Projets\EduGestion>`.

## Partie 3 — Créer le fichier de configuration `.env`
Dans le terminal :
```powershell
copy .env.example .env
```
Cette commande copie le modèle vers le vrai fichier de configuration. ✅ Aucun message = succès.

Générez ensuite une **clé secrète** (elle signe les connexions) :
```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | ForEach-Object { $_.ToString('x2') }) -join ''
```
✅ Vous obtenez une longue suite de 64 caractères (lettres/chiffres). **Copiez-la.**

Ouvrez le fichier `.env` dans VS Code (clic dans la liste à gauche) et vérifiez/modifiez :

| Ligne | Valeur à mettre |
|---|---|
| `POSTGRES_PASSWORD` | Un mot de passe de votre choix pour la base (ex. `MaBase-Locale-2026`). |
| `JWT_SECRET` | **Collez la clé générée** à la place de `CHANGEZ_MOI_...`. |
| `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | Vos identifiants Super Admin (12 caractères minimum pour le mot de passe). Valeurs par défaut utilisables pour le développement. |
| `DEV_SEED` | `true` : crée École A et École B avec des comptes de démonstration. `false` : base vide (seul le Super Admin existe). |

**Enregistrez** (Ctrl+S). Si un mot de passe contient `#`, entourez-le de guillemets.

## Partie 4 — Démarrer Docker Desktop
1. Menu Démarrer → **Docker Desktop**. Attendez que l'icône de la baleine (en bas à droite) soit stable et que l'application indique **« Engine running »** (moteur démarré, en bas à gauche, en vert).
2. Vérifiez dans le terminal :
```powershell
docker info
```
✅ Succès : beaucoup de lignes s'affichent. ❌ « error during connect » : Docker n'est pas encore prêt, attendez 1 minute.

## Partie 5 — Construire et lancer l'application
```powershell
docker compose up -d --build
```
Cette commande : télécharge PostgreSQL, construit l'application, démarre la base puis l'application, **crée les tables automatiquement (migrations)**, crée le Super Admin et (si `DEV_SEED=true`) les écoles A et B.
Première fois : 3 à 10 minutes. ✅ Succès : les dernières lignes indiquent `Started` ou `Healthy` pour `db` et `app`.

Vérifiez :
```powershell
docker compose ps
```
✅ Les deux services (`db`, `app`) sont `running` (et `healthy`).
Regardez les messages de démarrage :
```powershell
docker compose logs app
```
✅ Vous devez voir : `Migration appliquée : 001_init.sql`, `Super Admin créé : …`, `École A créée…`, `EduGestion démarré : http://localhost:3001`.

❌ En cas d'erreur :
- `Définissez JWT_SECRET dans le fichier .env` → le `.env` n'existe pas ou est incomplet (Partie 3).
- `port is already allocated` → un autre programme utilise le port 3001 ; mettez `APP_PORT=3002` dans `.env` puis relancez la commande (l'adresse devient http://localhost:3002).
- `docker compose logs app` affiche `connect ECONNREFUSED` au début : normal quelques secondes, l'application attend la base.
- Autre erreur : copiez le texte de `docker compose logs app` pour demander de l'aide.

## Partie 6 — Ouvrir l'application
Ouvrez votre navigateur et allez sur **http://localhost:3001**. Vous voyez la page « Ravi de vous revoir ! ».

### Se connecter
- **Super Admin** : `superadmin@edugestion.test` / `SuperAdmin-Dev-2026` (ou ce que vous avez mis dans `.env`). Vous voyez École A et École B.
- **École A** : `admin.a@ecole-a.test` / `EcoleA-Dev-2026` — **École B** : `admin.b@ecole-b.test` / `EcoleB-Dev-2026`.
- Les autres rôles (enseignant, parent, élève, comptable) : voir `ACCOUNTS_AND_ACCESS_GUIDE.md`.

### Créer une troisième école
Connectez-vous en Super Admin → formulaire **« Ajouter une école »** à gauche → remplissez nom, e-mail et mot de passe de l'administrateur (12 caractères minimum) → **Créer cette école**. Elle apparaît dans la liste ; son administrateur peut se connecter immédiatement. Détail complet : `COMPLETE_USER_GUIDE.md`.

## Partie 7 — Arrêter et redémarrer **sans perdre les données**
| Action | Commande |
|---|---|
| Arrêter (données conservées) | `docker compose stop` |
| Redémarrer | `docker compose start` (ou `docker compose up -d`) |
| Arrêter et supprimer les conteneurs (**données conservées**) | `docker compose down` |
| **TOUT effacer, y compris la base** ⚠️ | `docker compose down -v` |

Vos données sont dans le volume Docker `edugestion_pgdata`, qui survit à `stop`, `down` et au redémarrage de Windows. Seule l'option `-v` l'efface.

### Sauvegarde et restauration de la base (à faire régulièrement)
Sauvegarde dans un fichier `sauvegarde.sql` :
```powershell
cmd /c "docker compose exec -T db pg_dump -U edugestion edugestion > sauvegarde.sql"
```
Restauration (sur une base vide, par exemple après `docker compose down -v` puis `docker compose up -d`) :
```powershell
cmd /c "docker compose exec -T db psql -U edugestion edugestion < sauvegarde.sql"
```
(Ces commandes de sauvegarde n'ont pas pu être exécutées pendant la préparation de ce projet : testez-les une première fois avec des données sans importance.)

### Mettre à jour après une modification du code
```powershell
docker compose up -d --build
```
Les migrations de base de données sont rejouées automatiquement ; les données restent.

## Partie 8 — Autre mode : développement (VS Code, `npm run dev`)
Utile pour modifier le code avec rechargement automatique. Il faut Node.js 22.
1. Démarrer **seulement PostgreSQL** (Docker Desktop lancé) :
```powershell
docker compose -f docker-compose.db.yml up -d
```
2. Configuration du backend :
```powershell
copy backend\.env.example backend\.env
```
3. Installer et lancer le **backend** (premier terminal) :
```powershell
cd backend
npm install
npm run dev
```
✅ Vous voyez `EduGestion démarré : http://localhost:3001` (les migrations et les comptes de développement sont créés).
4. Ouvrez un **second terminal** (icône `+` du panneau terminal) et lancez le **frontend** :
```powershell
cd C:\Projets\EduGestion
npm install
npm run dev
```
✅ Vous voyez `Local: http://127.0.0.1:5173/`. Ouvrez **http://localhost:5173**.
5. Pour arrêter : `Ctrl+C` dans chaque terminal, puis `docker compose -f docker-compose.db.yml stop`.

Commandes utiles du backend (dans `backend`) : `npm run migrate` (mettre la base à jour), `npm run seed:dev` (comptes de développement), `npm run superadmin:create`, `npm run password:reset -- email "motdepasse"`.

## Partie 9 — Lancer les tests automatiques (facultatif)
```powershell
docker compose -f docker-compose.test.yml up -d
cd backend
npm install
npm test
```
✅ Résultat attendu : `# pass 26` et `# fail 0`. Les tests utilisent une **base de test séparée et jetable** (port 5434). Arrêt : `docker compose -f docker-compose.test.yml down`.

## Partie 10 — Problèmes fréquents
| Symptôme | Solution |
|---|---|
| Page blanche / « site inaccessible » | `docker compose ps` : `app` doit être `running`. Sinon `docker compose logs app`. |
| « E-mail ou mot de passe incorrect » avec les comptes de démonstration | `DEV_SEED` était `false` au premier démarrage. Passez-le à `true` dans `.env` puis `docker compose up -d` (les écoles A et B sont créées si elles n'existent pas). |
| Vous avez changé `SUPERADMIN_PASSWORD` dans `.env` mais l'ancien marche encore | Normal : voir `ACCOUNTS_AND_ACCESS_GUIDE.md` §5 (commande de réinitialisation). |
| « Trop de tentatives » | Attendez 15 minutes (protection contre le piratage de mots de passe). |
| Les polices ne s'affichent pas | Pas de connexion Internet : l'application reste utilisable avec une police de remplacement. |
