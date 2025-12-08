/**
 * SurrealDB Storage Adapter for Mastra
 *
 * Implements the MastraStorage interface using SurrealDB's multi-model capabilities.
 */

import Surreal from 'surrealdb';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type SurrealDBConfig, loadConfigFromEnv } from './config';

// Types matching Mastra's storage interface
export interface Thread {
  id: string;
  resourceId: string;
  title?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | unknown[];
  toolCalls?: Record<string, unknown>[];
  toolCallId?: string;
  createdAt: Date;
  embedding?: number[];
}

export interface WorkflowSnapshot {
  id: string;
  workflowId: string;
  runId: string;
  snapshot: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Trace {
  id: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  kind?: string;
  status?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  events?: Record<string, unknown>[];
  startTime: Date;
  endTime?: Date;
  createdAt: Date;
}

export interface EvalResult {
  id: string;
  name: string;
  input: unknown;
  output: unknown;
  expected?: unknown;
  score?: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface ScorerResult {
  id: string;
  name: string;
  score: number;
  reasoning?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface Resource {
  id: string;
  resourceId: string;
  key: string;
  value: unknown;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  embedding?: number[];
}

/**
 * SurrealDB Storage Adapter
 */
export class SurrealDBStore {
  private db: Surreal;
  private config: SurrealDBConfig;
  private initialized = false;

  constructor(config?: Partial<SurrealDBConfig>) {
    this.db = new Surreal();
    this.config = {
      ...loadConfigFromEnv(),
      ...config,
    };
  }

  /**
   * Initialize connection and optionally apply schema
   */
  async init(applySchema = false): Promise<void> {
    if (this.initialized) return;

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

    if (applySchema) {
      await this.applySchema();
    }

    this.initialized = true;
  }

  /**
   * Apply the schema from schema.surql
   */
  async applySchema(): Promise<void> {
    const schemaPath = join(import.meta.dir, 'schema.surql');
    const schema = readFileSync(schemaPath, 'utf-8');
    await this.db.query(schema);
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    await this.db.close();
    this.initialized = false;
  }

  /**
   * Get raw database instance for advanced queries
   */
  get database(): Surreal {
    return this.db;
  }

  // ============================================
  // THREADS
  // ============================================

  async createThread(thread: Omit<Thread, 'createdAt' | 'updatedAt'>): Promise<Thread> {
    const now = new Date();
    const [result] = await this.db.create('mastra_threads', {
      ...thread,
      createdAt: now,
      updatedAt: now,
    });
    return result as Thread;
  }

  async getThread(id: string): Promise<Thread | null> {
    const results = await this.db.query<[Thread[]]>(
      'SELECT * FROM mastra_threads WHERE id = $id LIMIT 1',
      { id }
    );
    return results[0]?.[0] || null;
  }

  async getThreadsByResource(resourceId: string): Promise<Thread[]> {
    const results = await this.db.query<[Thread[]]>(
      'SELECT * FROM mastra_threads WHERE resourceId = $resourceId ORDER BY createdAt DESC',
      { resourceId }
    );
    return results[0] || [];
  }

  async updateThread(id: string, updates: Partial<Thread>): Promise<Thread | null> {
    const results = await this.db.query<[Thread[]]>(
      `UPDATE mastra_threads SET ${Object.keys(updates).map(k => `${k} = $${k}`).join(', ')}, updatedAt = time::now() WHERE id = $id RETURN AFTER`,
      { id, ...updates }
    );
    return results[0]?.[0] || null;
  }

  async deleteThread(id: string): Promise<boolean> {
    await this.db.query('DELETE FROM mastra_threads WHERE id = $id', { id });
    return true;
  }

  // ============================================
  // MESSAGES
  // ============================================

  async addMessage(message: Omit<Message, 'createdAt'>): Promise<Message> {
    const [result] = await this.db.create('mastra_messages', {
      ...message,
      createdAt: new Date(),
    });
    return result as Message;
  }

  async getMessages(threadId: string, limit = 100): Promise<Message[]> {
    const results = await this.db.query<[Message[]]>(
      'SELECT * FROM mastra_messages WHERE threadId = $threadId ORDER BY createdAt ASC LIMIT $limit',
      { threadId, limit }
    );
    return results[0] || [];
  }

  async getMessageById(id: string): Promise<Message | null> {
    const results = await this.db.query<[Message[]]>(
      'SELECT * FROM mastra_messages WHERE id = $id LIMIT 1',
      { id }
    );
    return results[0]?.[0] || null;
  }

  async getMessagesById(ids: string[]): Promise<Message[]> {
    const results = await this.db.query<[Message[]]>(
      'SELECT * FROM mastra_messages WHERE id IN $ids',
      { ids }
    );
    return results[0] || [];
  }

  async deleteMessage(id: string): Promise<boolean> {
    await this.db.query('DELETE FROM mastra_messages WHERE id = $id', { id });
    return true;
  }

  async deleteMessagesByThread(threadId: string): Promise<boolean> {
    await this.db.query('DELETE FROM mastra_messages WHERE threadId = $threadId', { threadId });
    return true;
  }

  // ============================================
  // WORKFLOW SNAPSHOTS
  // ============================================

  async saveWorkflowSnapshot(snapshot: Omit<WorkflowSnapshot, 'createdAt' | 'updatedAt'>): Promise<WorkflowSnapshot> {
    const now = new Date();
    // Upsert based on workflowId + runId
    const results = await this.db.query<[WorkflowSnapshot[]]>(
      `INSERT INTO mastra_workflow_snapshot $data ON DUPLICATE KEY UPDATE snapshot = $data.snapshot, updatedAt = time::now()`,
      {
        data: {
          ...snapshot,
          createdAt: now,
          updatedAt: now,
        }
      }
    );
    return results[0]?.[0] || snapshot as WorkflowSnapshot;
  }

  async getWorkflowSnapshot(workflowId: string, runId: string): Promise<WorkflowSnapshot | null> {
    const results = await this.db.query<[WorkflowSnapshot[]]>(
      'SELECT * FROM mastra_workflow_snapshot WHERE workflowId = $workflowId AND runId = $runId LIMIT 1',
      { workflowId, runId }
    );
    return results[0]?.[0] || null;
  }

  async deleteWorkflowSnapshot(workflowId: string, runId: string): Promise<boolean> {
    await this.db.query(
      'DELETE FROM mastra_workflow_snapshot WHERE workflowId = $workflowId AND runId = $runId',
      { workflowId, runId }
    );
    return true;
  }

  // ============================================
  // TRACES
  // ============================================

  async saveTrace(trace: Omit<Trace, 'createdAt'>): Promise<Trace> {
    const [result] = await this.db.create('mastra_traces', {
      ...trace,
      createdAt: new Date(),
    });
    return result as Trace;
  }

  async getTraces(traceId: string): Promise<Trace[]> {
    const results = await this.db.query<[Trace[]]>(
      'SELECT * FROM mastra_traces WHERE traceId = $traceId ORDER BY startTime ASC',
      { traceId }
    );
    return results[0] || [];
  }

  async getTracesByName(name: string, limit = 100): Promise<Trace[]> {
    const results = await this.db.query<[Trace[]]>(
      'SELECT * FROM mastra_traces WHERE name = $name ORDER BY createdAt DESC LIMIT $limit',
      { name, limit }
    );
    return results[0] || [];
  }

  // ============================================
  // EVALS
  // ============================================

  async saveEval(evalResult: Omit<EvalResult, 'createdAt'>): Promise<EvalResult> {
    const [result] = await this.db.create('mastra_evals', {
      ...evalResult,
      createdAt: new Date(),
    });
    return result as EvalResult;
  }

  async getEvals(name: string, limit = 100): Promise<EvalResult[]> {
    const results = await this.db.query<[EvalResult[]]>(
      'SELECT * FROM mastra_evals WHERE name = $name ORDER BY createdAt DESC LIMIT $limit',
      { name, limit }
    );
    return results[0] || [];
  }

  // ============================================
  // SCORERS
  // ============================================

  async saveScorer(scorer: Omit<ScorerResult, 'createdAt'>): Promise<ScorerResult> {
    const [result] = await this.db.create('mastra_scorers', {
      ...scorer,
      createdAt: new Date(),
    });
    return result as ScorerResult;
  }

  async getScorers(name: string, limit = 100): Promise<ScorerResult[]> {
    const results = await this.db.query<[ScorerResult[]]>(
      'SELECT * FROM mastra_scorers WHERE name = $name ORDER BY createdAt DESC LIMIT $limit',
      { name, limit }
    );
    return results[0] || [];
  }

  // ============================================
  // RESOURCES (Working Memory)
  // ============================================

  async setResource(resource: Omit<Resource, 'createdAt' | 'updatedAt'>): Promise<Resource> {
    const now = new Date();
    // Upsert based on resourceId + key
    const results = await this.db.query<[Resource[]]>(
      `INSERT INTO mastra_resources {
        id: $id,
        resourceId: $resourceId,
        key: $key,
        value: $value,
        metadata: $metadata,
        embedding: $embedding,
        createdAt: $now,
        updatedAt: $now
      } ON DUPLICATE KEY UPDATE value = $value, metadata = $metadata, embedding = $embedding, updatedAt = time::now()`,
      { ...resource, now }
    );
    return results[0]?.[0] || resource as Resource;
  }

  async getResource(resourceId: string, key: string): Promise<Resource | null> {
    const results = await this.db.query<[Resource[]]>(
      'SELECT * FROM mastra_resources WHERE resourceId = $resourceId AND key = $key LIMIT 1',
      { resourceId, key }
    );
    return results[0]?.[0] || null;
  }

  async getResourcesByResourceId(resourceId: string): Promise<Resource[]> {
    const results = await this.db.query<[Resource[]]>(
      'SELECT * FROM mastra_resources WHERE resourceId = $resourceId ORDER BY key ASC',
      { resourceId }
    );
    return results[0] || [];
  }

  async deleteResource(resourceId: string, key: string): Promise<boolean> {
    await this.db.query(
      'DELETE FROM mastra_resources WHERE resourceId = $resourceId AND key = $key',
      { resourceId, key }
    );
    return true;
  }

  // ============================================
  // VECTOR SEARCH (Semantic Memory)
  // ============================================

  /**
   * Search messages by embedding similarity
   * Requires HNSW index to be enabled in schema
   */
  async searchMessagesByEmbedding(
    embedding: number[],
    limit = 10,
    threadId?: string
  ): Promise<(Message & { similarity: number })[]> {
    const whereClause = threadId
      ? 'WHERE threadId = $threadId AND embedding <|$limit|> $embedding'
      : 'WHERE embedding <|$limit|> $embedding';

    const results = await this.db.query<[(Message & { similarity: number })[]]>(
      `SELECT *, vector::similarity::cosine(embedding, $embedding) AS similarity
       FROM mastra_messages
       ${whereClause}
       ORDER BY similarity DESC`,
      { embedding, limit, threadId }
    );
    return results[0] || [];
  }

  /**
   * Search resources by embedding similarity
   * Requires HNSW index to be enabled in schema
   */
  async searchResourcesByEmbedding(
    embedding: number[],
    limit = 10,
    resourceId?: string
  ): Promise<(Resource & { similarity: number })[]> {
    const whereClause = resourceId
      ? 'WHERE resourceId = $resourceId AND embedding <|$limit|> $embedding'
      : 'WHERE embedding <|$limit|> $embedding';

    const results = await this.db.query<[(Resource & { similarity: number })[]]>(
      `SELECT *, vector::similarity::cosine(embedding, $embedding) AS similarity
       FROM mastra_resources
       ${whereClause}
       ORDER BY similarity DESC`,
      { embedding, limit, resourceId }
    );
    return results[0] || [];
  }
}

export default SurrealDBStore;
