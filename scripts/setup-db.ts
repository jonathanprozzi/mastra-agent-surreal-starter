/**
 * Setup script to initialize SurrealDB with the Mastra schema
 *
 * Usage: bun run db:setup
 */

import Surreal from 'surrealdb';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function setup() {
  const db = new Surreal();

  try {
    // Load config from env (use http:// for root user access)
    const url = process.env.SURREALDB_URL || 'http://localhost:8000';
    const namespace = process.env.SURREALDB_NS || 'mastra';
    const database = process.env.SURREALDB_DB || 'development';
    const username = process.env.SURREALDB_USER || 'root';
    const password = process.env.SURREALDB_PASS || 'root';

    console.log(`Connecting to SurrealDB at ${url}...`);
    await db.connect(url);

    console.log('Signing in...');
    await db.signin({
      username,
      password,
    });

    console.log(`Using namespace: ${namespace}, database: ${database}`);
    await db.use({
      namespace,
      database,
    });

    // Read and execute schema
    const schemaPath = join(__dirname, '../src/mastra/storage/schema.surql');
    const schema = readFileSync(schemaPath, 'utf-8');

    console.log('Applying schema...');
    await db.query(schema);

    console.log('Schema applied successfully!');

    // Verify tables
    const tables = await db.query('INFO FOR DB;');
    console.log('\nCreated tables:');
    console.log(JSON.stringify(tables, null, 2));

  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

setup();
