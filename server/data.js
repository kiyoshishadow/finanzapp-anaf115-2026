'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { requireRole } = require('./auth');

const writers = ['Administrador', 'Contador', 'Empleado'];
const collections = {
  cuentas: 'accounts',
  categorias: 'categories',
  transacciones: 'transactions',
  bitacora: 'audit_log',
};

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function required(value, label, max = 200) {
  const result = String(value ?? '').trim();
  if (!result || result.length > max) throw invalid(`${label} es obligatorio y debe tener como máximo ${max} caracteres.`);
  return result;
}

function cents(value) {
  const text = String(value ?? '');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) throw invalid('El monto debe ser un valor positivo con hasta dos decimales.');
  const [whole, fraction = ''] = text.split('.');
  const result = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  if (!Number.isSafeInteger(result) || result <= 0) throw invalid('El monto debe ser mayor que cero.');
  return result;
}

function money(value) {
  return (value / 100).toFixed(2);
}

function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function present(name, row) {
  if (name === 'cuentas') return { id: row.id, codigo: row.code, nombre: row.name, tipo: row.account_type, activa: row.active, fechaCreacion: row.created_at };
  if (name === 'categorias') return { id: row.id, nombre: row.name, tipo: row.category_type, activa: row.active, fechaCreacion: row.created_at };
  if (name === 'bitacora') return { id: row.id, fecha: row.event_date, usuario: row.user_email, rol: row.user_role, accion: row.action, detalle: row.detail };
  return {
    id: row.id, tipo: row.kind, fecha: dateOnly(row.transaction_date),
    cliente: row.kind === 'venta' ? row.third_party : '', proveedor: row.kind === 'compra' ? row.third_party : '',
    nFactura: row.invoice_no, descripcion: row.description, categoria: row.category_name,
    monto: Number(row.amount), iva: Number(row.vat), total: Number(row.total), tipoGasto: row.expense_type,
    estado: row.status, creadoPor: row.created_by, timestamp: row.created_at, anuladaEn: row.annulled_at,
  };
}

async function audit(client, user, action, detail) {
  await client.query('INSERT INTO audit_log (id,user_email,user_role,action,detail) VALUES ($1,$2,$3,$4,$5)',
    [crypto.randomUUID(), user.email, user.rol, action, detail]);
}

async function transact(pool, action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

function createDataRouter(pool, session) {
  const router = express.Router();
  router.use(session);
  router.get('/:name', async (req, res, next) => {
    try {
      const name = req.params.name;
      if (!Object.hasOwn(collections, name)) return res.status(404).json({ error: 'Colección desconocida.' });
      if (name === 'bitacora' && req.user.rol !== 'Administrador') return res.status(403).json({ error: 'No tiene permiso para esta operación.' });
      const sql = name === 'transacciones'
        ? 'SELECT t.*, c.name AS category_name FROM transactions t JOIN categories c ON c.id=t.category_id ORDER BY t.created_at DESC'
        : `SELECT * FROM ${collections[name]} ORDER BY created_at DESC`;
      const actualSql = name === 'bitacora' ? 'SELECT * FROM audit_log ORDER BY event_date DESC LIMIT 500' : sql;
      const { rows } = await pool.query(actualSql);
      return res.json({ items: rows.map((row) => present(name, row)) });
    } catch (error) { return next(error); }
  });

  router.post('/:name', requireRole(...writers), async (req, res, next) => {
    try {
      const name = req.params.name;
      const body = req.body || {};
      if (name === 'categorias' && req.user.rol !== 'Administrador') return res.status(403).json({ error: 'No tiene permiso para esta operación.' });
      const id = crypto.randomUUID();
      await transact(pool, async (client) => {
        if (name === 'cuentas') {
          const type = required(body.tipo, 'Tipo', 30);
          if (!['Activo','Pasivo','Patrimonio','Ingreso','Gasto'].includes(type)) throw invalid('Tipo de cuenta inválido.');
          await client.query('INSERT INTO accounts (id,code,name,account_type,active) VALUES ($1,$2,$3,$4,$5)',
            [id, required(body.codigo,'Código',40), required(body.nombre,'Nombre',150), type, body.activa !== false]);
        } else if (name === 'categorias') {
          const type = required(body.tipo, 'Tipo', 20);
          if (!['ingreso','gasto'].includes(type)) throw invalid('Tipo de categoría inválido.');
          await client.query('INSERT INTO categories (id,name,category_type,active) VALUES ($1,$2,$3,$4)',
            [id, required(body.nombre,'Nombre',60), type, body.activa !== false]);
        } else if (name === 'transacciones') {
          const kind = required(body.tipo,'Tipo',20);
          if (!['venta','compra'].includes(kind)) throw invalid('Tipo de movimiento inválido.');
          const date = required(body.fecha,'Fecha',10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw invalid('Fecha inválida.');
          const category = await client.query('SELECT id FROM categories WHERE name=$1 AND category_type=$2 AND active=TRUE', [required(body.categoria,'Categoría',60), kind === 'venta' ? 'ingreso' : 'gasto']);
          if (!category.rows[0]) throw invalid('Selecciona una categoría activa.');
          const amount = cents(body.monto);
          const vat = Math.round(amount * 13 / 100);
          await client.query('INSERT INTO transactions (id,kind,transaction_date,invoice_no,third_party,description,category_id,amount,vat,total,expense_type,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
            [id, kind, date, required(body.nFactura,'Documento',100), required(kind === 'venta' ? body.cliente : body.proveedor,'Cliente o proveedor',150), String(body.descripcion || '').slice(0,1000), category.rows[0].id, money(amount), money(vat), money(amount + vat), String(body.tipoGasto || '').slice(0,60), req.user.email]);
        } else throw invalid('No se puede agregar a esta colección.');
        await audit(client, req.user, `Creación en ${name}`, id);
      });
      return res.status(201).json({ id });
    } catch (error) { return next(error); }
  });

  router.patch('/:name/:id', requireRole(...writers), async (req, res, next) => {
    try {
      const { name, id } = req.params;
      const body = req.body || {};
      if (name === 'categorias' && req.user.rol !== 'Administrador') return res.status(403).json({ error: 'No tiene permiso para esta operación.' });
      await transact(pool, async (client) => {
        if (name === 'cuentas') {
          const found = await client.query('SELECT * FROM accounts WHERE id=$1 FOR UPDATE', [id]);
          const row = found.rows[0];
          if (!row) throw invalid('Cuenta no encontrada.');
          const type = body.tipo ?? row.account_type;
          if (!['Activo','Pasivo','Patrimonio','Ingreso','Gasto'].includes(type)) throw invalid('Tipo de cuenta inválido.');
          await client.query('UPDATE accounts SET code=$2,name=$3,account_type=$4,active=$5 WHERE id=$1',
            [id, required(body.codigo ?? row.code,'Código',40), required(body.nombre ?? row.name,'Nombre',150), type, body.activa ?? row.active]);
        } else if (name === 'categorias') {
          const found = await client.query('SELECT * FROM categories WHERE id=$1 FOR UPDATE', [id]);
          const row = found.rows[0];
          if (!row) throw invalid('Categoría no encontrada.');
          const type = body.tipo ?? row.category_type;
          if (!['ingreso','gasto'].includes(type)) throw invalid('Tipo de categoría inválido.');
          await client.query('UPDATE categories SET name=$2,category_type=$3,active=$4 WHERE id=$1',
            [id, required(body.nombre ?? row.name,'Nombre',60), type, body.activa ?? row.active]);
        } else if (name === 'transacciones') {
          const found = await client.query('SELECT t.*,c.name AS category_name FROM transactions t JOIN categories c ON c.id=t.category_id WHERE t.id=$1 FOR UPDATE OF t', [id]);
          const row = found.rows[0];
          if (!row) throw invalid('Movimiento no encontrado.');
          const status = body.estado ?? row.status;
          if (!['activa','anulada'].includes(status)) throw invalid('Estado inválido.');
          const categoryName = body.categoria ?? row.category_name;
          const category = await client.query('SELECT id FROM categories WHERE name=$1 AND category_type=$2 AND (active=TRUE OR id=$3)',
            [required(categoryName,'Categoría',60), row.kind === 'venta' ? 'ingreso' : 'gasto', row.category_id]);
          if (!category.rows[0]) throw invalid('Selecciona una categoría válida.');
          const amount = cents(body.monto ?? row.amount);
          const vat = Math.round(amount * 13 / 100);
          const date = body.fecha ?? dateOnly(row.transaction_date);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw invalid('Fecha inválida.');
          const third = row.kind === 'venta' ? body.cliente : body.proveedor;
          await client.query('UPDATE transactions SET transaction_date=$2,invoice_no=$3,third_party=$4,description=$5,category_id=$6,amount=$7,vat=$8,total=$9,expense_type=$10,status=$11,annulled_at=$12 WHERE id=$1',
            [id,date,required(body.nFactura ?? row.invoice_no,'Documento',100),required(third ?? row.third_party,'Cliente o proveedor',150),String(body.descripcion ?? row.description).slice(0,1000),category.rows[0].id,money(amount),money(vat),money(amount+vat),String(body.tipoGasto ?? row.expense_type).slice(0,60),status,status === 'anulada' ? (row.annulled_at || new Date()) : null]);
        } else throw invalid('Colección no editable.');
        await audit(client, req.user, `Actualización en ${name}`, id);
      });
      return res.status(204).end();
    } catch (error) { return next(error); }
  });

  router.delete('/:name/:id', requireRole(...writers), async (req, res, next) => {
    try {
      if (req.params.name !== 'cuentas') throw invalid('Solo se pueden eliminar cuentas.');
      await transact(pool, async (client) => {
        const result = await client.query('DELETE FROM accounts WHERE id=$1 RETURNING id', [req.params.id]);
        if (!result.rowCount) throw invalid('Cuenta no encontrada.');
        await audit(client, req.user, 'Eliminación de cuenta', req.params.id);
      });
      return res.status(204).end();
    } catch (error) { return next(error); }
  });

  return router;
}

module.exports = { createDataRouter, audit, transact, invalid, required, present };
