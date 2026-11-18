'use strict';

const path = require('node:path');
const express = require('express');
const { Pool } = require('pg');
const { createAuth } = require('./auth');
const { createDataRouter } = require('./data');
const { createUserRouter } = require('./users');
const { createBackupRouter } = require('./backup');

function createApp(pool) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.get('host')) return res.status(403).json({ error: 'Origen no permitido.' });
      } catch { return res.status(403).json({ error: 'Origen no permitido.' }); }
    }
    return next();
  });
  app.get('/api/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  const auth = createAuth(pool);
  app.use('/api/auth', auth.router);
  app.use('/api/data', createDataRouter(pool, auth.session));
  app.use('/api/users', createUserRouter(pool, auth.session));
  app.use('/api/backup', createBackupRouter(pool, auth.session));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  app.use(express.static(path.join(__dirname, '..', 'build')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'build', 'index.html')));
  app.use((error, req, res, next) => {
    console.error('Error en la solicitud:', error.message);
    if (res.headersSent) return next(error);
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con esos datos.' });
    if (error.code === '23503') return res.status(409).json({ error: 'El registro está relacionado con otros datos.' });
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudo completar la operación.' });
  });
  return app;
}

if (require.main === module) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const port = Number(process.env.PORT) || 3001;
  createApp(pool).listen(port, '0.0.0.0', () => console.log(`FinanzApp escucha en el puerto ${port}`));
}

module.exports = { createApp };
