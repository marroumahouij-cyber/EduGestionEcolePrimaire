# Tests

| Suite | Commande | Prérequis |
|---|---|---|
| API (26 tests, base de test séparée) | `docker compose -f docker-compose.test.yml up -d` puis `cd backend && npm test` | Docker, Node 22 |
| Navigateur (Chromium) | `pip install playwright && playwright install chromium`, puis `python e2e/e2e_ecole.py http://localhost:3001` et `python e2e/e2e_superadmin.py http://localhost:3001` | Application lancée sur une **base neuve** avec `DEV_SEED=true` |

- Les tests API **refusent de s'exécuter** si le nom de la base ne contient pas « test » : ils ne peuvent pas toucher vos vraies données.
- Les tests navigateur créent des données dans École A / École B : lancez-les sur une base de démonstration (`docker compose down -v` pour repartir de zéro), pas sur une base réelle.
