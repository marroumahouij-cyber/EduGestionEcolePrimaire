import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const bad = m => new HttpError(400, m);
export const forbidden = (m = 'Accès refusé') => new HttpError(403, m);
export const notFound = (m = 'Introuvable') => new HttpError(404, m);
export const conflict = m => new HttpError(409, m);
export const newId = () => crypto.randomUUID();
export const validEmail = s => typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
export const validPassword = s => typeof s === 'string' && s.length >= 12 && Buffer.byteLength(s) <= 128;
export const normEmail = s => String(s).trim().toLowerCase();
export const hash = p => bcrypt.hash(p, 12);
export const slugify = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'ecole';
export const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const today = () => new Date().toISOString().slice(0, 10);
export const money = n => Number(n || 0).toFixed(3) + ' DT';
export const MODES = { especes: 'Espèces', virement: 'Virement', mobile_money: 'Mobile money' };
export const ROLES = ['Administrateur', 'Enseignant', 'Parent', 'Élève', 'Comptable'];
