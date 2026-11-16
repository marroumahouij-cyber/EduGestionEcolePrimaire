import React, { useState, useEffect, useMemo, useRef } from 'react';
import { School, LayoutDashboard, GraduationCap, Users, BookOpen, DoorOpen, ClipboardList, CreditCard, MessageSquare, NotebookPen, CalendarDays, UserX, Settings, Plus, Pencil, Trash2, Menu, Printer, Search, LogOut, ShieldCheck, Heart, ArrowRight, Sun, Star, Sparkles, Bell, Megaphone, Link2, Coins, History, FolderOpen, UserPlus, Check } from 'lucide-react';
import { api, setToken, getToken, getOwnerToken, setOwnerToken, download, money } from './api.js';
import { schemas, EDIT } from './schemas.js';
import { Stat, FormModal, ChangePasswordModal, Login, Modal } from './components.jsx';
import HomeworkModal from './HomeworkModal.jsx';
import { Messages, Announcements } from './Messages.jsx';
import { Accounts, Audit, SettingsPage } from './Admin.jsx';
import SaasAdmin from './Saas.jsx';

const NAV = [['dashboard', 'Tableau de bord', LayoutDashboard], ['students', 'Élèves', GraduationCap], ['classes', 'Classes', School], ['teachers', 'Enseignants', Users], ['assignments', 'Affectations', Link2], ['subjects', 'Matières', BookOpen], ['rooms', 'Salles', DoorOpen],
  ['grades', 'Notes / Bulletins', ClipboardList], ['absences', 'Absences', UserX], ['schedule', 'Emploi du temps', CalendarDays], ['fees', 'Grille tarifaire', Coins], ['payments', 'Paiements', CreditCard], ['homework', 'Devoirs', NotebookPen],
  ['messages', 'Messagerie', MessageSquare], ['announcements', 'Annonces', Megaphone], ['accounts', 'Comptes utilisateurs', Users], ['audit', 'Journal', History], ['settings', 'Paramètres', Settings]];
const ROLE_NAV = {
  Administrateur: NAV.map(n => n[0]),
  Enseignant: ['dashboard', 'students', 'classes', 'grades', 'absences', 'schedule', 'homework', 'messages', 'announcements'],
  Parent: ['dashboard', 'students', 'grades', 'absences', 'schedule', 'payments', 'homework', 'messages', 'announcements'],
  'Élève': ['dashboard', 'grades', 'absences', 'schedule', 'homework', 'messages', 'announcements'],
  Comptable: ['dashboard', 'students', 'fees', 'payments', 'messages', 'announcements']
};
const GREET = { Parent: 'Tout pour accompagner votre enfant', 'Élève': 'Une belle journée pour apprendre !', Enseignant: 'Ensemble, faisons grandir les talents', Comptable: 'Une gestion simple et sereine', Administrateur: 'Grandir et apprendre, ensemble' };
const EMPTY_DB = { students: [], classes: [], teachers: [], assignments: [], subjects: [], rooms: [], grades: [], absences: [], schedule: [], fees: [], payments: [], homework: [] };
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export default function App() {
  const [db, setDb] = useState(EMPTY_DB), [settings, setSettings] = useState({}), [balances, setBalances] = useState({}), [unread, setUnread] = useState({ n: 0, m: 0 });
  const [user, setUser] = useState(null), [page, setPage] = useState('dashboard'), [search, setSearch] = useState(''), [modal, setModal] = useState(null), [sidebar, setSidebar] = useState(false), [toast, setToast] = useState('');
  const [authReady, setAuthReady] = useState(false), [loginError, setLoginError] = useState(''), [passwordOpen, setPasswordOpen] = useState(false), [hw, setHw] = useState(null), [view, setView] = useState('list');
  const [notifs, setNotifs] = useState(null), [pre, setPre] = useState(null);
  const role = user?.role || '';
  const toastTimer = useRef(null);
  const notice = t => { clearTimeout(toastTimer.current); setToast(t); toastTimer.current = setTimeout(() => setToast(''), 4500); };

  const boot = async () => {
    const r = await api('/bootstrap'); setUser(r.user);
    if (r.data) { setDb({ ...EMPTY_DB, ...r.data }); setSettings(r.settings); setBalances(r.balances || {}); setUnread(r.unread || { n: 0, m: 0 }); }
    return r;
  };
  const reloadData = async () => { try { await boot(); } catch (e) { notice(e.message); } };
  useEffect(() => { (async () => { try { if (getToken()) await boot(); } catch { setToken(null); } finally { setAuthReady(true); } })(); }, []);
  const doLogin = async (email, password) => {
    try { setLoginError(''); const r = await api('/login', 'POST', { email, password }); setToken(r.token); setOwnerToken(null); await boot(); setPage('dashboard'); } catch (e) { setLoginError(e.message); }
  };
  const logout = () => { setToken(null); setOwnerToken(null); setUser(null); setDb(EMPTY_DB); setPage('dashboard'); setModal(null); };
  const enterSchool = async token => { setOwnerToken(getToken()); setToken(token); setPage('dashboard'); await boot(); };
  const backToOwner = async () => { setToken(getOwnerToken()); setOwnerToken(null); setPage('dashboard'); await boot(); };

  const show = k => { setPage(k); setSearch(''); setSidebar(false); setModal(null); setView('list'); };
  const canEdit = k => (EDIT[k] || []).includes(role);
  const remove = async (key, id) => {
    if (!confirm('Confirmer la suppression ?')) return;
    try { await api(`/r/${key}/${id}`, 'DELETE'); await reloadData(); notice('Élément supprimé'); }
    catch (e) { if (e.needsConfirm && confirm(e.message)) { try { await api(`/r/${key}/${id}?force=1`, 'DELETE'); await reloadData(); notice('Élément supprimé'); } catch (e2) { notice(e2.message); } } else if (!e.needsConfirm) notice(e.message); }
  };
  const save = async (key, obj, id) => {
    try { await api(`/r/${key}${id ? '/' + id : ''}`, id ? 'PUT' : 'POST', obj); await reloadData(); setModal(null); notice(id ? 'Modification enregistrée' : 'Ajout effectué'); } catch (e) { notice(e.message); }
  };
  const changePassword = async (o, n) => { try { await api('/password', 'POST', { old_password: o, new_password: n }); notice('Mot de passe modifié : reconnectez-vous'); setTimeout(logout, 900); } catch (e) { notice(e.message); } };
  const openNotifs = async () => { try { const r = await api('/notifications'); setNotifs(r); } catch (e) { notice(e.message); } };
  const readNotifs = async () => { await api('/notifications/read', 'POST', {}); setNotifs(n => ({ ...n, items: n.items.map(x => ({ ...x, lu: true })), unread: 0 })); setUnread(u => ({ ...u, n: 0 })); };
  const dl = (p, f) => download(p, f).catch(e => notice(e.message));

  const stats = useMemo(() => {
    const sum = db.payments.reduce((n, x) => n + Number(x.montant || 0), 0), rest = Object.values(balances).reduce((n, b) => n + b.reste, 0);
    switch (role) {
      case 'Parent': return [['Mes enfants', db.students.length, GraduationCap, 'blue'], ['Devoirs', db.homework.length, NotebookPen, 'violet'], ['Solde restant', money(rest), CreditCard, 'orange'], ['Messages non lus', unread.m, MessageSquare, 'green']];
      case 'Élève': return [['Devoirs', db.homework.length, NotebookPen, 'blue'], ['Notes', db.grades.length, ClipboardList, 'violet'], ['Absences', db.absences.length, UserX, 'orange'], ['Messages non lus', unread.m, MessageSquare, 'green']];
      case 'Enseignant': return [['Mes élèves', db.students.length, GraduationCap, 'blue'], ['Mes classes', db.classes.length, School, 'violet'], ['Devoirs', db.homework.length, NotebookPen, 'green'], ['Messages non lus', unread.m, MessageSquare, 'orange']];
      case 'Comptable': return [['Élèves', db.students.length, GraduationCap, 'blue'], ['Paiements saisis', money(sum), CreditCard, 'orange'], ['Solde restant', money(rest), Coins, 'violet'], ['Messages non lus', unread.m, MessageSquare, 'green']];
      default: return [['Élèves inscrits', db.students.filter(s => s.statut !== 'preinscrit').length, GraduationCap, 'blue'], ['Classes actives', db.classes.length, School, 'violet'], ['Enseignants', db.teachers.length, Users, 'green'], ['Paiements saisis', money(sum), CreditCard, 'orange']];
    }
  }, [db, balances, unread, role]);

  if (!authReady) return <div className="loading-screen">Connexion au serveur…</div>;
  if (!user) return <Login onLogin={doLogin} error={loginError} />;
  if (role === 'SuperAdmin') return <SaasAdmin user={user} onLogout={logout} onEnter={enterSchool} />;

  const cfg = schemas[page];
  const rows = cfg && Array.isArray(db[page]) ? db[page].filter(r => cfg.cols.some(([k, , fmt]) => String(fmt ? fmt(r[k], r) : r[k] ?? '').toLowerCase().includes(search.toLowerCase()))) : [];
  const title = page === 'dashboard' ? 'Bonjour et bienvenue !' : cfg?.title || NAV.find(n => n[0] === page)?.[1] || '';
  const navCount = k => k === 'messages' ? unread.m : 0;
  const quick = {
    Parent: [['grades', 'Voir les notes', ClipboardList], ['homework', 'Consulter les devoirs', NotebookPen], ['payments', 'Suivre les paiements', CreditCard], ['messages', 'Contacter l’école', MessageSquare]],
    'Élève': [['homework', 'Mes devoirs', NotebookPen], ['grades', 'Mes notes', ClipboardList], ['schedule', 'Mon emploi du temps', CalendarDays], ['messages', 'Mes messages', MessageSquare]],
    Enseignant: [['students', 'Mes élèves', GraduationCap], ['grades', 'Saisir des notes', ClipboardList], ['homework', 'Gérer les devoirs', NotebookPen], ['messages', 'Messagerie', MessageSquare]],
    Comptable: [['students', 'Consulter les élèves', GraduationCap], ['payments', 'Enregistrer un paiement', CreditCard], ['fees', 'Grille tarifaire', Coins], ['messages', 'Messagerie', MessageSquare]],
    Administrateur: [['students', 'Gérer les élèves', GraduationCap], ['grades', 'Saisir des notes', ClipboardList], ['payments', 'Enregistrer un paiement', CreditCard], ['announcements', 'Publier une annonce', Megaphone]]
  }[role] || [];
  const heroAction = { Parent: ['grades', 'Consulter les notes'], 'Élève': ['homework', 'Voir mes devoirs'], Comptable: ['payments', 'Voir les paiements'] }[role] || ['students', 'Découvrir mon espace'];

  return <div className="layout">
    <aside className={'sidebar ' + (sidebar ? 'show' : '')}><div className="brand"><span className="brand-icon"><img src="/images/logo-ecole.svg" alt="Logo de l'école" /></span><span><b>EduGestion<span className="brand-dot">.</span></b><small>Portail scolaire</small></span></div><div className="side-label">MON ESPACE SCOLAIRE</div>
      <nav aria-label="Navigation principale">{NAV.filter(([k]) => ROLE_NAV[role]?.includes(k)).map(([k, txt, Icon]) => <button key={k} className={'nav-link ' + (page === k ? 'selected' : '')} onClick={() => show(k)} aria-current={page === k ? 'page' : undefined}><Icon size={19} /><span>{txt}</span>{navCount(k) > 0 && <span className="sent-badge">{navCount(k)}</span>}{page === k && <span className="nav-current-dot" />}</button>)}</nav>
      <div className="sidebar-love"><Sun size={26} /><b>Chaque jour, une nouvelle découverte !</b><span>Apprendre avec le sourire.</span></div><div className="aside-footer"><ShieldCheck size={16} /> Connexion sécurisée</div></aside>
    <section className="workspace">
      {user.impersonated && <div className="imp-banner"><span><b>Mode Super Admin :</b> vous gérez « {settings.school} ». Vos actions sont enregistrées dans le journal.</span><button className="btn btn-light" onClick={backToOwner}>← Retour au tableau Super Admin</button></div>}
      <header className="topbar"><div className="top-left"><button className="icon-button mobile-only" aria-label="Ouvrir le menu" onClick={() => setSidebar(!sidebar)}><Menu size={22} /></button><div><b>{title}</b><small><Sun size={13} /> {settings.school} · Année scolaire {settings.annee}</small></div></div>
        <div className="top-actions" style={{ position: 'relative' }}><span className="role-label"><b>{role}</b><small>{user.email}</small></span><span className="avatar" aria-hidden="true">{role[0]}</span>
          <button className="btn btn-light logout-btn" type="button" aria-label="Notifications" onClick={() => notifs ? setNotifs(null) : openNotifs()}><Bell size={16} />{unread.n > 0 && <span className="sent-badge">{unread.n}</span>}</button>
          <button className="btn btn-light logout-btn" onClick={() => setPasswordOpen(true)} type="button">Mot de passe</button><button className="btn btn-light logout-btn" onClick={logout}><LogOut size={16} /><span>Déconnexion</span></button>
          {notifs && <div className="notif-panel"><div className="notif-head"><b>Notifications</b><button className="btn btn-light" onClick={readNotifs}>Tout marquer comme lu</button></div>{notifs.items.length === 0 && <p className="empty">Aucune notification.</p>}{notifs.items.map(n => <div key={n.id} className={'notif-item ' + (n.lu ? '' : 'new')}><b>{n.titre}</b><small>{n.corps}</small></div>)}</div>}</div></header>
      <main className="main">
        {page === 'dashboard' && <><div className="school-hero"><div className="hero-copy"><div className="hero-kicker"><Sparkles size={16} /> MON UNIVERS SCOLAIRE</div><h1>{GREET[role]}</h1><p>Bienvenue dans l'espace de {settings.school}. Retrouvez les informations importantes, simplement et avec le sourire.</p><button className="hero-action" onClick={() => show(heroAction[0])}><span>{heroAction[1]}</span><ArrowRight size={18} /></button></div><img className="hero-art" src="/images/hero-ecole.svg" alt="Illustration d'enfants apprenant ensemble à l'école" /><span className="hero-spark hero-spark-one">✦</span><span className="hero-spark hero-spark-two">✳</span></div>
          <div className="section-heading"><div><span className="eyebrow">EN UN COUP D'ŒIL</span><h2>La vie de votre école <Heart size={20} /></h2></div><span className="section-hint">Année {settings.annee}</span></div>
          <div className="stats">{stats.map(([t, v, I, c]) => <Stat key={t} title={t} value={v} Icon={I} color={c} />)}</div>
          <div className="dashboard-grid"><div className="panel"><div className="panel-title"><div><span className="eyebrow">ACCÈS RAPIDE</span><h3>Que souhaitez-vous faire ?</h3></div><span>Un clic suffit</span></div><div className="quick-grid">{quick.map(([k, l, I], i) => <button key={k} className={'quick-card quick-' + i} onClick={() => show(k)}><span className="quick-icon"><I size={23} /></span><b>{l}</b><span className="quick-arrow"><ArrowRight size={16} /></span></button>)}</div></div>
            <div className="panel"><div className="panel-title"><div><span className="eyebrow">ACTUALITÉ</span><h3>{role === 'Parent' ? 'Mon enfant' : role === 'Élève' ? 'Mon école' : 'Nos petits explorateurs'}</h3></div><span>{db.students.length} élève(s)</span></div>
              {db.students.slice(-5).reverse().map(s => <div className="student-row" key={s.id}><span className="round-initial">{s.prenom[0]}{s.nom[0]}</span><div><b>{s.prenom} {s.nom}</b><small>{s.classe_label ? 'Classe ' + s.classe_label : 'Sans classe'}</small></div><Star className="student-star" size={16} /></div>)}
              {db.students.length === 0 && <p className="empty">Aucun élève pour le moment.</p>}</div></div></>}

        {page === 'messages' && <Messages role={role} notice={notice} onRead={reloadData} />}
        {page === 'announcements' && <Announcements role={role} notice={notice} />}
        {page === 'accounts' && role === 'Administrateur' && <Accounts students={db.students} notice={notice} reloadData={reloadData} />}
        {page === 'audit' && role === 'Administrateur' && <Audit notice={notice} />}
        {page === 'settings' && role === 'Administrateur' && <SettingsPage key={settings.school + settings.annee} settings={settings} notice={notice} reloadData={reloadData} />}

        {cfg && <><div className="page-heading"><div><div className="eyebrow">GESTION SCOLAIRE</div><h1>{cfg.title}</h1><p>Consultez et gérez les enregistrements du module.</p></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {page === 'schedule' && <button className="btn btn-light" onClick={() => setView(view === 'list' ? 'week' : 'list')}>{view === 'list' ? 'Vue semaine' : 'Vue liste'}</button>}
            {page === 'students' && role === 'Parent' && <button className="btn" onClick={() => setPre({ nom: '', prenom: '', date_naissance: '', medical: '' })}><UserPlus size={17} /> Pré-inscrire un enfant</button>}
            {canEdit(page) && <button className="btn" onClick={() => setModal({ key: page, values: {} })}><Plus size={17} /> Ajouter</button>}</div></div>
          {page === 'schedule' && view === 'week' ? <WeekGrid rows={db.schedule} /> :
            <div className="panel table-panel"><div className="toolbar"><div className="search"><Search size={17} /><input placeholder="Rechercher dans la liste..." value={search} onChange={e => setSearch(e.target.value)} /></div><span className="count">{rows.length} élément(s)</span></div>
              <div className="table-scroll"><table><thead><tr>{cfg.cols.map(([k, t]) => <th key={k}>{t}</th>)}{page === 'payments' && <th>Solde restant</th>}<th>Actions</th></tr></thead><tbody>
                {rows.map(row => <tr key={row.id}>{cfg.cols.map(([k, , fmt]) => <td key={k}>{fmt ? fmt(row[k], row) : String(row[k] ?? '')}</td>)}{page === 'payments' && <td>{balances[row.student_id] ? money(balances[row.student_id].reste) : ''}</td>}
                  <td><div className="row-actions">
                    {canEdit(page) && <><button title="Modifier" onClick={() => setModal({ key: page, values: { ...row } })}><Pencil size={15} /></button><button title="Supprimer" onClick={() => remove(page, row.id)}><Trash2 size={15} /></button></>}
                    {page === 'payments' && <button title="Télécharger le reçu PDF" onClick={() => dl('/pdf/recu/' + row.id, (row.numero_recu || 'recu') + '.pdf')}><Printer size={15} /></button>}
                    {page === 'students' && role !== 'Comptable' && row.statut !== 'preinscrit' && <button title="Télécharger le bulletin PDF" onClick={() => dl('/pdf/bulletin/' + row.id, `bulletin-${row.nom}.pdf`)}><Printer size={15} /></button>}
                    {page === 'homework' && <button title="Dépôts, notes et correction" onClick={() => setHw(row)}><FolderOpen size={15} /></button>}
                    {page === 'absences' && role === 'Parent' && !row.justifiee && <button title="Justifier l'absence" onClick={async () => { const j = prompt('Motif de la justification :'); if (j) try { await api(`/absences/${row.id}/justify`, 'POST', { justification: j }); await reloadData(); notice('Absence justifiée'); } catch (e) { notice(e.message); } }}><Check size={15} /></button>}
                  </div></td></tr>)}</tbody></table>{!rows.length && <div className="empty">Aucun résultat. {canEdit(page) ? 'Cliquez sur « Ajouter » pour commencer.' : ''}</div>}</div></div>}
          {page === 'grades' && <div className="panel info-panel"><h3>Calcul des moyennes</h3><p>Chaque note est ramenée sur 20 selon son barème. La moyenne d'une matière est la moyenne de ses évaluations ; la moyenne générale pondère chaque matière par son coefficient. Le bulletin PDF se télécharge depuis la page « Élèves » (icône imprimante).</p></div>}
          {page === 'payments' && <div className="panel info-panel"><h3>Enregistrement des paiements</h3><p>Chaque paiement génère un reçu PDF numéroté et envoie automatiquement un message (montant, date, mode, solde restant, reçu) au parent concerné ; l'envoi est consigné dans le journal. Le solde = grille tarifaire de l'année − paiements.</p></div>}
          {page === 'students' && role === 'Parent' && <div className="panel info-panel"><h3>Pré-inscription</h3><p>Utilisez « Pré-inscrire un enfant » : la direction validera la demande et affectera une classe.</p></div>}</>}
      </main></section>
    {toast && <div className="toast">{toast}</div>}
    {passwordOpen && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setPasswordOpen(false); }}><ChangePasswordModal onClose={() => setPasswordOpen(false)} onSave={changePassword} /></div>}
    {modal && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><FormModal key={modal.values.id || modal.key} config={cfg} initial={modal.values} db={db} onClose={() => setModal(null)} onSave={v => save(modal.key, v, modal.values.id)} /></div>}
    {hw && <HomeworkModal hw={db.homework.find(h => h.id === hw.id) || hw} role={role} notice={notice} onClose={() => setHw(null)} onChanged={reloadData} />}
    {pre && <Modal title="Pré-inscrire un enfant" onClose={() => setPre(null)} footer={<><button className="btn btn-light" onClick={() => setPre(null)}>Annuler</button><button className="btn" disabled={!pre.nom || !pre.prenom} onClick={async () => { try { await api('/preinscription', 'POST', pre); setPre(null); await reloadData(); notice('Demande envoyée à la direction'); } catch (e) { notice(e.message); } }}>Envoyer</button></>}>
      {[['nom', 'Nom', 'text'], ['prenom', 'Prénom', 'text'], ['date_naissance', 'Date de naissance', 'date']].map(([k, l, t]) => <label key={k} className="form-field"><span>{l}</span><input type={t} value={pre[k]} onChange={e => setPre({ ...pre, [k]: e.target.value })} /></label>)}
      <label className="form-field"><span>Antécédents médicaux (facultatif)</span><textarea rows="3" value={pre.medical} onChange={e => setPre({ ...pre, medical: e.target.value })} /></label></Modal>}
  </div>;
}

function WeekGrid({ rows }) {
  return <div className="week-grid">{DAYS.map(d => <div key={d} className="week-col"><b>{d}</b>{rows.filter(r => r.jour === d).sort((a, b) => a.debut.localeCompare(b.debut)).map(r => <div key={r.id} className="week-slot"><b>{r.debut}–{r.fin}</b><span>{r.subject_label || 'Cours'}</span><small>{r.class_label}{r.room_label ? ' · ' + r.room_label : ''}{r.teacher_label ? ' · ' + r.teacher_label : ''}</small></div>)}</div>)}</div>;
}
