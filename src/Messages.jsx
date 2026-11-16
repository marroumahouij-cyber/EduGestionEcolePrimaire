import React, { useEffect, useState } from 'react';
import { Plus, Eye, Trash2, Pencil, Send, EyeOff } from 'lucide-react';
import { api, fdate } from './api.js';
import { Modal } from './components.jsx';

const TABS = [['inbox', 'Reçus'], ['sent', 'Envoyés'], ['drafts', 'Brouillons']];
const AUD = [['tous', 'Tout le monde'], ['parents', 'Parents'], ['enseignants', 'Enseignants'], ['eleves', 'Élèves']];

export function Messages({ role, notice, onRead }) {
  const [box, setBox] = useState('inbox'), [rows, setRows] = useState([]), [recipients, setRecipients] = useState([]), [compose, setCompose] = useState(null), [open, setOpen] = useState(null), [err, setErr] = useState('');
  const canWrite = role !== 'Élève';
  const load = async (b = box) => { try { setRows(await api('/messages?box=' + b)); } catch (e) { notice(e.message); } };
  useEffect(() => { load(); }, [box]);
  useEffect(() => { if (canWrite) api('/recipients').then(setRecipients).catch(() => {}); }, []);
  const view = async m => { try { setOpen(await api('/messages/' + m.id)); onRead?.(); load(); } catch (e) { notice(e.message); } };
  const act = async (fn, ok) => { try { await fn(); notice(ok); load(); onRead?.(); } catch (e) { notice(e.message); } };
  const save = async (v, send) => {
    try { setErr('');
      if (v.id) await api('/messages/' + v.id, 'PUT', { recipient_id: v.recipient_id, objet: v.objet, corps: v.corps, send });
      else await api('/messages', 'POST', { recipient_id: v.recipient_id, objet: v.objet, corps: v.corps, draft: !send });
      setCompose(null); notice(send ? 'Message envoyé' : 'Brouillon enregistré'); load(); onRead?.();
    } catch (e) { setErr(e.message); }
  };
  return <><div className="page-heading"><div><div className="eyebrow">COMMUNICATION</div><h1>Messagerie</h1><p>Un message envoyé ne peut plus être modifié ni supprimé par son expéditeur. Le destinataire peut le masquer de sa boîte.</p></div>
    {canWrite && <button className="btn" onClick={() => { setErr(''); setCompose({ recipient_id: '', objet: '', corps: '' }); }}><Plus size={17} /> Nouveau message</button>}</div>
    <div className="panel table-panel"><div className="toolbar" style={{ gap: 8 }}>{TABS.filter(([k]) => canWrite || k === 'inbox').map(([k, l]) => <button key={k} className={'btn ' + (box === k ? '' : 'btn-light')} onClick={() => setBox(k)}>{l}</button>)}<span className="count">{rows.length} message(s)</span></div>
      <div className="table-scroll"><table><thead><tr><th>{box === 'inbox' ? 'De' : 'À'}</th><th>Objet</th><th>Date</th><th>Actions</th></tr></thead><tbody>
        {rows.map(m => <tr key={m.id} style={box === 'inbox' && !m.lu ? { fontWeight: 800 } : undefined}><td>{box === 'inbox' ? m.sender_label : m.recipient_label}</td><td>{m.objet}</td><td>{fdate(m.sent_at || m.created_at)}</td>
          <td><div className="row-actions">
            {box !== 'drafts' && <button title="Lire" onClick={() => view(m)}><Eye size={15} /></button>}
            {box === 'drafts' && <><button title="Modifier / envoyer" onClick={() => { setErr(''); setCompose({ ...m }); }}><Pencil size={15} /></button><button title="Supprimer le brouillon" onClick={() => confirm('Supprimer ce brouillon ?') && act(() => api('/messages/' + m.id, 'DELETE'), 'Brouillon supprimé')}><Trash2 size={15} /></button></>}
            {box === 'inbox' && <button title="Masquer de ma boîte" onClick={() => confirm('Masquer ce message de votre boîte ? (il reste dans l’historique de l’expéditeur)') && act(() => api(`/messages/${m.id}/hide`, 'POST'), 'Message masqué')}><EyeOff size={15} /></button>}
            {box === 'sent' && <span className="sent-badge">Envoyé</span>}</div></td></tr>)}
      </tbody></table>{!rows.length && <div className="empty">Aucun message.</div>}</div></div>
    {compose && <Modal title={compose.id ? 'Brouillon' : 'Nouveau message'} onClose={() => setCompose(null)} footer={<><button className="btn btn-light" onClick={() => setCompose(null)}>Annuler</button><button className="btn btn-light" disabled={!compose.recipient_id || !compose.objet || !compose.corps} onClick={() => save(compose, false)}>Enregistrer en brouillon</button><button className="btn" disabled={!compose.recipient_id || !compose.objet || !compose.corps} onClick={() => save(compose, true)}><Send size={16} /> Envoyer</button></>}>
      {err && <p role="alert" className="account-error">{err}</p>}
      <label className="form-field"><span>Destinataire</span><select value={compose.recipient_id} onChange={e => setCompose({ ...compose, recipient_id: e.target.value })}><option value="">Choisir…</option>{recipients.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
      <label className="form-field"><span>Objet</span><input maxLength={200} value={compose.objet} onChange={e => setCompose({ ...compose, objet: e.target.value })} /></label>
      <label className="form-field"><span>Message</span><textarea rows="6" value={compose.corps} onChange={e => setCompose({ ...compose, corps: e.target.value })} /></label></Modal>}
    {open && <Modal title={open.message.objet} onClose={() => setOpen(null)} wide footer={<button className="btn btn-light" onClick={() => setOpen(null)}>Fermer</button>}>
      <p><b>De :</b> {open.message.sender_label} · <b>À :</b> {open.message.recipient_label} · {fdate(open.message.sent_at)}</p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{open.message.corps}</p>
      {open.thread.length > 1 && <><h3>Historique de la conversation (lecture seule)</h3>{open.thread.map(t => <div key={t.id} className="panel info-panel"><small>{t.sender_label} → {t.recipient_label} · {fdate(t.sent_at)}</small><p style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}><b>{t.objet}</b><br />{t.corps}</p></div>)}</>}</Modal>}
  </>;
}

export function Announcements({ role, notice }) {
  const [rows, setRows] = useState([]), [form, setForm] = useState(null), [err, setErr] = useState('');
  const load = () => api('/announcements').then(setRows).catch(e => notice(e.message));
  useEffect(() => { load(); }, []);
  const publish = async () => { try { setErr(''); await api('/announcements', 'POST', form); setForm(null); notice('Annonce publiée'); load(); } catch (e) { setErr(e.message); } };
  return <><div className="page-heading"><div><div className="eyebrow">COMMUNICATION</div><h1>Annonces</h1><p>Une annonce publiée ne peut être ni modifiée ni supprimée : en cas d'erreur, publiez une annonce corrective.</p></div>
    {role === 'Administrateur' && <button className="btn" onClick={() => { setErr(''); setForm({ titre: '', corps: '', audience: 'tous' }); }}><Plus size={17} /> Publier une annonce</button>}</div>
    {rows.map(a => <div className="panel" key={a.id} style={{ marginBottom: 14 }}><div className="panel-title"><div><span className="eyebrow">{AUD.find(x => x[0] === a.audience)?.[1].toUpperCase()}</span><h3>{a.titre}</h3></div><span>{fdate(a.created_at)}</span></div><p style={{ whiteSpace: 'pre-wrap' }}>{a.corps}</p><small>Publié par {a.author_label}</small></div>)}
    {!rows.length && <div className="panel"><p className="empty">Aucune annonce pour le moment.</p></div>}
    {form && <Modal title="Publier une annonce" onClose={() => setForm(null)} footer={<><button className="btn btn-light" onClick={() => setForm(null)}>Annuler</button><button className="btn" disabled={!form.titre || !form.corps} onClick={() => confirm('Une fois publiée, l’annonce ne pourra plus être modifiée. Publier ?') && publish()}>Publier</button></>}>
      {err && <p role="alert" className="account-error">{err}</p>}
      <label className="form-field"><span>Visible par</span><select value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })}>{AUD.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="form-field"><span>Titre</span><input maxLength={200} value={form.titre} onChange={e => setForm({ ...form, titre: e.target.value })} /></label>
      <label className="form-field"><span>Texte</span><textarea rows="5" value={form.corps} onChange={e => setForm({ ...form, corps: e.target.value })} /></label></Modal>}
  </>;
}
