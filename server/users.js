'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { hashPassword, userView, requireRole } = require('./auth');
const { transact, audit, invalid, required } = require('./data');
const roles = ['Administrador', 'Contador', 'Empleado', 'Usuario'];

function passwordValid(password) {
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 128) throw invalid('La contraseña debe tener entre 8 y 128 bytes.');
}

function createUserRouter(pool, session) {
  const router = express.Router();
  router.use(session, requireRole('Administrador'));

  router.get('/', async (req, res, next) => {
    try {
      const { rows } = await pool.query('SELECT id,email,full_name,role,active FROM users ORDER BY full_name');
      res.json({ users: rows.map(userView) });
    } catch (error) { next(error); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const email = required(req.body?.email, 'Correo', 150).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid('Correo inválido.');
      const nombre = required(req.body?.nombre, 'Nombre', 150);
      const rol = req.body?.rol;
      if (!roles.includes(rol)) throw invalid('Rol inválido.');
      passwordValid(req.body?.password);
      const { salt, hash } = await hashPassword(req.body.password);
      const id = crypto.randomUUID();
      await transact(pool, async (client) => {
        await client.query('INSERT INTO users (id,email,full_name,role,password_salt,password_hash) VALUES ($1,$2,$3,$4,$5,$6)', [id,email,nombre,rol,salt,hash]);
        await audit(client, req.user, 'Creación de usuario', email);
      });
      res.status(201).json({ id, uid: id, email, nombre, rol, activo: true });
    } catch (error) { next(error); }
  });

  router.patch('/', async (req, res, next) => {
    try {
      const changes = req.body?.users;
      if (!Array.isArray(changes) || changes.length > 500) throw invalid('Lista de usuarios inválida.');
      await transact(pool, async (client) => {
        const all = await client.query('SELECT id,email,role,active FROM users ORDER BY id FOR UPDATE');
        const current = new Map(all.rows.map((u) => [u.id, u]));
        const seen = new Set();
        for (const user of changes) {
          const row = current.get(user.id);
          if (!row || seen.has(user.id) || !roles.includes(user.rol) || typeof user.activo !== 'boolean') throw invalid('Cambios de usuario inválidos.');
          if (user.id === req.user.id && (user.rol !== row.role || !user.activo)) throw invalid('No puedes cambiar tu propio rol ni desactivar tu cuenta.');
          seen.add(user.id);
          row.nextRole = user.rol;
          row.nextActive = user.activo;
        }
        if (![...current.values()].some((u) => (u.nextRole ?? u.role) === 'Administrador' && (u.nextActive ?? u.active))) throw invalid('Debe permanecer un administrador activo.');
        for (const user of changes) {
          const row = current.get(user.id);
          if (row.role !== user.rol || row.active !== user.activo) {
            await client.query('UPDATE users SET role=$2,active=$3 WHERE id=$1', [user.id,user.rol,user.activo]);
            if (!user.activo || row.role !== user.rol) await client.query('DELETE FROM sessions WHERE user_id=$1', [user.id]);
            await audit(client, req.user, 'Actualización de usuario', row.email);
          }
        }
      });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  router.patch('/:id/password', async (req, res, next) => {
    try {
      passwordValid(req.body?.password);
      const { salt, hash } = await hashPassword(req.body.password);
      await transact(pool, async (client) => {
        const updated = await client.query('UPDATE users SET password_salt=$2,password_hash=$3 WHERE id=$1 RETURNING email', [req.params.id,salt,hash]);
        if (!updated.rowCount) throw invalid('Usuario no encontrado.');
        await client.query('DELETE FROM sessions WHERE user_id=$1', [req.params.id]);
        await audit(client, req.user, 'Cambio de contraseña', updated.rows[0].email);
      });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  return router;
}

module.exports = { createUserRouter };
