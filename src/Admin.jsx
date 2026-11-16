import React, { useEffect, useState } from 'react';
import { Plus, Download, Upload } from 'lucide-react';
import { api, download, fdate } from './api.js';
import { Modal } from './components.jsx';

export function Accounts({ students, notice, reloadData }) {
  const [accounts, setAccounts] = useState([]), [form, setForm] = useState({ email: '', password: '', role: 'Parent', nom: '', prenom: '', student_ids: [], student_id: '' }), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [links, setLinks] = useState(null);
  const reload = async () => { try { setAccounts(await api('/users')); } catch (e) { setErr(e.message); } };
  useEffect(() => { reload(); }, []);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const create = async e => { e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    try { await api('/users', 'POST', form); setMsg('Compte créé. Le titulaire peut se connecter avec cet e-mail et le mot de passe choisi.'); setForm(f => ({ ...f, email: '', password: '', nom: '', prenom: '', student_ids: [], student_id: '' })); await reload(); reloadData(); }
    catch (e2) { setErr(e2.message); } finally { setBusy(false); } };
  const act = async (fn, ok) => { try { await fn(); notice(ok); reload(); reloadData(); } catch (e) { notice(e.message); } };
  const reset = u => { const p = prompt(`Nouveau mot de passe pour ${u.email} (12 caractères minimum) :`); if (p) act(() => api(`/users/${u.id}/reset-password`, 'POST', { password: p }), 'Mot de passe réinitialisé'); };
  return <><div className="page-heading"><div><div className="eyebrow">ADMINISTRATION</div><h1>Comptes utilisateurs</h1><p>Créez un accès personnel pour chaque enseignant, parent, élève ou comptable de votre école.</p></div></div>
    <div className="panel account-panel"><h3>Créer un compte</h3><form className="accounts-form" onSubmit={create}>
      <label>Type de compte<select value={form.role} onChange={e => set('role', e.target.value)}>{['Parent', 'Élève', 'Comptable', 'Enseignant'].map(r => <option key={r}>{r}</option>)}</select></label>
      <label>Nom<input required value={form.nom} onChange={e => set('nom', e.target.value)} /></label><label>Prénom<input value={form.prenom} onChange={e => set('prenom', e.target.value)} /></label>
      <label>Adresse e-mail<input required type="email" autoComplete="off" maxLength={254} value={form.email} onChange={e => set('email', e.target.value)} /></label>
      <label>Mot de passe initial (12 caractères minimum)<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={form.password} onChange={e => set('password', e.target.value)} /></label>
      {form.role === 'Parent' && <label>Enfant(s) associé(s) (Ctrl/⌘ + clic pour en choisir plusieurs)<select multiple size={Math.min(6, Math.max(3, students.length))} value={form.student_ids.map(String)} onChange={e => set('student_ids', [...e.target.selectedOptions].map(o => Number(o.value)))}>{students.map(s => <option key={s.id} value={s.id}>{s.prenom} {s.nom} — {s.classe_label || 'sans classe'}</option>)}</select></label>}
      {form.role === 'Élève' && <label>Élève associé<select required value={form.student_id} onChange={e => set('student_id', e.target.value)}><option value="">Choisir un élève</option>{students.map(s => <option key={s.id} value={s.id}>{s.prenom} {s.nom} — {s.classe_label || 'sans classe'}</option>)}</select></label>}
      {err && <p role="alert" className="account-error">{err}</p>}{msg && <p role="status" className="account-success">{msg}</p>}
      <button className="btn" disabled={busy} type="submit"><Plus size={17} />{busy ? 'Enregistrement…' : 'Créer le compte'}</button></form></div>
    <div className="panel account-panel"><h3>Comptes de l'école ({accounts.length})</h3><p>Les mots de passe ne sont jamais affichés. Un compte désactivé ne peut plus se connecter.</p><div className="table-scroll"><table><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Lié à</th><th>État</th><th>Actions</th></tr></thead><tbody>
      {accounts.map(u => { const locked = u.role === 'Administrateur'; return <tr key={u.id}><td>{u.prenom} {u.nom}</td><td>{u.email}</td><td>{u.role}</td><td>{u.role === 'Parent' ? u.parent_of.map(c => c.label).join(', ') || '—' : u.student_label || '—'}</td><td>{u.active ? 'Actif' : 'Désactivé'}</td>
        <td>{locked ? <small>Géré par le Super Admin</small> : <div className="btn-row">
          <button className="btn btn-light" onClick={() => act(() => api('/users/' + u.id, 'PATCH', { active: !u.active }), u.active ? 'Compte désactivé' : 'Compte réactivé')}>{u.active ? 'Désactiver' : 'Réactiver'}</button>
          <button className="btn btn-light" onClick={() => reset(u)}>Mot de passe</button>
          {u.role === 'Parent' && <button className="btn btn-light" onClick={() => setLinks({ id: u.id, email: u.email, ids: u.parent_of.map(c => c.id) })}>Enfants</button>}
          <button className="btn btn-outline-danger" onClick={() => confirm(`Supprimer le compte ${u.email} ?`) && act(() => api('/users/' + u.id, 'DELETE'), 'Compte supprimé')}>Supprimer</button></div>}</td></tr>; })}
    </tbody></table></div></div>
    {links && <Modal title={`Enfants de ${links.email}`} onClose={() => setLinks(null)} footer={<><button className="btn btn-light" onClick={() => setLinks(null)}>Annuler</button><button className="btn" onClick={() => act(async () => { await api('/users/' + links.id, 'PATCH', { student_ids: links.ids }); setLinks(null); }, 'Liens enregistrés')}>Enregistrer</button></>}>
      {students.map(s => <label key={s.id} className="form-field" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><input type="checkbox" style={{ width: 20, height: 20 }} checked={links.ids.includes(s.id)} onChange={e => setLinks(l => ({ ...l, ids: e.target.checked ? [...l.ids, s.id] : l.ids.filter(x => x !== s.id) }))} /><span>{s.prenom} {s.nom} — {s.classe_label || 'sans classe'}</span></label>)}</Modal>}
  </>;
}

export function Audit({ notice }) {
  const [rows, setRows] = useState([]), [log, setLog] = useState([]);
  useEffect(() => { api('/audit').then(setRows).catch(e => notice(e.message)); api('/delivery-log').then(setLog).catch(() => {}); }, []);
  const short = v => v ? JSON.stringify(v).slice(0, 110) : '';
  return <><div className="page-heading"><div><div className="eyebrow">TRAÇABILITÉ</div><h1>Journal d'audit</h1><p>Qui a fait quoi, quand, avec les anciennes et nouvelles valeurs. (300 dernières actions)</p></div></div>
    <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Module</th><th>N°</th><th>Avant</th><th>Après</th></tr></thead><tbody>
      {rows.map(a => <tr key={a.id}><td>{fdate(a.at)}</td><td>{a.actor_email}{a.impersonated && ' (Super Admin)'}</td><td>{a.action}</td><td>{a.entity}</td><td>{a.entity_id}</td><td><small>{short(a.old_values)}</small></td><td><small>{short(a.new_values)}</small></td></tr>)}</tbody></table>{!rows.length && <div className="empty">Aucune entrée.</div>}</div></div>
    <div className="page-heading" style={{ marginTop: 24 }}><div><h1 style={{ fontSize: 22 }}>Journal des envois automatiques</h1><p>Messages et notifications envoyés (date, destinataire, canal, statut).</p></div></div>
    <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Date</th><th>Destinataire</th><th>Canal</th><th>Sujet</th><th>Statut</th></tr></thead><tbody>{log.map(l => <tr key={l.id}><td>{fdate(l.at)}</td><td>{l.destinataire}</td><td>{l.canal}</td><td>{l.sujet}</td><td>{l.statut}</td></tr>)}</tbody></table>{!log.length && <div className="empty">Aucun envoi.</div>}</div></div></>;
}

export function SettingsPage({ settings, notice, reloadData }) {
  const [v, setV] = useState({ school: settings.school, annee: settings.annee, tarif: settings.tarif, address: settings.address || '', email: settings.email || '', phone: settings.phone || '' });
  const [result, setResult] = useState(null);
  const set = (k, x) => setV(s => ({ ...s, [k]: x }));
  const save = async () => { try { await api('/settings', 'PATCH', v); await reloadData(); notice('Paramètres enregistrés'); } catch (e) { notice(e.message); } };
  const importCsv = async e => {
    const f = e.target.files[0]; if (!f) return; e.target.value = '';
    try {
      const text = (await f.text()).replace(/^\uFEFF/, ''), lines = text.split(/\r?\n/).filter(Boolean), sep = lines[0].includes(';') ? ';' : ',';
      const split = l => l.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
      const head = split(lines[0]).map(h => h.toLowerCase());
      const rows = lines.slice(1).map(l => Object.fromEntries(split(l).map((c, i) => [head[i], c])));
      const r = await api('/students/import', 'POST', { rows }); setResult(r); await reloadData(); notice(`${r.created} élève(s) importé(s)`);
    } catch (err) { notice(err.message); }
  };
  return <><div className="page-heading"><div><div className="eyebrow">CONFIGURATION</div><h1>Paramètres de l'école</h1><p>Informations de l'établissement, année scolaire courante et import / export des élèves.</p></div></div>
    <div className="panel settings-panel"><h3>Établissement</h3>
      <label>Nom de l'école</label><input value={v.school} onChange={e => set('school', e.target.value)} />
      <label>Année scolaire courante (ex. 2026-2027)</label><input value={v.annee} onChange={e => set('annee', e.target.value)} />
      <label>Tarif annuel par défaut (DT) — utilisé si la grille tarifaire est vide</label><input type="number" value={v.tarif} onChange={e => set('tarif', e.target.value)} />
      <label>Adresse</label><input value={v.address} onChange={e => set('address', e.target.value)} /><label>E-mail de l'école</label><input value={v.email} onChange={e => set('email', e.target.value)} /><label>Téléphone</label><input value={v.phone} onChange={e => set('phone', e.target.value)} />
      <div className="settings-buttons"><button className="btn" onClick={save}>Enregistrer les paramètres</button></div></div>
    <div className="panel settings-panel"><h3>Import / export des élèves (CSV)</h3><p>Colonnes attendues pour l'import : <code>nom;prenom;classe;date_naissance;parent</code> (classe au format « CP A », date au format AAAA-MM-JJ).</p>
      <div className="settings-buttons"><button className="btn btn-light" onClick={() => download('/export/students.csv', 'eleves-edugestion.csv').catch(e => notice(e.message))}><Download size={17} /> Exporter les élèves (CSV)</button>
        <label className="btn btn-light" style={{ cursor: 'pointer' }}><Upload size={17} /> Importer un fichier CSV<input type="file" accept=".csv,text/csv" onChange={importCsv} hidden /></label></div>
      {result && <div className="account-success" style={{ marginTop: 12 }}>{result.created} ligne(s) importée(s). {result.errors.length > 0 && <ul>{result.errors.map((e, i) => <li key={i}>Ligne {e.line} : {e.msg}</li>)}</ul>}</div>}</div></>;
}
