'use strict';

const crypto = require('node:crypto');
const { Client } = require('pg');
const { hashPassword } = require('../auth');

const users = [
  ['admin@finanzapp.test', 'Administración Demo', 'Administrador', 'DEMO_ADMIN_PASSWORD'],
  ['contador@finanzapp.test', 'Contabilidad Demo', 'Contador', 'DEMO_CONTADOR_PASSWORD'],
  ['empleado@finanzapp.test', 'Empleado Demo', 'Empleado', 'DEMO_EMPLEADO_PASSWORD'],
  ['usuario@finanzapp.test', 'Consulta Demo', 'Usuario', 'DEMO_USUARIO_PASSWORD'],
];
const categories = [
  ['cat-ing-1','Ventas de productos','ingreso'], ['cat-ing-2','Servicios','ingreso'], ['cat-ing-3','Otros ingresos','ingreso'],
  ['cat-gas-1','Mercadería','gasto'], ['cat-gas-2','Servicios profesionales','gasto'], ['cat-gas-3','Alquiler','gasto'],
  ['cat-gas-4','Servicios básicos','gasto'], ['cat-gas-5','Transporte','gasto'], ['cat-gas-6','Suministros','gasto'], ['cat-gas-7','Otros gastos','gasto'],
];
const accounts = [
  ['1101','Caja','Activo'], ['1102','Bancos','Activo'], ['1103','Cuentas por cobrar','Activo'], ['1104','IVA crédito fiscal','Activo'],
  ['1201','Inventario','Activo'], ['2101','Cuentas por pagar','Pasivo'], ['2102','IVA débito fiscal','Pasivo'], ['3101','Capital social','Patrimonio'],
  ['4101','Ventas','Ingreso'], ['5101','Costo de ventas','Gasto'], ['5201','Gastos de operación','Gasto'],
];

async function seed() {
  if (process.env.DEMO_SEED !== '1') throw new Error('DEMO_SEED=1 es necesario para cargar datos de demostración.');
  const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Falta la conexión de base de datos.');
  for (const [, , , key] of users) {
    if (!process.env[key] || process.env[key].length < 12) throw new Error(`Falta una contraseña válida en ${key}.`);
  }
  const passwords = new Set(users.map(([, , , key]) => process.env[key]));
  if (passwords.size !== users.length) throw new Error('Cada cuenta necesita una contraseña diferente.');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('finanzapp-demo-seed'))");
    for (const [email, name, role, key] of users) {
      const existing = await client.query('SELECT id FROM users WHERE lower(email)=lower($1)', [email]);
      if (existing.rowCount) continue;
      const { salt, hash } = await hashPassword(process.env[key]);
      await client.query('INSERT INTO users (id,email,full_name,role,password_salt,password_hash) VALUES ($1,$2,$3,$4,$5,$6)', [crypto.randomUUID(),email,name,role,salt,hash]);
    }
    for (const [id,name,type] of categories) {
      await client.query('INSERT INTO categories (id,name,category_type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id,name,type]);
    }
    for (const [code,name,type] of accounts) {
      await client.query('INSERT INTO accounts (id,code,name,account_type) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [`demo-cuenta-${code}`,code,name,type]);
    }
    const examples = [
      ['venta','cat-ing-1','Comercial La Ceiba','Venta de accesorios de oficina',18450],
      ['venta','cat-ing-2','Papelería El Roble','Servicio de mantenimiento informático',9500],
      ['compra','cat-gas-1','Distribuidora Las Flores','Compra de mercadería para inventario',7350],
      ['compra','cat-gas-3','Inmuebles El Centro','Alquiler mensual del local',22000],
    ];
    for (let month = 0; month < 3; month += 1) {
      for (let i = 0; i < examples.length; i += 1) {
        const [kind, category, party, description, amount] = examples[i];
        const d = new Date();
        d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - month); d.setUTCDate(5 + i * 5);
        const date = d.toISOString().slice(0,10);
        const id = `demo-m${month}-${i}`;
        const vat = Math.round(amount * 13 / 100);
        await client.query('INSERT INTO transactions (id,kind,transaction_date,invoice_no,third_party,description,category_id,amount,vat,total,expense_type,status,created_by,annulled_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING',
          [id,kind,date,`DEMO-M${month}-${i+1}`,party,description,category,(amount/100).toFixed(2),(vat/100).toFixed(2),((amount+vat)/100).toFixed(2),kind === 'venta' ? 'Venta' : 'Servicio',month === 2 && i === 2 ? 'anulada' : 'activa','Demostración',month === 2 && i === 2 ? new Date(date) : null]);
      }
    }
    await client.query('COMMIT');
    console.log('Datos de demostración preparados.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}

if (require.main === module) seed().catch((error) => { console.error('No se pudo cargar la demostración:', error.message); process.exitCode = 1; });
module.exports = { seed };
