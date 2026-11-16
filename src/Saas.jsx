import React, { useEffect, useState } from 'react';
import { LogOut, Plus, Search, LogIn } from 'lucide-react';
import { api, fdate } from './api.js';
import { Modal } from './components.jsx';

const STATUS = { active: 'Active', trial: 'Essai', suspended: 'Suspendue', archived: 'Archivée' };
const EMPTY = { name: '', address: '', email: '', phone: '', plan: 'basic', subscription_end: '', admin_nom: '', admin_prenom: '', admin_email: '', admin_password: '' };

export default function SaasAdmin({ user, onLogout, onEnter }) {
  const [schools, setSchools] = useState([]), [q, setQ] = useState(''), [status, setStatus] = useState(''), [form, setForm] = useState(EMPTY), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null), [admins, setAdmins] = useState(null), [audit, setAudit] = useState([]);
  const reload = async () => { try { setSchools(await api(`/saas/schools?q=${encodeURIComponent(q)}&status=${status}`)); setAudit(await api('/saas/audit')); } catch (e) { setErr(e.message); } };
  useEffect(() => { reload(); }, [q, status]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const flash = (ok, e) => { setMsg(ok || ''); setErr(e || ''); };
  const run = async (fn, ok) => { try { flash(); await fn(); flash(ok); await reload(); } catch (e) { flash('', e.message); } };
  const create = async e => { e.preventDefault(); setBusy(true); await run(async () => { await api('/saas/schools', 'POST', { ...form, subscription_end: form.subscription_end || null }); setForm(EMPTY); }, 'École et compte de direction créés. L’administrateur peut se connecter.'); setBusy(false); };
  const enter = async s => { try { flash(); const r = await api(`/saas/schools/${s.id}/enter`, 'POST'); onEnter(r.token); } catch (e) { flash('', e.message); } };
  const del = s => { const n = prompt(`SUPPRESSION DÉFINITIVE de « ${s.name} » et de toutes ses données.\nTapez le nom exact de l'école pour confirmer :`); if (n !== null) run(() => api('/saas/schools/' + s.id, 'DELETE', { confirm_name: n }), 'École supprimée définitivement'); };
  const resetAdmin = (s, a) => { const p = prompt(`Nouveau mot de passe pour ${a.email} (12 caractères minimum) :`); if (p) run(async () => { await api(`/saas/schools/${s.id}/admins/${a.id}/reset-password`, 'POST', { password: p }); }, 'Mot de passe réinitialisé'); };
  const current = admins && schools.find(s => s.id === admins);
  const [newAdmin, setNewAdmin] = useState({ email: '', password: '', nom: '', prenom: '' });
  return <main className="saas-layout">
    <div className="saas-header"><div className="brand"><span className="brand-icon"><img src="/images/logo-ecole.svg" alt="EduGestion" /></span><span><b>EduGestion SaaS</b><small>Super-administration</small></span></div><div className="saas-user"><span>{user.email}</span><button type="button" className="btn btn-light" onClick={onLogout}><LogOut size={16} /> Déconnexion</button></div></div>
    <section className="saas-content"><span className="eyebrow">GESTION MULTI-ÉCOLES</span><h1>Bienvenue, propriétaire de la plateforme !</h1>
      <p>Chaque école a ses propres utilisateurs, élèves, notes et paiements, totalement séparés. Utilisez « Entrer » pour gérer une école ; vos actions y sont enregistrées dans le journal d'audit.</p>
      <div className="saas-summary"><div className="ecole-carte"><b>Écoles</b><strong>{schools.length}</strong></div><div className="ecole-carte"><b>Utilisateurs</b><strong>{schools.reduce((n, s) => n + s.user_count, 0)}</strong></div><div className="ecole-carte"><b>Élèves</b><strong>{schools.reduce((n, s) => n + s.student_count, 0)}</strong></div></div>
      {err && <p role="alert" className="account-error">{err}</p>}{msg && <p role="status" className="account-success">{msg}</p>}
      <div className="saas-grid">
        <div className="panel account-panel"><h2>Ajouter une école</h2><form className="accounts-form" onSubmit={create}>
          <label>Nom de l'école<input required minLength={3} maxLength={200} value={form.name} onChange={e => set('name', e.target.value)} placeholder="École des Fleurs" /></label>
          <label>Adresse<input value={form.address} onChange={e => set('address', e.target.value)} /></label>
          <label>E-mail de l'école<input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></label>
          <label>Téléphone<input value={form.phone} onChange={e => set('phone', e.target.value)} /></label>
          <label>Formule<select value={form.plan} onChange={e => set('plan', e.target.value)}><option value="basic">Basic</option><option value="pro">Pro</option></select></label>
          <label>Fin de l'abonnement (facultatif)<input type="date" value={form.subscription_end} onChange={e => set('subscription_end', e.target.value)} /></label>
          <h3 style={{ margin: '8px 0 0' }}>Administrateur de l'école</h3>
          <label>Nom<input required value={form.admin_nom} onChange={e => set('admin_nom', e.target.value)} /></label><label>Prénom<input value={form.admin_prenom} onChange={e => set('admin_prenom', e.target.value)} /></label>
          <label>E-mail de connexion<input required type="email" value={form.admin_email} onChange={e => set('admin_email', e.target.value)} placeholder="directeur@ecole.tn" /></label>
          <label>Mot de passe initial (12+ caractères)<input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={form.admin_password} onChange={e => set('admin_password', e.target.value)} /></label>
          <button className="btn" type="submit" disabled={busy}><Plus size={17} />{busy ? 'Création…' : 'Créer cette école'}</button></form></div>
        <div className="panel account-panel"><h2>Établissements ({schools.length})</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}><div className="search" style={{ flex: 1, minWidth: 200 }}><Search size={17} /><input placeholder="Rechercher une école…" value={q} onChange={e => setQ(e.target.value)} /></div>
            <select aria-label="Filtrer par statut" value={status} onChange={e => setStatus(e.target.value)}><option value="">Tous les statuts</option>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="table-scroll"><table><thead><tr><th>École</th><th>Administrateur</th><th>Utilisateurs</th><th>Élèves</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
            {schools.map(s => <tr key={s.id}><td><b>{s.name}</b><br /><small>#{s.id} · {s.plan}{s.subscription_end ? ' · jusqu’au ' + String(s.subscription_end).slice(0, 10) : ''}</small></td><td>{s.admins.map(a => <div key={a.id}><small>{a.email}{!a.active && ' (désactivé)'}</small></div>)}</td><td>{s.user_count}</td><td>{s.student_count}</td><td>{STATUS[s.status]}</td>
              <td><div className="btn-row">
                {s.status !== 'archived' && <button className="btn" onClick={() => enter(s)}><LogIn size={15} /> Entrer</button>}
                <button className="btn btn-light" onClick={() => setEdit({ ...s, subscription_end: s.subscription_end ? String(s.subscription_end).slice(0, 10) : '' })}>Modifier</button>
                <button className="btn btn-light" onClick={() => { setAdmins(s.id); setNewAdmin({ email: '', password: '', nom: '', prenom: '' }); }}>Admins</button>
                {s.status === 'suspended' ? <button className="btn btn-light" onClick={() => run(() => api('/saas/schools/' + s.id, 'PATCH', { status: 'active' }), 'École activée')}>Activer</button>
                  : s.status !== 'archived' && <button className="btn btn-light" onClick={() => confirm(`Suspendre « ${s.name} » ? Plus personne ne pourra s'y connecter.`) && run(() => api('/saas/schools/' + s.id, 'PATCH', { status: 'suspended' }), 'École suspendue')}>Suspendre</button>}
                {s.status === 'archived' ? <><button className="btn btn-light" onClick={() => run(() => api('/saas/schools/' + s.id, 'PATCH', { status: 'active' }), 'École restaurée')}>Restaurer</button><button className="btn btn-outline-danger" onClick={() => del(s)}>Supprimer</button></>
                  : <button className="btn btn-outline-danger" onClick={() => confirm(`Archiver « ${s.name} » ? Les données sont conservées mais l'école devient inaccessible.`) && run(() => api('/saas/schools/' + s.id, 'PATCH', { status: 'archived' }), 'École archivée')}>Archiver</button>}
              </div></td></tr>)}</tbody></table>{!schools.length && <div className="empty">Aucune école.</div>}</div></div></div>
      <div className="panel account-panel" style={{ marginTop: 24 }}><h2>Journal de la plateforme</h2><div className="table-scroll"><table><thead><tr><th>Date</th><th>Compte</th><th>Action</th><th>École</th></tr></thead><tbody>{audit.slice(0, 40).map(a => <tr key={a.id}><td>{fdate(a.at)}</td><td>{a.actor_email}</td><td>{a.action}</td><td>{a.school_name || a.school_id || '—'}</td></tr>)}</tbody></table></div></div>
    </section>
    {edit && <Modal title={`Modifier — ${edit.name}`} onClose={() => setEdit(null)} footer={<><button className="btn btn-light" onClick={() => setEdit(null)}>Annuler</button><button className="btn" onClick={() => run(async () => { await api('/saas/schools/' + edit.id, 'PATCH', { name: edit.name, address: edit.address || '', email: edit.email || '', phone: edit.phone || '', plan: edit.plan, status: edit.status, subscription_end: edit.subscription_end || null }); setEdit(null); }, 'École modifiée')}>Enregistrer</button></>}>
      {[['name', 'Nom'], ['address', 'Adresse'], ['email', 'E-mail'], ['phone', 'Téléphone']].map(([k, l]) => <label key={k} className="form-field"><span>{l}</span><input value={edit[k] || ''} onChange={e => setEdit({ ...edit, [k]: e.target.value })} /></label>)}
      <label className="form-field"><span>Formule</span><select value={edit.plan} onChange={e => setEdit({ ...edit, plan: e.target.value })}><option value="basic">Basic</option><option value="pro">Pro</option></select></label>
      <label className="form-field"><span>Statut</span><select value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })}>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="form-field"><span>Fin d'abonnement</span><input type="date" value={edit.subscription_end} onChange={e => setEdit({ ...edit, subscription_end: e.target.value })} /></label></Modal>}
    {current && <Modal title={`Administrateurs — ${current.name}`} onClose={() => setAdmins(null)} wide footer={<button className="btn btn-light" onClick={() => setAdmins(null)}>Fermer</button>}>
      <div className="table-scroll"><table><thead><tr><th>Nom</th><th>E-mail</th><th>Dernière connexion</th><th>État</th><th>Actions</th></tr></thead><tbody>{current.admins.map(a => <tr key={a.id}><td>{a.prenom} {a.nom}</td><td>{a.email}</td><td>{a.last_login ? fdate(a.last_login) : 'jamais'}</td><td>{a.active ? 'Actif' : 'Désactivé'}</td>
        <td><div className="btn-row"><button className="btn btn-light" onClick={() => resetAdmin(current, a)}>Mot de passe</button><button className="btn btn-light" onClick={() => run(() => api(`/saas/schools/${current.id}/admins/${a.id}`, 'PATCH', { active: !a.active }), a.active ? 'Administrateur désactivé' : 'Administrateur réactivé')}>{a.active ? 'Désactiver' : 'Réactiver'}</button></div></td></tr>)}</tbody></table></div>
      <h3>Ajouter un administrateur</h3><form className="accounts-form" onSubmit={e => { e.preventDefault(); run(async () => { await api(`/saas/schools/${current.id}/admins`, 'POST', newAdmin); setNewAdmin({ email: '', password: '', nom: '', prenom: '' }); }, 'Administrateur ajouté'); }}>
        <label>Nom<input required value={newAdmin.nom} onChange={e => setNewAdmin({ ...newAdmin, nom: e.target.value })} /></label><label>E-mail<input required type="email" value={newAdmin.email} onChange={e => setNewAdmin({ ...newAdmin, email: e.target.value })} /></label>
        <label>Mot de passe (12+)<input required type="password" minLength={12} autoComplete="new-password" value={newAdmin.password} onChange={e => setNewAdmin({ ...newAdmin, password: e.target.value })} /></label><button className="btn" type="submit">Ajouter</button></form></Modal>}
  </main>;
}
