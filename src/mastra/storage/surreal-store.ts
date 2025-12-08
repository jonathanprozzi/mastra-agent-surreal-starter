/**
 * SurrealDB Storage Adapter for Mastra
 *
 * Extends MastraStorage to provide full compatibility with Mastra's storage interface.
 * Leverages SurrealDB's multi-model capabilities (document, vector, graph).
 */

import Surreal from 'surrealdb';
import { MastraStorage } from '@mastra/core/storage';
import type {
  TABLE_NAMES,
  StorageColumn,
  StorageResourceType,
  StorageGetMessagesArg,
  StorageGetTracesArg,
  StorageGetTracesPaginatedArg,
  EvalRow,
  PaginationInfo,
  PaginationArgs,
  StoragePagination,
  WorkflowRun,
  WorkflowRuns,
  ThreadSortOptions,
  AISpanRecord,
  AITraceRecord,
  AITracesPaginatedArg,
  StorageDomains,
} from '@mastra/core/storage';
import type { StorageThreadType, MastraMessageV1 } from '@mastra/core/memory';
import type { MastraMessageV2, MastraMessageContentV2 } from '@mastra/core/agent';
import type { ScoreRowData, ScoringSource } from '@mastra/core/scores';
import type { Trace } from '@mastra/core/telemetry';
import type { StepResult, WorkflowRunState } from '@mastra/core/workflows';
import { type SurrealDBConfig, loadConfigFromEnv } from './config';

export interface SurrealStoreConfig {
  url?: string;
  namespace?: string;
  database?: string;
  username?: string;
  password?: string;
  token?: string;
}

export class SurrealStore extends MastraStorage {
  private db: Surreal;
  private config: SurrealDBConfig;
  private isConnected = false;
  declare stores: StorageDomains;

  constructor(config?: SurrealStoreConfig) {
    super({ name: 'SurrealStore' });
    this.db = new Surreal();
    this.config = {
      ...loadConfigFromEnv(),
      ...config,
    };
  }

  get supports() {
    return {
      selectByIncludeResourceScope: true,
      resourceWorkingMemory: true,
      hasColumn: false,
      createTable: true,
      deleteMessages: true,
      aiTracing: false, // TODO: implement
      indexManagement: false, // TODO: implement
      getScoresBySpan: false, // TODO: implement
    };
  }

  async init(): Promise<void> {
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

  async close(): Promise<void> {
    await this.db.close();
    this.isConnected = false;
  }

  // ============================================
  // TABLE OPERATIONS
  // ============================================

  async createTable({
    tableName,
    schema,
  }: {
    tableName: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
  }): Promise<void> {
    await this.init();
    // SurrealDB is schemaless by default, but we can define schema if needed
    await this.db.query(`DEFINE TABLE ${tableName} SCHEMALESS PERMISSIONS FULL`);
  }

  async clearTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    await this.init();
    await this.db.query(`DELETE FROM ${tableName}`);
  }

  async dropTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    await this.init();
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
    await this.init();
  }

  async insert({
    tableName,
    record,
  }: {
    tableName: TABLE_NAMES;
    record: Record<string, any>;
  }): Promise<void> {
    await this.init();
    await this.db.create(tableName, record);
  }

  async batchInsert({
    tableName,
    records,
  }: {
    tableName: TABLE_NAMES;
    records: Record<string, any>[];
  }): Promise<void> {
    await this.init();
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
    await this.init();
    const whereClauses = Object.entries(keys)
      .map(([k, v]) => `${k} = $${k}`)
      .join(' AND ');
    const results = await this.db.query<[R[]]>(
      `SELECT * FROM ${tableName} WHERE ${whereClauses} LIMIT 1`,
      keys
    );
    return results[0]?.[0] || null;
  }

  // ============================================
  // THREADS (Memory)
  // ============================================

  async getThreadById({
    threadId,
  }: {
    threadId: string;
  }): Promise<StorageThreadType | null> {
    await this.init();
    // Use SurrealDB record syntax for direct lookup
    const results = await this.db.query<[StorageThreadType[]]>(
      'SELECT * FROM type::thing("mastra_threads", $threadId)',
      { threadId }
    );
    const thread = results[0]?.[0];
    if (!thread) return null;
    return {
      ...thread,
      id: this.normalizeId(thread.id),
      createdAt: this.ensureDate(thread.createdAt) || new Date(),
      updatedAt: this.ensureDate(thread.updatedAt) || new Date(),
    };
  }

  // Helper to normalize SurrealDB record IDs to plain strings
  private normalizeId(id: any): string {
    if (!id) return id;
    // Handle SurrealDB RecordId objects
    if (typeof id === 'object' && id.id) {
      return String(id.id);
    }
    // Handle string format like "mastra_threads:uuid" or "mastra_threads:⟨uuid⟩"
    const str = String(id);
    if (str.includes(':')) {
      const parts = str.split(':');
      let idPart = parts.slice(1).join(':');
      // Remove angle brackets if present
      idPart = idPart.replace(/^[⟨<]/, '').replace(/[⟩>]$/, '');
      return idPart;
    }
    return str;
  }

  async getThreadsByResourceId(
    args: { resourceId: string } & ThreadSortOptions
  ): Promise<StorageThreadType[]> {
    await this.init();
    const { resourceId, orderBy = 'createdAt', sortDirection = 'desc' } = args;
    const results = await this.db.query<[StorageThreadType[]]>(
      `SELECT * FROM mastra_threads WHERE resourceId = $resourceId ORDER BY ${orderBy} ${sortDirection.toUpperCase()}`,
      { resourceId }
    );
    return (results[0] || []).map((t) => ({
      ...t,
      id: this.normalizeId(t.id),
      createdAt: this.ensureDate(t.createdAt) || new Date(),
      updatedAt: this.ensureDate(t.updatedAt) || new Date(),
    }));
  }

  async getThreadsByResourceIdPaginated(
    args: { resourceId: string; page: number; perPage: number } & ThreadSortOptions
  ): Promise<PaginationInfo & { threads: StorageThreadType[] }> {
    await this.init();
    const { resourceId, page, perPage, orderBy = 'createdAt', sortDirection = 'desc' } = args;
    const offset = (page - 1) * perPage;

    // Get total count
    const countResults = await this.db.query<[{ count: number }[]]>(
      'SELECT count() as count FROM mastra_threads WHERE resourceId = $resourceId GROUP ALL',
      { resourceId }
    );
    const total = countResults[0]?.[0]?.count || 0;

    // Get paginated results
    const results = await this.db.query<[StorageThreadType[]]>(
      `SELECT * FROM mastra_threads WHERE resourceId = $resourceId ORDER BY ${orderBy} ${sortDirection.toUpperCase()} LIMIT $limit START $offset`,
      { resourceId, limit: perPage, offset }
    );

    const threads = (results[0] || []).map((t) => ({
      ...t,
      id: this.normalizeId(t.id),
      createdAt: this.ensureDate(t.createdAt) || new Date(),
      updatedAt: this.ensureDate(t.updatedAt) || new Date(),
    }));

    return {
      threads,
      page,
      perPage,
      total,
      hasMore: offset + threads.length < total,
    };
  }

  async saveThread({
    thread,
  }: {
    thread: StorageThreadType;
  }): Promise<StorageThreadType> {
    await this.init();
    const now = new Date();
    const toSave = {
      ...thread,
      createdAt: thread.createdAt || now,
      updatedAt: now,
    };

    await this.db.query(
      `INSERT INTO mastra_threads {
        id: $id,
        resourceId: $resourceId,
        title: $title,
        metadata: $metadata,
        createdAt: $createdAt,
        updatedAt: $updatedAt
      } ON DUPLICATE KEY UPDATE
        title = $title,
        metadata = $metadata,
        updatedAt = time::now()`,
      toSave
    );

    return toSave;
  }

  async updateThread({
    id,
    title,
    metadata,
  }: {
    id: string;
    title: string;
    metadata: Record<string, unknown>;
  }): Promise<StorageThreadType> {
    await this.init();
    const results = await this.db.query<[StorageThreadType[]]>(
      `UPDATE type::thing("mastra_threads", $id) SET title = $title, metadata = $metadata, updatedAt = time::now() RETURN AFTER`,
      { id, title, metadata }
    );
    const thread = results[0]?.[0];
    if (!thread) throw new Error(`Thread ${id} not found`);
    return {
      ...thread,
      id: this.normalizeId(thread.id),
      createdAt: this.ensureDate(thread.createdAt) || new Date(),
      updatedAt: this.ensureDate(thread.updatedAt) || new Date(),
    };
  }

  async deleteThread({ threadId }: { threadId: string }): Promise<void> {
    await this.init();
    // Delete messages first
    await this.db.query('DELETE FROM mastra_messages WHERE threadId = $threadId', { threadId });
    // Delete thread using SurrealDB record syntax
    await this.db.query('DELETE type::thing("mastra_threads", $threadId)', { threadId });
  }

  // ============================================
  // MESSAGES (Memory)
  // ============================================

  async getMessages(args: StorageGetMessagesArg & { format?: 'v1' }): Promise<MastraMessageV1[]>;
  async getMessages(args: StorageGetMessagesArg & { format: 'v2' }): Promise<MastraMessageV2[]>;
  async getMessages(
    args: StorageGetMessagesArg & { format?: 'v1' | 'v2' }
  ): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    await this.init();
    const { threadId, selectBy, format = 'v1' } = args;
    const limit = this.resolveMessageLimit({ last: selectBy?.last, defaultLimit: 100 });

    const results = await this.db.query<[any[]]>(
      'SELECT * FROM mastra_messages WHERE threadId = $threadId ORDER BY createdAt ASC LIMIT $limit',
      { threadId, limit }
    );

    const messages = results[0] || [];
    return messages.map((m) => ({
      ...m,
      id: this.normalizeId(m.id),
      threadId: m.threadId, // Keep threadId as-is since it's stored as plain string
      createdAt: this.ensureDate(m.createdAt) || new Date(),
    }));
  }

  async getMessagesById(args: { messageIds: string[]; format: 'v1' }): Promise<MastraMessageV1[]>;
  async getMessagesById(args: { messageIds: string[]; format?: 'v2' }): Promise<MastraMessageV2[]>;
  async getMessagesById({
    messageIds,
    format = 'v1',
  }: {
    messageIds: string[];
    format?: 'v1' | 'v2';
  }): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    await this.init();
    // Build query for multiple message IDs using SurrealDB record syntax
    const recordIds = messageIds.map(id => `type::thing("mastra_messages", "${id}")`).join(', ');
    const results = await this.db.query<[any[]]>(
      `SELECT * FROM [${recordIds}]`
    );
    return (results[0] || []).map((m) => ({
      ...m,
      id: this.normalizeId(m.id),
      createdAt: this.ensureDate(m.createdAt) || new Date(),
    }));
  }

  async getMessagesPaginated(
    args: StorageGetMessagesArg & { format?: 'v1' | 'v2' }
  ): Promise<PaginationInfo & { messages: MastraMessageV1[] | MastraMessageV2[] }> {
    const messages = await this.getMessages({ ...args, format: args.format || 'v1' } as StorageGetMessagesArg & { format: 'v1' });
    return {
      messages,
      page: 1,
      perPage: messages.length,
      total: messages.length,
      hasMore: false,
    };
  }

  async saveMessages(args: { messages: MastraMessageV1[]; format?: 'v1' }): Promise<MastraMessageV1[]>;
  async saveMessages(args: { messages: MastraMessageV2[]; format: 'v2' }): Promise<MastraMessageV2[]>;
  async saveMessages(
    args: { messages: MastraMessageV1[]; format?: 'v1' } | { messages: MastraMessageV2[]; format: 'v2' }
  ): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    await this.init();
    const { messages } = args;
    const saved: any[] = [];

    for (const msg of messages) {
      const toSave = {
        ...msg,
        createdAt: (msg as any).createdAt || new Date(),
      };
      // Use INSERT with explicit ID to control the record ID
      await this.db.query(
        `INSERT INTO mastra_messages {
          id: $id,
          threadId: $threadId,
          role: $role,
          content: $content,
          type: $type,
          createdAt: $createdAt
        } ON DUPLICATE KEY UPDATE
          content = $content`,
        toSave
      );
      saved.push(toSave);
    }

    return saved;
  }

  async updateMessages({
    messages,
  }: {
    messages: (Partial<Omit<MastraMessageV2, 'createdAt'>> & {
      id: string;
      content?: { metadata?: MastraMessageContentV2['metadata']; content?: MastraMessageContentV2['content'] };
    })[];
  }): Promise<MastraMessageV2[]> {
    await this.init();
    const updated: MastraMessageV2[] = [];

    for (const msg of messages) {
      const results = await this.db.query<[MastraMessageV2[]]>(
        `UPDATE type::thing("mastra_messages", $id) SET content = $content RETURN AFTER`,
        { id: msg.id, content: msg.content }
      );
      if (results[0]?.[0]) {
        const m = results[0][0];
        updated.push({ ...m, id: this.normalizeId(m.id) } as MastraMessageV2);
      }
    }

    return updated;
  }

  async deleteMessages(messageIds: string[]): Promise<void> {
    await this.init();
    // Delete each message using record syntax
    for (const messageId of messageIds) {
      await this.db.query('DELETE type::thing("mastra_messages", $messageId)', { messageId });
    }
  }

  // ============================================
  // RESOURCES (Working Memory)
  // ============================================

  async getResourceById({
    resourceId,
  }: {
    resourceId: string;
  }): Promise<StorageResourceType | null> {
    await this.init();
    const results = await this.db.query<[StorageResourceType[]]>(
      'SELECT * FROM mastra_resources WHERE resourceId = $resourceId LIMIT 1',
      { resourceId }
    );
    return results[0]?.[0] || null;
  }

  async saveResource({
    resource,
  }: {
    resource: StorageResourceType;
  }): Promise<StorageResourceType> {
    await this.init();
    const now = new Date();
    const toSave = {
      ...resource,
      createdAt: resource.createdAt || now,
      updatedAt: now,
    };

    await this.db.query(
      `INSERT INTO mastra_resources {
        resourceId: $resourceId,
        workingMemory: $workingMemory,
        metadata: $metadata,
        createdAt: $createdAt,
        updatedAt: $updatedAt
      } ON DUPLICATE KEY UPDATE
        workingMemory = $workingMemory,
        metadata = $metadata,
        updatedAt = time::now()`,
      toSave
    );

    return toSave;
  }

  async updateResource({
    resourceId,
    workingMemory,
    metadata,
  }: {
    resourceId: string;
    workingMemory?: string;
    metadata?: Record<string, unknown>;
  }): Promise<StorageResourceType> {
    await this.init();
    const updates: string[] = [];
    const params: Record<string, any> = { resourceId };

    if (workingMemory !== undefined) {
      updates.push('workingMemory = $workingMemory');
      params.workingMemory = workingMemory;
    }
    if (metadata !== undefined) {
      updates.push('metadata = $metadata');
      params.metadata = metadata;
    }
    updates.push('updatedAt = time::now()');

    const results = await this.db.query<[StorageResourceType[]]>(
      `UPDATE mastra_resources SET ${updates.join(', ')} WHERE resourceId = $resourceId RETURN AFTER`,
      params
    );

    const resource = results[0]?.[0];
    if (!resource) throw new Error(`Resource ${resourceId} not found`);
    return resource;
  }

  // ============================================
  // WORKFLOWS
  // ============================================

  async updateWorkflowResults({
    workflowName,
    runId,
    stepId,
    result,
    runtimeContext,
  }: {
    workflowName: string;
    runId: string;
    stepId: string;
    result: StepResult<any, any, any, any>;
    runtimeContext: Record<string, any>;
  }): Promise<Record<string, StepResult<any, any, any, any>>> {
    await this.init();
    // Load existing snapshot and update the step result
    const snapshot = await this.loadWorkflowSnapshot({ workflowName, runId });
    const stepResults: Record<string, StepResult<any, any, any, any>> = {};
    stepResults[stepId] = result;

    // Update snapshot with the new step result
    await this.db.query(
      `UPDATE mastra_workflow_snapshot SET result = $result, updatedAt = time::now() WHERE workflowName = $workflowName AND runId = $runId`,
      { workflowName, runId, result: stepResults }
    );

    return stepResults;
  }

  async updateWorkflowState({
    workflowName,
    runId,
    opts,
  }: {
    workflowName: string;
    runId: string;
    opts: {
      status: string;
      result?: StepResult<any, any, any, any>;
      error?: string;
      suspendedPaths?: Record<string, number[]>;
      waitingPaths?: Record<string, number[]>;
    };
  }): Promise<WorkflowRunState | undefined> {
    await this.init();
    const results = await this.db.query<[WorkflowRunState[]]>(
      `UPDATE mastra_workflow_snapshot SET
        status = $status,
        error = $error,
        suspendedPaths = $suspendedPaths,
        waitingPaths = $waitingPaths,
        updatedAt = time::now()
      WHERE workflowName = $workflowName AND runId = $runId RETURN AFTER`,
      { workflowName, runId, ...opts }
    );
    return results[0]?.[0];
  }

  async persistWorkflowSnapshot({
    workflowName,
    runId,
    resourceId,
    snapshot,
  }: {
    workflowName: string;
    runId: string;
    resourceId?: string;
    snapshot: WorkflowRunState;
  }): Promise<void> {
    await this.init();
    const now = new Date();
    await this.db.query(
      `INSERT INTO mastra_workflow_snapshot {
        workflowName: $workflowName,
        runId: $runId,
        resourceId: $resourceId,
        snapshot: $snapshot,
        status: $status,
        createdAt: $now,
        updatedAt: $now
      } ON DUPLICATE KEY UPDATE
        snapshot = $snapshot,
        status = $status,
        updatedAt = time::now()`,
      { workflowName, runId, resourceId, snapshot, status: snapshot.status, now }
    );
  }

  async loadWorkflowSnapshot({
    workflowName,
    runId,
  }: {
    workflowName: string;
    runId: string;
  }): Promise<WorkflowRunState | null> {
    await this.init();
    const results = await this.db.query<[{ snapshot: WorkflowRunState }[]]>(
      'SELECT snapshot FROM mastra_workflow_snapshot WHERE workflowName = $workflowName AND runId = $runId LIMIT 1',
      { workflowName, runId }
    );
    return results[0]?.[0]?.snapshot || null;
  }

  async getWorkflowRuns(args?: {
    workflowName?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
    resourceId?: string;
  }): Promise<WorkflowRuns> {
    await this.init();
    const { workflowName, fromDate, toDate, limit = 100, offset = 0, resourceId } = args || {};

    let query = 'SELECT * FROM mastra_workflow_snapshot WHERE 1=1';
    const params: Record<string, any> = { limit, offset };

    if (workflowName) {
      query += ' AND workflowName = $workflowName';
      params.workflowName = workflowName;
    }
    if (resourceId) {
      query += ' AND resourceId = $resourceId';
      params.resourceId = resourceId;
    }
    if (fromDate) {
      query += ' AND createdAt >= $fromDate';
      params.fromDate = fromDate;
    }
    if (toDate) {
      query += ' AND createdAt <= $toDate';
      params.toDate = toDate;
    }

    query += ' ORDER BY createdAt DESC LIMIT $limit START $offset';

    const results = await this.db.query<[WorkflowRun[]]>(query, params);
    const runs = results[0] || [];
    return { runs, total: runs.length };
  }

  async getWorkflowRunById({
    runId,
    workflowName,
  }: {
    runId: string;
    workflowName?: string;
  }): Promise<WorkflowRun | null> {
    await this.init();
    let query = 'SELECT * FROM mastra_workflow_snapshot WHERE runId = $runId';
    const params: Record<string, any> = { runId };

    if (workflowName) {
      query += ' AND workflowName = $workflowName';
      params.workflowName = workflowName;
    }
    query += ' LIMIT 1';

    const results = await this.db.query<[WorkflowRun[]]>(query, params);
    return results[0]?.[0] || null;
  }

  // ============================================
  // TRACES
  // ============================================

  async getTraces(args: StorageGetTracesArg): Promise<Trace[]> {
    await this.init();
    const { name, scope, page = 1, perPage = 100 } = args;
    const offset = (page - 1) * perPage;

    let query = 'SELECT * FROM mastra_traces WHERE 1=1';
    const params: Record<string, any> = { limit: perPage, offset };

    if (name) {
      query += ' AND name = $name';
      params.name = name;
    }
    if (scope) {
      query += ' AND scope = $scope';
      params.scope = scope;
    }

    query += ' ORDER BY createdAt DESC LIMIT $limit START $offset';

    const results = await this.db.query<[Trace[]]>(query, params);
    return results[0] || [];
  }

  async getTracesPaginated(
    args: StorageGetTracesPaginatedArg
  ): Promise<PaginationInfo & { traces: Trace[] }> {
    const page = args.page ?? 1;
    const perPage = args.perPage ?? 100;
    const traces = await this.getTraces({ ...args, page, perPage });
    return {
      traces,
      page,
      perPage,
      total: traces.length,
      hasMore: traces.length === perPage,
    };
  }

  async batchTraceInsert({ records }: { records: Record<string, any>[] }): Promise<void> {
    await this.init();
    for (const record of records) {
      await this.db.create('mastra_traces', {
        ...record,
        createdAt: new Date(),
      });
    }
  }

  // ============================================
  // EVALS
  // ============================================

  async getEvalsByAgentName(agentName: string, type?: 'test' | 'live'): Promise<EvalRow[]> {
    await this.init();
    let query = 'SELECT * FROM mastra_evals WHERE agentName = $agentName';
    const params: Record<string, any> = { agentName };

    if (type) {
      query += ' AND type = $type';
      params.type = type;
    }

    query += ' ORDER BY createdAt DESC';

    const results = await this.db.query<[EvalRow[]]>(query, params);
    return results[0] || [];
  }

  async getEvals(
    options?: { agentName?: string; type?: 'test' | 'live' } & PaginationArgs
  ): Promise<PaginationInfo & { evals: EvalRow[] }> {
    await this.init();
    const { agentName, type, page = 1, perPage = 100 } = options || {};
    const offset = (page - 1) * perPage;

    let query = 'SELECT * FROM mastra_evals WHERE 1=1';
    const params: Record<string, any> = { limit: perPage, offset };

    if (agentName) {
      query += ' AND agentName = $agentName';
      params.agentName = agentName;
    }
    if (type) {
      query += ' AND type = $type';
      params.type = type;
    }

    query += ' ORDER BY createdAt DESC LIMIT $limit START $offset';

    const results = await this.db.query<[EvalRow[]]>(query, params);
    const evals = results[0] || [];

    return {
      evals,
      page,
      perPage,
      total: evals.length,
      hasMore: evals.length === perPage,
    };
  }

  // ============================================
  // SCORES
  // ============================================

  async getScoreById({ id }: { id: string }): Promise<ScoreRowData | null> {
    await this.init();
    const results = await this.db.query<[ScoreRowData[]]>(
      'SELECT * FROM mastra_scores WHERE id = $id LIMIT 1',
      { id }
    );
    return results[0]?.[0] || null;
  }

  async saveScore(score: ScoreRowData): Promise<{ score: ScoreRowData }> {
    await this.init();
    const toSave = {
      ...score,
      createdAt: score.createdAt || new Date(),
      updatedAt: new Date(),
    };
    await this.db.create('mastra_scores', toSave);
    return { score: toSave };
  }

  async getScoresByScorerId({
    scorerId,
    pagination,
    entityId,
    entityType,
    source,
  }: {
    scorerId: string;
    pagination: StoragePagination;
    entityId?: string;
    entityType?: string;
    source?: ScoringSource;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    await this.init();
    const { page = 1, perPage = 100 } = pagination;
    const offset = (page - 1) * perPage;

    let query = 'SELECT * FROM mastra_scores WHERE scorerId = $scorerId';
    const params: Record<string, any> = { scorerId, limit: perPage, offset };

    if (entityId) {
      query += ' AND entityId = $entityId';
      params.entityId = entityId;
    }
    if (entityType) {
      query += ' AND entityType = $entityType';
      params.entityType = entityType;
    }
    if (source) {
      query += ' AND source = $source';
      params.source = source;
    }

    query += ' ORDER BY createdAt DESC LIMIT $limit START $offset';

    const results = await this.db.query<[ScoreRowData[]]>(query, params);
    const scores = results[0] || [];

    return {
      pagination: { page, perPage, total: scores.length, hasMore: scores.length === perPage },
      scores,
    };
  }

  async getScoresByRunId({
    runId,
    pagination,
  }: {
    runId: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    await this.init();
    const { page = 1, perPage = 100 } = pagination;
    const offset = (page - 1) * perPage;

    const results = await this.db.query<[ScoreRowData[]]>(
      'SELECT * FROM mastra_scores WHERE runId = $runId ORDER BY createdAt DESC LIMIT $limit START $offset',
      { runId, limit: perPage, offset }
    );
    const scores = results[0] || [];

    return {
      pagination: { page, perPage, total: scores.length, hasMore: scores.length === perPage },
      scores,
    };
  }

  async getScoresByEntityId({
    entityId,
    entityType,
    pagination,
  }: {
    entityId: string;
    entityType: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    await this.init();
    const { page = 1, perPage = 100 } = pagination;
    const offset = (page - 1) * perPage;

    const results = await this.db.query<[ScoreRowData[]]>(
      'SELECT * FROM mastra_scores WHERE entityId = $entityId AND entityType = $entityType ORDER BY createdAt DESC LIMIT $limit START $offset',
      { entityId, entityType, limit: perPage, offset }
    );
    const scores = results[0] || [];

    return {
      pagination: { page, perPage, total: scores.length, hasMore: scores.length === perPage },
      scores,
    };
  }
}

export default SurrealStore;
