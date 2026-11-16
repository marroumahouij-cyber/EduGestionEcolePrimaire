import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loginRouter, auth } from './auth.js';
import { resourceRouter } from './resources.js';
import { peopleRouter } from './people.js';
import { schoolRouter } from './school.js';
import { saasRouter } from './saas.js';
import { pool } from './db.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'], scriptSrc: ["'self'"], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: process.env.FORCE_HTTPS === '1' ? [] : null } }, hsts: process.env.FORCE_HTTPS === '1' }));
  app.use(express.json({ limit: '300kb' })); // les routes de fichiers relèvent cette limite elles-mêmes

  const api = express.Router();
  api.get('/health', async (req, res, next) => { try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'connected' }); } catch (e) { next(e); } });
  api.use(loginRouter(express, rateLimit));
  api.get('/me', auth, (req, res) => res.json({ id: req.user.id, email: req.user.email, role: req.user.role, school_id: req.user.school_id, impersonated: !!req.user.impersonated }));
  api.use('/saas', saasRouter());
  api.use(peopleRouter());      // /r/teachers, /users, /messages, /announcements, /notifications...
  api.use(schoolRouter());      // /bootstrap, /homework/*, /files, /pdf/*...
  api.use('/r', resourceRouter());
  api.use((req, res) => res.status(404).json({ error: 'Route inconnue' }));
  app.use('/api', api);

  // Interface web compilée (Docker / production) servie par le même serveur
  const dist = process.env.FRONTEND_DIST || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((err, req, res, next) => { // eslint-disable-line
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Données trop volumineuses' });
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message, ...(err.needsConfirm ? { needsConfirm: true } : {}) });
    if (err.code === '23505') return res.status(409).json({ error: 'Cet enregistrement existe déjà (doublon)' });
    if (err.code === '23503') return res.status(409).json({ error: 'Référence invalide ou élément encore utilisé ailleurs' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide' });
    console.error(err); res.status(500).json({ error: 'Erreur interne du serveur' });
  });
  return app;
}
