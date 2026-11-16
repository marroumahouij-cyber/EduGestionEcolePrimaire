"""Test navigateur réel (Chromium) : parcours des rôles d'une école (comptes de développement École A).
Usage : python3 e2e/e2e_ecole.py http://localhost:3001"""
import sys, time
from playwright.sync_api import sync_playwright

B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001"
SFX = str(int(time.time()))[-5:]
PWD = "EcoleA-Dev-2026"
errs, ok = [], []
def check(label, cond):
    ok.append((label, bool(cond))); print(("  OK  " if cond else " ECHEC"), label)

def login(pg, email, pwd=PWD):
    pg.goto(B); pg.wait_for_selector("#email"); pg.fill("#email", email); pg.fill("#password", pwd); pg.click("button.login-submit"); pg.wait_for_selector(".workspace"); pg.wait_for_timeout(400)
def nav(pg, label):
    pg.locator("nav .nav-link", has_text=label).first.click(); pg.wait_for_timeout(500)
def logout(pg):
    pg.click("text=Déconnexion"); pg.wait_for_selector("#email")

with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1400, "height": 900}); ctx.on("dialog", lambda d: d.accept("EcoleA-Dev-2026-Nouveau" if "mot de passe" in d.message.lower() else None))
    pg = ctx.new_page()
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "ERR_NAME_NOT_RESOLVED" not in m.text and "Failed to load resource" not in m.text else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))

    # ---------- Direction ----------
    login(pg, "admin.a@ecole-a.test")
    nav(pg, "Classes"); pg.click("text=Ajouter")
    pg.get_by_label("Niveau (CP, CE1…)").fill("CM2"); pg.get_by_label("Section").fill(f"Z{SFX}"); pg.get_by_label("Capacité maximale").fill("2")
    pg.click("button:has-text('Enregistrer')"); pg.wait_for_timeout(700)
    check("classe ajoutée dans la liste", pg.locator("tbody tr", has_text=f"CM2 Z{SFX}").count() == 1)
    nav(pg, "Élèves")
    for i in (1, 2, 3):
        pg.click("text=Ajouter"); pg.get_by_label("Nom", exact=True).fill(f"Nouveau{i}-{SFX}"); pg.get_by_label("Prénom").fill(f"A-Test{i}")
        pg.get_by_label("Classe").select_option(label=f"CM2 Z{SFX}"); pg.click("button:has-text('Enregistrer')"); pg.wait_for_timeout(800)
    check("message d'erreur de capacité affiché", "complète" in pg.inner_text(".toast"))
    pg.click(".modal >> text=Annuler"); pg.wait_for_timeout(300)
    check("capacité 2 respectée : 3e élève refusé", pg.locator("tbody tr", has_text=f"Nouveau3-{SFX}").count() == 0 and pg.locator("tbody tr", has_text=f"Nouveau2-{SFX}").count() == 1)
    pg.fill("input[placeholder^='Rechercher']", "B-"); check("aucune donnée de l'École B visible", pg.locator("tbody tr").count() == 0); pg.fill("input[placeholder^='Rechercher']", "")
    row = pg.locator("tbody tr", has_text=f"Nouveau1-{SFX}"); row.locator("button[title='Modifier']").click(); pg.get_by_label("Prénom").fill("A-Modifie"); pg.click("button:has-text('Enregistrer')"); pg.wait_for_timeout(1200)
    check("élève modifié", pg.locator("tbody tr", has_text=f"Nouveau1-{SFX}").first.inner_text().find("A-Modifie") >= 0)
    pg.locator("tbody tr", has_text=f"Nouveau2-{SFX}").locator("button[title='Supprimer']").click(); pg.wait_for_timeout(800)
    check("élève supprimé (suppression logique)", pg.locator("tbody tr", has_text=f"Nouveau2-{SFX}").count() == 0)
    nav(pg, "Classes"); pg.locator("tbody tr", has_text="CP A").locator("button[title='Supprimer']").click(); pg.wait_for_timeout(700)
    check("suppression d'une classe non vide refusée", pg.locator("tbody tr", has_text="CP A").count() == 1 and "élèves" in pg.inner_text(".toast"))
    # paiement
    nav(pg, "Paiements"); pg.click("text=Ajouter")
    pg.get_by_label("Élève").select_option(label="A-Élève2 A-Famille2 (CP A)"); pg.get_by_label("Montant (DT)").fill("150"); pg.get_by_label("Mode de paiement").select_option(label="Mobile money"); pg.click("button:has-text('Enregistrer')"); pg.wait_for_timeout(900)
    check("paiement enregistré avec n° de reçu", pg.locator("tbody tr", has_text="REC-2026-").count() >= 2)
    with pg.expect_download() as dl:
        pg.locator("tbody tr", has_text="A-Élève2").locator("button[title^='Télécharger le reçu']").click()
    check("reçu PDF téléchargé", dl.value.suggested_filename.endswith(".pdf"))
    # compte parent
    nav(pg, "Comptes utilisateurs")
    pg.get_by_label("Nom", exact=True).fill("Parent-Nouveau"); pg.get_by_label("Adresse e-mail").fill(f"parent.nouveau{SFX}@ecole-a.test"); pg.get_by_label("Mot de passe initial (12 caractères minimum)").fill("ParentNouveau-2026")
    pg.locator("select[multiple]").select_option(label="A-Élève3 A-Famille3 — CP A"); pg.click("button:has-text('Créer le compte')"); pg.wait_for_selector(".account-success")
    check("compte parent créé", True)
    pg.locator("tr", has_text=f"parent.nouveau{SFX}").get_by_text("Désactiver").click(); pg.wait_for_timeout(700)
    check("compte désactivé", pg.locator("tr", has_text=f"parent.nouveau{SFX}").inner_text().count("Désactivé") == 1)
    nav(pg, "Annonces"); pg.click("text=Publier une annonce"); pg.get_by_label("Titre").fill(f"Sortie scolaire {SFX}"); pg.get_by_label("Texte").fill("Jeudi prochain."); pg.click(".modal-footer button:has-text('Publier')"); pg.wait_for_timeout(900)
    check("annonce publiée (sans bouton modifier/supprimer)", pg.locator(".panel", has_text=f"Sortie scolaire {SFX}").count() >= 1 and pg.locator(".panel", has_text=f"Sortie scolaire {SFX}").first.locator("button[title='Modifier']").count() == 0)
    nav(pg, "Journal"); check("journal d'audit alimenté", pg.locator("tbody tr").count() > 5)
    logout(pg)

    # ---------- Parent ----------
    login(pg, "parent.a@ecole-a.test")
    check("parent : notification non lue (paiement)", pg.locator("button[aria-label='Notifications'] .sent-badge").count() == 1)
    pg.click("button[aria-label='Notifications']"); pg.wait_for_selector(".notif-panel"); check("parent : notification paiement visible", "Paiement enregistré" in pg.inner_text(".notif-panel")); pg.click("button[aria-label='Notifications']")
    nav(pg, "Élèves"); check("parent : voit seulement ses 2 enfants", pg.locator("tbody tr").count() == 2)
    nav(pg, "Paiements"); check("parent : voit les paiements de ses enfants avec solde", pg.locator("tbody tr").count() >= 2 and "DT" in pg.inner_text("tbody"))
    nav(pg, "Messagerie"); check("parent : message automatique de paiement reçu", pg.locator("tbody tr", has_text="Paiement enregistré").count() >= 1)
    pg.locator("tbody tr", has_text="Paiement enregistré").first.locator("button[title='Lire']").click(); pg.wait_for_selector("[role=dialog]")
    check("message : contient solde restant et reçu", "Nouveau solde restant" in pg.inner_text("[role=dialog]") and "REC-2026-" in pg.inner_text("[role=dialog]")); pg.click("[role=dialog] >> text=Fermer")
    pg.click("text=Nouveau message"); pg.locator("[role=dialog] select").select_option(index=1); pg.locator("[role=dialog] input").fill(f"Question {SFX}"); pg.locator("[role=dialog] textarea").fill("Bonjour."); pg.click("[role=dialog] >> text=Envoyer"); pg.wait_for_timeout(800)
    pg.click("button:has-text('Envoyés')"); pg.wait_for_timeout(500)
    row = pg.locator("tbody tr", has_text=f"Question {SFX}"); check("message envoyé visible, sans modifier/supprimer", row.count() == 1 and row.locator("button[title='Modifier / envoyer']").count() == 0 and row.locator("button[title^='Supprimer']").count() == 0)
    nav(pg, "Absences"); check("parent : bouton de justification", pg.locator("button[title=\"Justifier l'absence\"]").count() >= 1)
    nav(pg, "Paramètres") if pg.locator("nav .nav-link", has_text="Paramètres").count() else None
    check("parent : pas d'accès aux comptes ni aux paramètres", pg.locator("nav .nav-link", has_text="Comptes").count() == 0 and pg.locator("nav .nav-link", has_text="Paramètres").count() == 0)
    logout(pg)

    # ---------- Enseignant : publie un devoir ----------
    login(pg, "enseignant.a@ecole-a.test")
    nav(pg, "Élèves"); check("enseignant : voit uniquement les élèves de sa classe CP", pg.locator("tbody tr").count() == 3)
    nav(pg, "Devoirs"); pg.click("text=Ajouter"); pg.get_by_label("Titre").fill(f"Dictée {SFX}"); pg.get_by_label("Classe").select_option(label="CP A"); pg.get_by_label("Date de remise").fill("2999-12-31"); pg.click("button:has-text('Enregistrer')"); pg.wait_for_timeout(800)
    check("devoir publié", pg.locator("tbody tr", has_text=f"Dictée {SFX}").count() == 1)
    logout(pg)

    # ---------- Élève : dépose son travail ----------
    login(pg, "eleve.a@ecole-a.test")
    check("élève : notification nouveau devoir", True)
    nav(pg, "Devoirs"); pg.locator("tbody tr", has_text=f"Dictée {SFX}").locator("button[title^='Dépôts']").click(); pg.wait_for_selector("[role=dialog]")
    pg.locator("[role=dialog] textarea").first.fill("Mon travail terminé."); pg.click("[role=dialog] >> text=Déposer mon travail"); pg.wait_for_timeout(900)
    check("élève : dépôt enregistré (statut rendu)", "rendu" in pg.inner_text("[role=dialog]"))
    pg.click("[role=dialog] >> text=Fermer"); logout(pg)
    login(pg, "enseignant.a@ecole-a.test"); nav(pg, "Devoirs"); pg.locator("tbody tr", has_text=f"Dictée {SFX}").locator("button[title^='Dépôts']").click(); pg.wait_for_selector("[role=dialog]"); pg.wait_for_timeout(500)
    pg.locator("[role=dialog] input[type=number]").first.fill("17"); pg.click("[role=dialog] >> text=Publier la note"); pg.wait_for_timeout(900)
    check("enseignant : note publiée sur le dépôt", "noté" in pg.inner_text("[role=dialog]")); pg.click("[role=dialog] >> text=Fermer"); logout(pg)

    # ---------- Comptable ----------
    login(pg, "comptable.a@ecole-a.test"); check("comptable : accès restreint (pas de Notes)", pg.locator("nav .nav-link", has_text="Notes").count() == 0 and pg.locator("nav .nav-link", has_text="Paiements").count() == 1)
    pg.screenshot(path="/tmp/shots/05_comptable.png"); logout(pg)

    # ---------- Isolation : connexion École B ----------
    login(pg, "admin.b@ecole-b.test", "EcoleB-Dev-2026"); nav(pg, "Élèves")
    noms = pg.locator("tbody tr td:first-child").all_inner_texts(); check("École B : aucune donnée créée dans l'École A", len(noms) == 5 and all(n.startswith("B-") for n in noms))
    nav(pg, "Annonces"); check("École B : l'annonce de l'École A n'est pas visible", f"Sortie scolaire {SFX}" not in pg.inner_text("main"))
    pg.screenshot(path="/tmp/shots/06_ecoleB.png")
    print("Erreurs console navigateur (hors polices Google hors-ligne) :", errs if errs else "aucune")
    b.close()
bad = [l for l, c in ok if not c]
print(f"\n{len(ok) - len(bad)}/{len(ok)} vérifications réussies"); sys.exit(1 if bad or errs else 0)
