'use strict';

const express = require('express');
const { requireRole } = require('./auth');
const { transact, audit, invalid } = require('./data');

function backupCents(value) {
  const text = String(value ?? '');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) throw invalid('El respaldo contiene un importe inválido.');
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
}

function validateBackup(data) {
  if (data?.formato !== 'FinanzApp PostgreSQL' || data.version !== 1 || !Array.isArray(data.accounts) || !Array.isArray(data.categories) || !Array.isArray(data.transactions)) throw invalid('El archivo no es un respaldo válido de FinanzApp.');
  if ([data.accounts, data.categories, data.transactions].some((items) => items.length > 10000 || items.some((item) => !item || typeof item !== 'object' || Array.isArray(item)))) throw invalid('El respaldo contiene datos inválidos o excede el límite.');
  const validText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  const categoryIds = new Set();
  const accountIds = new Set();
  for (const account of data.accounts) {
    if (!validText(account.id, 200) || accountIds.has(account.id) || !validText(account.code, 40) || !validText(account.name, 150) || !['Activo','Pasivo','Patrimonio','Ingreso','Gasto'].includes(account.account_type) || typeof account.active !== 'boolean' || !Number.isFinite(Date.parse(account.created_at))) throw invalid('El respaldo contiene una cuenta inválida.');
    accountIds.add(account.id);
  }
  for (const category of data.categories) {
    if (!validText(category.id, 200) || categoryIds.has(category.id) || !validText(category.name, 60) || !['ingreso','gasto'].includes(category.category_type) || typeof category.active !== 'boolean' || !Number.isFinite(Date.parse(category.created_at))) throw invalid('El respaldo contiene una categoría inválida.');
    categoryIds.add(category.id);
  }
  const transactionIds = new Set();
  for (const transaction of data.transactions) {
    if (!validText(transaction.id, 200) || transactionIds.has(transaction.id) || !['venta','compra'].includes(transaction.kind) || !categoryIds.has(transaction.category_id) || !validText(transaction.invoice_no, 100) || !validText(transaction.third_party, 150) || !['activa','anulada'].includes(transaction.status) || !Number.isFinite(Date.parse(transaction.transaction_date)) || !Number.isFinite(Date.parse(transaction.created_at))) throw invalid('El respaldo contiene un movimiento inválido.');
    const amount = backupCents(transaction.amount);
    const vat = backupCents(transaction.vat);
    if (amount <= 0 || vat !== Math.round(amount * 13 / 100) || backupCents(transaction.total) !== amount + vat) throw invalid('El respaldo contiene importes o IVA inconsistentes.');
    transactionIds.add(transaction.id);
  }
}

function createBackupRouter(pool, session) {
  const router = express.Router();
  router.use(session, requireRole('Administrador'));

  router.get('/', async (req, res, next) => {
    try {
      const data = await transact(pool, async (client) => {
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        const accounts = await client.query('SELECT id,code,name,account_type,active,created_at FROM accounts ORDER BY code');
        const categories = await client.query('SELECT id,name,category_type,active,created_at FROM categories ORDER BY name');
        const transactions = await client.query('SELECT * FROM transactions ORDER BY created_at');
        await audit(client, req.user, 'Exportación de respaldo', 'Datos contables');
        return { formato: 'FinanzApp PostgreSQL', version: 1, exportado: new Date().toISOString(), accounts: accounts.rows, categories: categories.rows, transactions: transactions.rows };
      });
      res.json(data);
    } catch (error) { next(error); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const data = req.body;
      validateBackup(data);
      await transact(pool, async (client) => {
        await client.query('LOCK TABLE accounts, categories, transactions IN ACCESS EXCLUSIVE MODE');
        await client.query('DELETE FROM transactions');
        await client.query('DELETE FROM accounts');
        await client.query('DELETE FROM categories');
        for (const a of data.accounts) {
          await client.query('INSERT INTO accounts (id,code,name,account_type,active,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [a.id,a.code,a.name,a.account_type,a.active,a.created_at]);
        }
        for (const c of data.categories) {
          await client.query('INSERT INTO categories (id,name,category_type,active,created_at) VALUES ($1,$2,$3,$4,$5)', [c.id,c.name,c.category_type,c.active,c.created_at]);
        }
        for (const t of data.transactions) {
          await client.query('INSERT INTO transactions (id,kind,transaction_date,invoice_no,third_party,description,category_id,amount,vat,total,expense_type,status,created_by,created_at,annulled_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)', [t.id,t.kind,t.transaction_date,t.invoice_no,t.third_party,t.description,t.category_id,t.amount,t.vat,t.total,t.expense_type,t.status,t.created_by,t.created_at,t.annulled_at]);
        }
        await audit(client, req.user, 'Restauración de respaldo', 'Datos contables');
      });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  return router;
}

module.exports = { createBackupRouter };
