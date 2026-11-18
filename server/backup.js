'use strict';

const express = require('express');
const { requireRole } = require('./auth');
const { transact, audit, invalid } = require('./data');

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
      if (data?.formato !== 'FinanzApp PostgreSQL' || data.version !== 1 || !Array.isArray(data.accounts) || !Array.isArray(data.categories) || !Array.isArray(data.transactions)) throw invalid('El archivo no es un respaldo válido de FinanzApp.');
      if ([data.accounts, data.categories, data.transactions].some((items) => items.length > 10000 || items.some((item) => !item || typeof item !== 'object' || Array.isArray(item)))) throw invalid('El respaldo contiene datos inválidos o excede el límite.');
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
