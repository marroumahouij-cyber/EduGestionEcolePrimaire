import React, { useState } from 'react';
import { X, Check, ArrowRight, Heart, Star, ShieldCheck } from 'lucide-react';
import { refLabel } from './schemas.js';

export function Stat({ title, value, Icon, color }) { return <div className="stat"><div className={'stat-icon ' + color}><Icon size={22} /></div><small>{title}</small><strong>{value}</strong></div>; }

export function Modal({ title, onClose, children, footer, wide }) {
  return <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal" style={wide ? { width: 'min(920px,96vw)' } : undefined} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-top"><h2>{title}</h2><button type="button" className="icon-button" aria-label="Fermer" onClick={onClose}><X size={20} /></button></div>
      <div className="modal-body">{children}</div>{footer && <div className="modal-footer">{footer}</div>}
    </div></div>;
}

// Formulaire générique piloté par schemas.js
export function FormModal({ config, initial, db, onClose, onSave }) {
  const editing = Boolean(initial.id);
  const [values, setValues] = useState(() => { const v = {}; for (const [k, , t] of config.fields) { const x = initial[k]; v[k] = t === 'bool' ? (x ?? (editing ? false : true)) : (x ?? ''); } return v; });
  const change = (k, v) => setValues(s => ({ ...s, [k]: v }));
  const submit = e => { e.preventDefault(); const out = {}; for (const [k, , t, o] of config.fields) { if (o?.createOnly && editing) continue; out[k] = values[k]; } onSave(out); };
  return <form className="modal" onSubmit={submit}>
    <div className="modal-top"><h2>{editing ? 'Modifier' : 'Ajouter'} — {config.title}</h2><button type="button" className="icon-button" aria-label="Fermer" onClick={onClose}><X size={20} /></button></div>
    <div className="modal-body">{config.fields.filter(([, , , o]) => !(o?.createOnly && editing)).map(([k, title, type, o = {}]) => <label key={k} className="form-field"><span>{title}</span>
      {type === 'ref' ? <select required={!!o.req} value={values[k]} onChange={e => change(k, e.target.value)}><option value="">{o.req ? 'Choisir…' : '— Aucun —'}</option>{(db[o.list] || []).map(x => <option key={x.id} value={x.id}>{refLabel[o.list](x)}</option>)}</select>
        : type === 'select' ? <select required={!!o.req} value={values[k]} onChange={e => change(k, e.target.value)}>{!o.req && <option value="">—</option>}{o.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          : type === 'textarea' ? <textarea rows="3" value={values[k]} onChange={e => change(k, e.target.value)} />
            : type === 'bool' ? <input type="checkbox" checked={!!values[k]} onChange={e => change(k, e.target.checked)} style={{ width: 22, height: 22 }} />
              : <input required={!!o.req} type={type === 'number' ? 'number' : type} step={type === 'number' ? 'any' : undefined} minLength={type === 'password' ? 12 : undefined} autoComplete={type === 'password' ? 'new-password' : 'off'} value={values[k]} onChange={e => change(k, e.target.value)} />}
    </label>)}</div>
    <div className="modal-footer"><button type="button" className="btn btn-light" onClick={onClose}>Annuler</button><button type="submit" className="btn"><Check size={17} /> Enregistrer</button></div>
  </form>;
}

export function ChangePasswordModal({ onClose, onSave }) {
  const [cur, setCur] = useState(''), [nx, setNx] = useState(''), [cf, setCf] = useState(''), [msg, setMsg] = useState('');
  const submit = e => { e.preventDefault(); if (nx.length < 12) return setMsg('12 caractères minimum'); if (nx !== cf) return setMsg('Les mots de passe ne correspondent pas'); onSave(cur, nx); };
  return <form className="modal" onSubmit={submit}>
    <div className="modal-top"><h2>Modifier mon mot de passe</h2><button className="icon-button" type="button" onClick={onClose} aria-label="Fermer"><X size={20} /></button></div>
    <div className="modal-body"><label className="form-field"><span>Mot de passe actuel</span><input type="password" autoComplete="current-password" required value={cur} onChange={e => setCur(e.target.value)} /></label>
      <label className="form-field"><span>Nouveau mot de passe (12 caractères minimum)</span><input type="password" autoComplete="new-password" minLength={12} required value={nx} onChange={e => setNx(e.target.value)} /></label>
      <label className="form-field"><span>Confirmer le nouveau mot de passe</span><input type="password" autoComplete="new-password" required value={cf} onChange={e => setCf(e.target.value)} /></label>{msg && <p role="alert" className="account-error">{msg}</p>}
      <small>Après le changement, vous devrez vous reconnecter.</small></div>
    <div className="modal-footer"><button type="button" className="btn btn-light" onClick={onClose}>Annuler</button><button type="submit" className="btn">Enregistrer</button></div>
  </form>;
}

export function Login({ onLogin, error }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [visible, setVisible] = useState(false), [busy, setBusy] = useState(false);
  return <main className="login-layout"><div className="login-shell">
    <div className="login-visual"><div className="login-visual-header"><img src="/images/logo-ecole.svg" alt="Logo école" /><span>Les petits explorateurs</span></div><div className="login-illustration"><img src="/images/hero-ecole.svg" alt="Enfants et école primaire, illustration" /></div><div className="login-visual-copy"><span className="hero-kicker"><Star size={16} /> BIENVENUE À L'ÉCOLE</span><h2>Grandir, découvrir,<br />s'épanouir !</h2><p>Une belle aventure à partager entre l'école, les enfants et les parents.</p></div><span className="login-deco login-deco-one">✦</span><span className="login-deco login-deco-two">✳</span></div>
    <div className="login-form-zone"><form className="login-card" onSubmit={async e => { e.preventDefault(); setBusy(true); await onLogin(email, password); setBusy(false); }}>
      <div className="login-mobile-brand"><img src="/images/logo-ecole.svg" alt="Logo de l'école" /> EduGestion</div><div className="login-pill"><Heart size={15} /> VOTRE ESPACE SCOLAIRE</div><h1>Ravi de vous revoir !</h1><p>Connectez-vous pour retrouver toutes les nouvelles de votre école.</p>
      <label htmlFor="email">Adresse e-mail</label><input id="email" type="email" autoComplete="username" required placeholder="adresse@votre-ecole.tn" value={email} onChange={e => setEmail(e.target.value)} />
      <label htmlFor="password">Mot de passe</label><div className="password-field"><input id="password" required type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Saisir votre mot de passe" value={password} onChange={e => setPassword(e.target.value)} /><button type="button" onClick={() => setVisible(v => !v)} aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{visible ? 'Masquer' : 'Afficher'}</button></div>
      {error && <div className="login-error" role="alert">{error}</div>}
      <button className="btn login-submit" type="submit" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'} <ArrowRight size={19} /></button>
      <p className="login-footnote"><ShieldCheck size={17} /> Connexion sécurisée. Mot de passe oublié ? Contactez la direction de votre école.</p></form></div>
  </div></main>;
}
