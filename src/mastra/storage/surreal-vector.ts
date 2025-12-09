/**
 * SurrealDB Vector Store for Mastra
 *
 * Implements MastraVector interface using SurrealDB's native HNSW vector indexing.
 * Provides semantic search capabilities for RAG and memory retrieval.
 */

import Surreal from 'surrealdb';
import { MastraVector } from '@mastra/core/vector';
import type {
  IndexStats,
  QueryResult,
  CreateIndexParams,
  UpsertVectorParams,
  QueryVectorParams,
  UpdateVectorParams,
  DeleteVectorParams,
  DescribeIndexParams,
  DeleteIndexParams,
} from '@mastra/core/vector';
import type { VectorFilter } from '@mastra/core/vector/filter';
import { type SurrealDBConfig, loadConfigFromEnv } from './config';

// SurrealDB-specific filter type
export interface SurrealVectorFilter {
  [key: string]: any;
}

export interface SurrealVectorConfig {
  url?: string;
  namespace?: string;
  database?: string;
  username?: string;
  password?: string;
  token?: string;
}

/**
 * Maps Mastra distance metrics to SurrealDB DIST types
 */
const METRIC_MAP: Record<string, string> = {
  cosine: 'COSINE',
  euclidean: 'EUCLIDEAN',
  dotproduct: 'DOTPRODUCT',
};

/**
 * SurrealVector - Vector store implementation for SurrealDB
 *
 * Uses SurrealDB's native HNSW indexing for efficient similarity search.
 * Tables are prefixed with 'mastra_vector_' to avoid conflicts.
 */
export class SurrealVector extends MastraVector<SurrealVectorFilter> {
  private db: Surreal;
  private config: SurrealDBConfig;
  private isConnected = false;

  constructor(config?: SurrealVectorConfig) {
    super();
    this.db = new Surreal();
    this.config = {
      ...loadConfigFromEnv(),
      ...config,
    };
  }

  private async init(): Promise<void> {
    if (this.isConnected) return;

    await this.db.connect(this.config.url);

    if (this.config.username && this.config.password) {
      await this.db.signin({
        username: this.config.username,
        password: this.config.password,
      });
    } else if (this.config.token) {
      await this.db.authenticate(this.config.token);
    }

    await this.db.use({
      namespace: this.config.namespace,
      database: this.config.database,
    });

    this.isConnected = true;
  }

  /**
   * Get the table name for a vector index
   */
  private getTableName(indexName: string): string {
    return `mastra_vector_${indexName}`;
  }

  /**
   * Create a new vector index (table with HNSW index)
   */
  async createIndex(params: CreateIndexParams): Promise<void> {
    await this.init();
    const { indexName, dimension, metric = 'cosine' } = params;
    const tableName = this.getTableName(indexName);
    const surrealMetric = METRIC_MAP[metric] || 'COSINE';

    // Create the table with vector fields
    await this.db.query(`
      DEFINE TABLE ${tableName} SCHEMALESS PERMISSIONS FULL;
      DEFINE FIELD id ON ${tableName} TYPE string;
      DEFINE FIELD embedding ON ${tableName} TYPE array<float>;
      DEFINE FIELD metadata ON ${tableName} TYPE option<object>;
      DEFINE FIELD document ON ${tableName} TYPE option<string>;
      DEFINE FIELD createdAt ON ${tableName} TYPE datetime DEFAULT time::now();
      DEFINE FIELD updatedAt ON ${tableName} TYPE datetime DEFAULT time::now();

      DEFINE INDEX idx_${indexName}_id ON ${tableName} FIELDS id UNIQUE;
      DEFINE INDEX idx_${indexName}_embedding ON ${tableName} FIELDS embedding HNSW DIMENSION ${dimension} DIST ${surrealMetric} TYPE F32;
    `);
  }

  /**
   * List all vector indexes
   */
  async listIndexes(): Promise<string[]> {
    await this.init();
    const results = await this.db.query<[{ name: string }[]]>(
      "INFO FOR DB"
    );

    // Parse table names from INFO FOR DB output
    const info = results[0] as any;
    if (!info || !info.tables) return [];

    // Filter tables that start with 'mastra_vector_' and extract index names
    const vectorTables = Object.keys(info.tables).filter(name =>
      name.startsWith('mastra_vector_')
    );

    return vectorTables.map(name => name.replace('mastra_vector_', ''));
  }

  /**
   * Get statistics about a vector index
   */
  async describeIndex(params: DescribeIndexParams): Promise<IndexStats> {
    await this.init();
    const { indexName } = params;
    const tableName = this.getTableName(indexName);

    // Get row count
    const countResults = await this.db.query<[{ count: number }[]]>(
      `SELECT count() as count FROM ${tableName} GROUP ALL`
    );
    const count = countResults[0]?.[0]?.count || 0;

    // Get index info to determine dimension and metric
    const infoResults = await this.db.query<[any]>(`INFO FOR TABLE ${tableName}`);
    const tableInfo = infoResults[0] as any;

    // Parse dimension and metric from index definition
    let dimension = 1536; // default
    let metric: 'cosine' | 'euclidean' | 'dotproduct' = 'cosine';

    if (tableInfo?.indexes) {
      const embeddingIndex = Object.values(tableInfo.indexes).find((idx: any) =>
        typeof idx === 'string' && idx.includes('embedding')
      );
      if (embeddingIndex && typeof embeddingIndex === 'string') {
        // Parse "DEFINE INDEX ... FIELDS embedding HNSW DIMENSION 1536 DIST COSINE TYPE F32"
        const dimMatch = embeddingIndex.match(/DIMENSION\s+(\d+)/i);
        if (dimMatch) dimension = parseInt(dimMatch[1], 10);

        const metricMatch = embeddingIndex.match(/DIST\s+(COSINE|EUCLIDEAN|DOTPRODUCT)/i);
        if (metricMatch) {
          const m = metricMatch[1].toLowerCase();
          metric = m as 'cosine' | 'euclidean' | 'dotproduct';
        }
      }
    }

    return {
      dimension,
      count,
      metric,
    };
  }

  /**
   * Delete a vector index (drop the table)
   */
  async deleteIndex(params: DeleteIndexParams): Promise<void> {
    await this.init();
    const { indexName } = params;
    const tableName = this.getTableName(indexName);
    await this.db.query(`REMOVE TABLE ${tableName}`);
  }

  /**
   * Insert or update vectors
   */
  async upsert(params: UpsertVectorParams): Promise<string[]> {
    await this.init();
    const { indexName, vectors, metadata, ids } = params;
    const tableName = this.getTableName(indexName);

    const insertedIds: string[] = [];

    for (let i = 0; i < vectors.length; i++) {
      const vector = vectors[i];
      const id = ids?.[i] || crypto.randomUUID();
      const meta = Array.isArray(metadata) ? metadata[i] : metadata;

      await this.db.query(
        `INSERT INTO ${tableName} {
          id: $id,
          embedding: $embedding,
          metadata: $metadata,
          createdAt: time::now(),
          updatedAt: time::now()
        } ON DUPLICATE KEY UPDATE
          embedding = $embedding,
          metadata = $metadata,
          updatedAt = time::now()`,
        { id, embedding: vector, metadata: meta }
      );

      insertedIds.push(id);
    }

    return insertedIds;
  }

  /**
   * Query vectors by similarity
   *
   * Uses SurrealDB's native vector search with <|topK|> operator
   */
  async query(params: QueryVectorParams<SurrealVectorFilter>): Promise<QueryResult[]> {
    await this.init();
    const { indexName, queryVector, topK = 10, filter, includeVector = false } = params;
    const tableName = this.getTableName(indexName);

    // Build the query with vector similarity search
    // Use vector::distance::knn() to get the distance from KNN operator
    // Higher effort value (second param) = more accurate but slower
    let query = `
      SELECT
        id,
        ${includeVector ? 'embedding,' : ''}
        metadata,
        document,
        vector::distance::knn() AS distance
      FROM ${tableName}
      WHERE embedding <|${topK}, 40|> $queryVector
    `;

    const queryParams: Record<string, any> = { queryVector };

    // Apply metadata filters if provided
    if (filter && Object.keys(filter).length > 0) {
      const filterClauses = this.buildFilterClauses(filter);
      if (filterClauses) {
        query += ` AND ${filterClauses}`;
      }
    }

    // Order by distance (lower = more similar)
    query += ` ORDER BY distance`;

    const results = await this.db.query<[any[]]>(query, queryParams);

    // Convert distance to similarity score (1 - distance for cosine)
    // For cosine distance, 0 = identical, 2 = opposite
    return (results[0] || []).map((row) => ({
      id: this.normalizeId(row.id),
      score: row.distance !== undefined ? 1 - row.distance : 0,
      metadata: row.metadata,
      vector: includeVector ? row.embedding : undefined,
      document: row.document,
    }));
  }

  /**
   * Normalize SurrealDB record IDs to plain strings
   */
  private normalizeId(id: any): string {
    if (!id) return id;
    if (typeof id === 'object' && id.id) {
      return String(id.id);
    }
    const str = String(id);
    if (str.includes(':')) {
      const parts = str.split(':');
      let idPart = parts.slice(1).join(':');
      idPart = idPart.replace(/^[⟨<]/, '').replace(/[⟩>]$/, '');
      return idPart;
    }
    return str;
  }

  /**
   * Build filter clauses from metadata filter object
   */
  private buildFilterClauses(filter: SurrealVectorFilter): string {
    const clauses: string[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined || value === null) continue;

      if (typeof value === 'string') {
        clauses.push(`metadata.${key} = "${value}"`);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        clauses.push(`metadata.${key} = ${value}`);
      } else if (Array.isArray(value)) {
        // IN clause for arrays
        const formattedValues = value.map(v =>
          typeof v === 'string' ? `"${v}"` : v
        ).join(', ');
        clauses.push(`metadata.${key} IN [${formattedValues}]`);
      }
    }

    return clauses.join(' AND ');
  }

  /**
   * Update a vector by ID
   */
  async updateVector(params: UpdateVectorParams): Promise<void> {
    await this.init();
    const { indexName, id, update } = params;
    const tableName = this.getTableName(indexName);

    const updates: string[] = ['updatedAt = time::now()'];
    const queryParams: Record<string, any> = { id };

    if (update.vector) {
      updates.push('embedding = $embedding');
      queryParams.embedding = update.vector;
    }

    if (update.metadata) {
      updates.push('metadata = $metadata');
      queryParams.metadata = update.metadata;
    }

    await this.db.query(
      `UPDATE ${tableName} SET ${updates.join(', ')} WHERE id = $id`,
      queryParams
    );
  }

  /**
   * Delete a single vector by ID
   */
  async deleteVector(params: DeleteVectorParams): Promise<void> {
    await this.init();
    const { indexName, id } = params;
    const tableName = this.getTableName(indexName);

    await this.db.query(
      `DELETE FROM ${tableName} WHERE id = $id`,
      { id }
    );
  }

  /**
   * Delete multiple vectors by IDs or filter (SurrealDB-specific extension)
   * Note: Not part of MastraVector abstract interface
   */
  async deleteVectors(params: {
    indexName: string;
    ids?: string[];
    filter?: SurrealVectorFilter;
  }): Promise<void> {
    await this.init();
    const { indexName, ids, filter } = params;
    const tableName = this.getTableName(indexName);

    if (ids && ids.length > 0) {
      // Delete by IDs
      const idList = ids.map((id: string) => `"${id}"`).join(', ');
      await this.db.query(`DELETE FROM ${tableName} WHERE id IN [${idList}]`);
    } else if (filter) {
      // Delete by filter
      const filterClauses = this.buildFilterClauses(filter);
      if (filterClauses) {
        await this.db.query(`DELETE FROM ${tableName} WHERE ${filterClauses}`);
      }
    }
  }

  /**
   * Truncate all vectors from an index
   */
  async truncateIndex(indexName: string): Promise<void> {
    await this.init();
    const tableName = this.getTableName(indexName);
    await this.db.query(`DELETE FROM ${tableName}`);
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    await this.db.close();
    this.isConnected = false;
  }
}

export default SurrealVector;
