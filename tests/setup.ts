/**
 * Vitest setup file
 *
 * This runs before all tests to configure the test environment.
 */

import { beforeAll, afterAll } from 'vitest';

// Ensure we have default environment variables for testing
process.env.SURREALDB_URL = process.env.SURREALDB_URL || 'http://localhost:8000';
process.env.SURREALDB_NS = process.env.SURREALDB_NS || 'mastra';
process.env.SURREALDB_DB = process.env.SURREALDB_DB || 'test'; // Use 'test' database for tests
process.env.SURREALDB_USER = process.env.SURREALDB_USER || 'root';
process.env.SURREALDB_PASS = process.env.SURREALDB_PASS || 'root';

beforeAll(() => {
  console.log('\n🧪 Starting SurrealDB adapter tests...');
  console.log(`   Database: ${process.env.SURREALDB_NS}/${process.env.SURREALDB_DB}`);
});

afterAll(() => {
  console.log('\n✅ All tests completed.\n');
});
