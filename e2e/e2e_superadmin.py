"""Test navigateur réel (Chromium) : parcours Super Admin. Usage : python3 e2e/e2e_superadmin.py http://localhost:3001"""
import sys, time
from playwright.sync_api import sync_playwright

B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001"
SFX = str(int(time.time()))[-6:]
errs, ok = [], []
def check(label, cond):
    ok.append((label, bool(cond))); print(("  OK  " if cond else " ECHEC"), label)

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1400, "height": 900})
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(B); pg.wait_for_selector("#email")
    pg.fill("#email", "superadmin@edugestion.test"); pg.fill("#password", "mauvais-mot-de-passe"); pg.click("button.login-submit")
    pg.wait_for_selector(".login-error"); check("mauvais mot de passe refusé", "incorrect" in pg.inner_text(".login-error"))
    pg.fill("#password", "SuperAdmin-Dev-2026"); pg.click("button.login-submit")
    pg.wait_for_selector(".saas-content"); pg.wait_for_timeout(700)
    names = pg.locator(".saas-grid tbody tr td:first-child b").all_inner_texts()
    check("École A et École B listées", "École A" in names and "École B" in names)
    pg.get_by_label("Nom de l'école").fill(f"École C {SFX}")
    pg.get_by_label("Adresse", exact=True).fill("5 rue des Jasmins, Sousse")
    pg.get_by_label("Nom", exact=True).fill("Directrice-C")
    pg.get_by_label("E-mail de connexion").fill(f"admin.c{SFX}@ecole-c.test")
    pg.get_by_label("Mot de passe initial (12+ caractères)").fill("EcoleC-Dev-2026")
    pg.click("text=Créer cette école"); pg.wait_for_selector(".account-success"); pg.wait_for_timeout(600)
    check("école C créée et visible dans la liste", pg.locator(".saas-grid tbody tr", has_text=f"École C {SFX}").count() == 1)
    pg.screenshot(path="/tmp/shots/02_saas.png", full_page=True)
    # recherche / filtre
    pg.get_by_placeholder("Rechercher une école…").fill("École B"); pg.wait_for_timeout(600)
    check("recherche d'école", pg.locator(".saas-grid tbody tr").count() == 1)
    pg.get_by_placeholder("Rechercher une école…").fill("")
    pg.wait_for_timeout(600)
    # entrer dans l'école A
    pg.locator(".saas-grid tbody tr", has_text="École A").first.get_by_text("Entrer").click()
    pg.wait_for_selector(".imp-banner"); pg.wait_for_timeout(600)
    check("bannière Super Admin dans École A", "École A" in pg.inner_text(".imp-banner"))
    pg.screenshot(path="/tmp/shots/03_ecoleA_superadmin.png")
    pg.locator("nav .nav-link", has_text="Élèves").click(); pg.wait_for_timeout(500)
    noms = pg.locator("tbody tr td:first-child").all_inner_texts()
    check("seuls les élèves de l'École A sont visibles", len(noms) >= 5 and all(not n.startswith("B-") for n in noms) and "A-Famille1" in noms)
    pg.reload(); pg.wait_for_selector(".imp-banner")
    check("après F5 on est toujours dans l'École A", "École A" in pg.inner_text(".imp-banner"))
    pg.click("text=Retour au tableau Super Admin"); pg.wait_for_selector(".saas-content")
    check("retour au tableau Super Admin", True)
    pg.locator(".saas-grid tbody tr", has_text="École B").first.get_by_text("Entrer").click(); pg.wait_for_selector(".imp-banner"); pg.wait_for_timeout(500)
    pg.locator("nav .nav-link", has_text="Élèves").click(); pg.wait_for_timeout(500)
    noms = pg.locator("tbody tr td:first-child").all_inner_texts()
    check("École B : seuls les élèves B", len(noms) >= 5 and all(n.startswith("B-") for n in noms))
    pg.click("text=Retour au tableau Super Admin"); pg.wait_for_selector(".saas-content")
    pg.click("text=Déconnexion"); pg.wait_for_selector("#email")
    pg.fill("#email", f"admin.c{SFX}@ecole-c.test"); pg.fill("#password", "EcoleC-Dev-2026"); pg.click("button.login-submit")
    pg.wait_for_selector(".school-hero"); check("l'administrateur de l'école C se connecte", f"École C {SFX}" in pg.inner_text(".top-left"))
    pg.locator("nav .nav-link", has_text="Élèves").click(); pg.wait_for_timeout(400)
    check("école C vierge (aucune donnée des autres écoles)", pg.locator("tbody tr").count() == 0)
    pg.screenshot(path="/tmp/shots/04_adminC.png")
    # persistance : déconnexion / reconnexion
    pg.click("text=Déconnexion"); pg.wait_for_selector("#email")
    pg.fill("#email", f"admin.c{SFX}@ecole-c.test"); pg.fill("#password", "EcoleC-Dev-2026"); pg.click("button.login-submit"); pg.wait_for_selector(".school-hero")
    check("reconnexion après déconnexion", True)
    print("Erreurs console navigateur :", errs if errs else "aucune")
    b.close()
bad = [l for l, c in ok if not c]
print(f"\n{len(ok) - len(bad)}/{len(ok)} vérifications réussies")
sys.exit(1 if bad or errs else 0)
