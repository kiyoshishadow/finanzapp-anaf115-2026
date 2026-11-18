'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const express = require('express');

const scrypt = promisify(crypto.scrypt);
const cookieName = 'finanzapp_session';
const sessionLifetimeMs = 8 * 60 * 60 * 1000;

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = await scrypt(password, salt, 64);
  return { salt, hash: hash.toString('hex') };
}

async function verifyPassword(password, salt, storedHash) {
  const { hash } = await hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(storedHash || '', 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function readSessionCookie(req) {
  const cookies = (req.headers.cookie || '').split(';');
  for (const entry of cookies) {
    const index = entry.indexOf('=');
    if (index < 0) continue;
    if (entry.slice(0, index).trim() === cookieName) return entry.slice(index + 1).trim();
  }
  return '';
}

function userView(row) {
  return { id: row.id, uid: row.id, email: row.email, nombre: row.full_name, rol: row.role, activo: row.active };
}

function createAuth(pool) {
  const router = express.Router();
  const secure = process.env.NODE_ENV === 'production';
  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: sessionLifetimeMs };
  const attemptBuckets = new Map();

  router.post('/login', async (req, res, next) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const key = req.ip + ':' + email;
      const now = Date.now();
      const bucket = attemptBuckets.get(key);
      if (bucket && bucket.until > now && bucket.count >= 10) return res.status(429).json({ error: 'Demasiados intentos. Inténtalo más tarde.' });
      const { rows } = await pool.query('SELECT * FROM users WHERE lower(email) = $1', [email]);
      const user = rows[0];
      if (!user || !user.active || !(await verifyPassword(password, user.password_salt, user.password_hash))) {
        const current = bucket && bucket.until > now ? bucket : { count: 0, until: now + 15 * 60 * 1000 };
        current.count += 1;
        attemptBuckets.set(key, current);
        return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
      }
      attemptBuckets.delete(key);
      const token = crypto.randomBytes(32).toString('hex');
      await pool.query('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)', [tokenHash(token), user.id, new Date(now + sessionLifetimeMs)]);
      res.cookie(cookieName, token, cookieOptions);
      return res.json({ user: userView(user) });
    } catch (error) { return next(error); }
  });

  async function session(req, res, next) {
    try {
      const token = readSessionCookie(req);
      if (!/^[0-9a-f]{64}$/.test(token)) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
      const { rows } = await pool.query('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now() AND u.active = TRUE', [tokenHash(token)]);
      if (!rows[0]) return res.status(401).json({ error: 'La sesión ha terminado.' });
      req.user = userView(rows[0]);
      req.sessionTokenHash = tokenHash(token);
      return next();
    } catch (error) { return next(error); }
  }

  router.get('/me', session, (req, res) => res.json({ user: req.user }));
  router.post('/logout', session, async (req, res, next) => {
    try {
      await pool.query('DELETE FROM sessions WHERE token_hash=$1', [req.sessionTokenHash]);
      res.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
      return res.status(204).end();
    } catch (error) { return next(error); }
  });
  return { router, session };
}

function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user?.rol) ? next() : res.status(403).json({ error: 'No tiene permiso para esta operación.' });
}

module.exports = { createAuth, hashPassword, userView, requireRole };
