// Accès à l'API. Le jeton est gardé dans sessionStorage (effacé à la fermeture de l'onglet).
const TOKEN = 'edugestion_token', OWNER = 'edugestion_owner_token';
export const getToken = () => sessionStorage.getItem(TOKEN);
export const setToken = t => t ? sessionStorage.setItem(TOKEN, t) : sessionStorage.removeItem(TOKEN);
export const getOwnerToken = () => sessionStorage.getItem(OWNER);
export const setOwnerToken = t => t ? sessionStorage.setItem(OWNER, t) : sessionStorage.removeItem(OWNER);

export async function api(path, method = 'GET', body) {
  const token = getToken();
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Erreur serveur'); e.status = r.status; e.needsConfirm = j.needsConfirm; throw e; }
  return j;
}
export async function download(path, filename) {
  const r = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + getToken() } });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Téléchargement impossible'); }
  const url = URL.createObjectURL(await r.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const fileToPayload = f => new Promise((res, rej) => {
  if (!f) return res(null);
  if (f.size > 5 * 1024 * 1024) return rej(new Error('Fichier trop volumineux (5 Mo maximum)'));
  const rd = new FileReader();
  rd.onload = () => res({ filename: f.name, data: String(rd.result).split(',')[1] });
  rd.onerror = () => rej(new Error('Lecture du fichier impossible'));
  rd.readAsDataURL(f);
});
export const money = x => Number(x || 0).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' DT';
export const fdate = d => d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
