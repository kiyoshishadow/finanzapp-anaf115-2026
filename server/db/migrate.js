'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');

async function migrate() {
  const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL_DIRECT o DATABASE_URL es obligatoria');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query('BEGIN');
    await client.query(schema);
    await client.query('COMMIT');
    console.log('Migración completada');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) migrate().catch((error) => {
  console.error('La migración falló:', error.message);
  process.exitCode = 1;
});

module.exports = { migrate };
