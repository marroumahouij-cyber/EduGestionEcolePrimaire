import React, { useEffect, useState } from 'react';
import { Download, Check, Eye } from 'lucide-react';
import { api, download, fileToPayload, fdate } from './api.js';
import { Modal } from './components.jsx';

export default function HomeworkModal({ hw, role, onClose, notice, onChanged }) {
  const [data, setData] = useState(null), [err, setErr] = useState('');
  const [text, setText] = useState(''), [file, setFile] = useState(null), [corrText, setCorrText] = useState(''), [corrFile, setCorrFile] = useState(null), [grades, setGrades] = useState({});
  const teacher = ['Administrateur', 'Enseignant'].includes(role);
  const load = async () => { try { setData(await api(`/homework/${hw.id}/submissions`)); } catch (e) { setErr(e.message); } };
  useEffect(() => { load(); }, [hw.id]);
  const run = async (fn, ok) => { try { setErr(''); await fn(); notice(ok); await load(); onChanged?.(); } catch (e) { setErr(e.message); } };
  const dl = (id, name) => download('/files/' + id, name).catch(e => setErr(e.message));
  const pastDue = data && new Date().toISOString().slice(0, 10) > data.homework.echeance;
  return <Modal title={`Devoir — ${hw.titre}`} onClose={onClose} wide footer={<button className="btn btn-light" onClick={onClose}>Fermer</button>}>
    {err && <p role="alert" className="account-error">{err}</p>}
    <p><b>Remise :</b> {hw.echeance} · <b>Barème :</b> {hw.bareme} · {hw.class_label} {hw.subject_label && '· ' + hw.subject_label}</p>
    {hw.description && <p>{hw.description}</p>}
    {hw.attachment_name && <button className="btn btn-light" onClick={() => dl(hw.attachment_file_id, hw.attachment_name)}><Download size={15} /> Énoncé : {hw.attachment_name}</button>}
    {(hw.correction_text || hw.correction_name) && <div className="panel info-panel"><h3>Correction</h3>{hw.correction_text && <p>{hw.correction_text}</p>}{hw.correction_name && <button className="btn btn-light" onClick={() => dl(hw.correction_file_id, hw.correction_name)}><Download size={15} /> {hw.correction_name}</button>}</div>}
    {!teacher && role === 'Parent' && !(hw.correction_text || hw.correction_name) && <small>La correction sera visible après la date de remise.</small>}
    {teacher && <div className="panel info-panel"><h3>Pièces jointes et correction</h3>
      <label className="form-field"><span>Joindre / remplacer l'énoncé (PDF, image, document)</span><input type="file" onChange={async e => { const f = e.target.files[0]; if (f) run(async () => { await api(`/homework/${hw.id}/attachment`, 'PUT', await fileToPayload(f)); }, 'Énoncé enregistré'); }} /></label>
      <label className="form-field"><span>Correction (texte, visible après la date de remise)</span><textarea rows="2" value={corrText} onChange={e => setCorrText(e.target.value)} /></label>
      <label className="form-field"><span>Fichier de correction</span><input type="file" onChange={e => setCorrFile(e.target.files[0])} /></label>
      <button className="btn" onClick={() => run(async () => { await api(`/homework/${hw.id}/correction`, 'PUT', { text: corrText, file: await fileToPayload(corrFile) }); setCorrText(''); }, 'Correction publiée')}>Publier la correction</button></div>}
    {role === 'Élève' && data && <div className="panel info-panel"><h3>Mon dépôt</h3>
      {data.items[0]?.id && <p>Statut : <b>{data.items[0].statut}</b> · déposé le {fdate(data.items[0].submitted_at)}</p>}
      {data.items[0]?.note != null && <p>Note : <b>{data.items[0].note} / {hw.bareme}</b>{data.items[0].commentaire && ' — ' + data.items[0].commentaire}</p>}
      {data.items[0]?.file_id && <button className="btn btn-light" onClick={() => dl(data.items[0].file_id, data.items[0].file_name)}><Download size={15} /> {data.items[0].file_name}</button>}
      {!(data.items[0]?.note_publiee) && !(data.items[0]?.id && pastDue) && <>
        <label className="form-field"><span>Mon travail (texte)</span><textarea rows="3" value={text} onChange={e => setText(e.target.value)} /></label>
        <label className="form-field"><span>Fichier (PDF, image, document — 5 Mo max)</span><input type="file" onChange={e => setFile(e.target.files[0])} /></label>
        <button className="btn" onClick={() => run(async () => { await api(`/homework/${hw.id}/submission`, 'PUT', { contenu: text, file: await fileToPayload(file) }); setText(''); setFile(null); }, data.items[0]?.id ? 'Dépôt remplacé' : 'Travail déposé')}>{data.items[0]?.id ? 'Remplacer mon dépôt' : 'Déposer mon travail'}</button></>}
      {data.items[0]?.id && pastDue && !data.items[0].note_publiee && <small>La date de remise est dépassée : le dépôt ne peut plus être remplacé.</small>}
    </div>}
    {role !== 'Élève' && data && <div className="table-scroll"><table><thead><tr><th>Élève</th><th>Statut</th><th>Dépôt</th><th>Note / commentaire</th><th>Actions</th></tr></thead><tbody>
      {data.items.map(s => { const g = grades[s.student_id] || {}; return <tr key={s.student_id}><td>{s.student_label}</td><td>{s.statut}{s.vu_parent && ' · vu'}</td>
        <td>{s.id ? <>{s.contenu && <div>{s.contenu.slice(0, 120)}</div>}{s.file_id && <button className="btn btn-light" onClick={() => dl(s.file_id, s.file_name)}><Download size={14} /> {s.file_name}</button>}<small>{fdate(s.submitted_at)}</small></> : '—'}</td>
        <td>{teacher ? (s.id ? <div style={{ display: 'grid', gap: 6 }}><input type="number" step="any" placeholder={`/ ${hw.bareme}`} defaultValue={s.note ?? ''} onChange={e => setGrades(x => ({ ...x, [s.student_id]: { ...g, note: e.target.value } }))} /><input placeholder="Commentaire" defaultValue={s.commentaire ?? ''} onChange={e => setGrades(x => ({ ...x, [s.student_id]: { ...g, commentaire: e.target.value } }))} /></div> : '—') : (s.note != null ? `${s.note} / ${hw.bareme}${s.commentaire ? ' — ' + s.commentaire : ''}` : '—')}</td>
        <td>{teacher && s.id && <button className="btn" onClick={() => run(() => api(`/homework/${hw.id}/grade/${s.student_id}`, 'PATCH', { note: g.note ?? s.note, commentaire: g.commentaire ?? s.commentaire, publier: true }), 'Note publiée')}><Check size={15} /> Publier la note</button>}
          {role === 'Parent' && s.id && !s.vu_parent && <button className="btn btn-light" onClick={() => run(() => api(`/homework/${hw.id}/seen/${s.student_id}`, 'POST'), 'Marqué comme vu')}><Eye size={15} /> Marquer « vu »</button>}</td></tr>; })}
    </tbody></table></div>}
  </Modal>;
}
