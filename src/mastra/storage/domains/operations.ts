/**
 * Operations Domain for SurrealDB Storage
 *
 * Handles generic table CRUD operations.
 */

import type Surreal from 'surrealdb';
import type { TABLE_NAMES, StorageColumn } from '@mastra/core/storage';

export class OperationsSurreal {
  constructor(private db: Surreal) {}

  async createTable({
    tableName,
    schema,
  }: {
    tableName: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
  }): Promise<void> {
    // SurrealDB is schemaless by default, but we can define schema if needed
    await this.db.query(`DEFINE TABLE ${tableName} SCHEMALESS PERMISSIONS FULL`);
  }

  async clearTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    await this.db.query(`DELETE FROM ${tableName}`);
  }

  async dropTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    await this.db.query(`REMOVE TABLE ${tableName}`);
  }

  async alterTable({
    tableName,
    schema,
    ifNotExists,
  }: {
    tableName: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
    ifNotExists: string[];
  }): Promise<void> {
    // SurrealDB is schemaless, no need for ALTER TABLE
    // This is a no-op but required by the interface
  }

  async insert({
    tableName,
    record,
  }: {
    tableName: TABLE_NAMES;
    record: Record<string, any>;
  }): Promise<void> {
    await this.db.create(tableName, record);
  }

  async batchInsert({
    tableName,
    records,
  }: {
    tableName: TABLE_NAMES;
    records: Record<string, any>[];
  }): Promise<void> {
    for (const record of records) {
      await this.db.create(tableName, record);
    }
  }

  async load<R>({
    tableName,
    keys,
  }: {
    tableName: TABLE_NAMES;
    keys: Record<string, any>;
  }): Promise<R | null> {
    const whereClauses = Object.entries(keys)
      .map(([k, v]) => `${k} = $${k}`)
      .join(' AND ');
    const results = await this.db.query<[R[]]>(
      `SELECT * FROM ${tableName} WHERE ${whereClauses} LIMIT 1`,
      keys
    );
    return results[0]?.[0] || null;
  }
}

export default OperationsSurreal;
