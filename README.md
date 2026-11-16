# EduGestion — gestion d'écoles primaires (multi-écoles)

Application web : **React (Vite)** + **Node.js/Express** + **PostgreSQL**, Docker. Chaque école a ses données totalement isolées ; un **Super Admin** crée et gère les écoles.

## Démarrage rapide (Docker)
```powershell
copy .env.example .env        # puis éditez .env (voir docs/INSTALLATION_WINDOWS.md)
docker compose up -d --build
```
Ouvrez **http://localhost:3001** — comptes : voir `ACCOUNTS_AND_ACCESS_GUIDE.md`.

## Documentation
| Fichier | Contenu |
|---|---|
| `docs/INSTALLATION_WINDOWS.md` | Installation complète pas à pas (Windows, VS Code, Docker, PostgreSQL) |
| `ACCOUNTS_AND_ACCESS_GUIDE.md` | Adresses, identifiants de développement, gestion des comptes et mots de passe |
| `COMPLETE_USER_GUIDE.md` | Mode d'emploi de chaque rôle et module, exemple complet |
| `docs/RAPPORT_FINAL.md` | Problèmes trouvés, corrections, checklist du cahier des charges, **tests réalisés / non réalisés** |
| `docs/TESTS.md` | Lancer les tests |

## Structure
```
backend/   API Express, migrations SQL, scripts, tests
  migrations/001_init.sql   schéma PostgreSQL (school_id partout, clés composites)
  src/       auth, resources (CRUD), people (comptes, messagerie), school (devoirs, PDF…), saas (Super Admin), seed
src/       interface React (design d'origine conservé : style.css)
e2e/       tests navigateur (Playwright)
Dockerfile, docker-compose*.yml
```
