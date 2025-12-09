/**
 * SurrealDB Storage Adapter for Mastra
 *
 * Extends MastraStorage to provide full compatibility with Mastra's storage interface.
 * Uses the FACADE pattern - delegates all operations to specialized domain classes.
 *
 * Architecture follows official Mastra store patterns:
 * - Memory domain: threads, messages, resources (working memory)
 * - Workflows domain: snapshots, run tracking
 * - Scores domain: evals, scoring data
 * - Observability domain: traces, spans
 * - Operations domain: generic table CRUD
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
  StorageDomains,
} from '@mastra/core/storage';
import type { StorageThreadType, MastraMessageV1 } from '@mastra/core/memory';
import type { MastraMessageV2, MastraMessageContentV2 } from '@mastra/core/agent';
import type { ScoreRowData, ScoringSource } from '@mastra/core/scores';
import type { Trace } from '@mastra/core/telemetry';
import type { StepResult, WorkflowRunState } from '@mastra/core/workflows';

import { type SurrealDBConfig, loadConfigFromEnv } from './shared/config';
import {
  MemorySurreal,
  WorkflowsSurreal,
  ScoresSurreal,
  ObservabilitySurreal,
  OperationsSurreal,
} from './domains';

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

  // Domain instances (lazy initialized after connection)
  private _memory!: MemorySurreal;
  private _workflows!: WorkflowsSurreal;
  private _scores!: ScoresSurreal;
  private _observability!: ObservabilitySurreal;
  private _operations!: OperationsSurreal;

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

    // Initialize domain instances
    this._memory = new MemorySurreal(this.db);
    this._workflows = new WorkflowsSurreal(this.db);
    this._scores = new ScoresSurreal(this.db);
    this._observability = new ObservabilitySurreal(this.db);
    this._operations = new OperationsSurreal(this.db);

    this.isConnected = true;
  }

  async close(): Promise<void> {
    await this.db.close();
    this.isConnected = false;
  }

  // ============================================
  // TABLE OPERATIONS (delegates to OperationsSurreal)
  // ============================================

  async createTable(args: {
    tableName: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
  }): Promise<void> {
    await this.init();
    return this._operations.createTable(args);
  }

  async clearTable(args: { tableName: TABLE_NAMES }): Promise<void> {
    await this.init();
    return this._operations.clearTable(args);
  }

  async dropTable(args: { tableName: TABLE_NAMES }): Promise<void> {
    await this.init();
    return this._operations.dropTable(args);
  }

  async alterTable(args: {
    tableName: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
    ifNotExists: string[];
  }): Promise<void> {
    await this.init();
    return this._operations.alterTable(args);
  }

  async insert(args: {
    tableName: TABLE_NAMES;
    record: Record<string, any>;
  }): Promise<void> {
    await this.init();
    return this._operations.insert(args);
  }

  async batchInsert(args: {
    tableName: TABLE_NAMES;
    records: Record<string, any>[];
  }): Promise<void> {
    await this.init();
    return this._operations.batchInsert(args);
  }

  async load<R>(args: {
    tableName: TABLE_NAMES;
    keys: Record<string, any>;
  }): Promise<R | null> {
    await this.init();
    return this._operations.load<R>(args);
  }

  // ============================================
  // THREADS (delegates to MemorySurreal)
  // ============================================

  async getThreadById(args: { threadId: string }): Promise<StorageThreadType | null> {
    await this.init();
    return this._memory.getThreadById(args);
  }

  async getThreadsByResourceId(
    args: { resourceId: string } & ThreadSortOptions
  ): Promise<StorageThreadType[]> {
    await this.init();
    return this._memory.getThreadsByResourceId(args);
  }

  async getThreadsByResourceIdPaginated(
    args: { resourceId: string; page: number; perPage: number } & ThreadSortOptions
  ): Promise<PaginationInfo & { threads: StorageThreadType[] }> {
    await this.init();
    return this._memory.getThreadsByResourceIdPaginated(args);
  }

  async saveThread(args: { thread: StorageThreadType }): Promise<StorageThreadType> {
    await this.init();
    return this._memory.saveThread(args);
  }

  async updateThread(args: {
    id: string;
    title: string;
    metadata: Record<string, unknown>;
  }): Promise<StorageThreadType> {
    await this.init();
    return this._memory.updateThread(args);
  }

  async deleteThread(args: { threadId: string }): Promise<void> {
    await this.init();
    return this._memory.deleteThread(args);
  }

  // ============================================
  // MESSAGES (delegates to MemorySurreal)
  // ============================================

  async getMessages(args: StorageGetMessagesArg & { format?: 'v1' }): Promise<MastraMessageV1[]>;
  async getMessages(args: StorageGetMessagesArg & { format: 'v2' }): Promise<MastraMessageV2[]>;
  async getMessages(
    args: StorageGetMessagesArg & { format?: 'v1' | 'v2' }
  ): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    await this.init();
    return this._memory.getMessages(args);
  }

  async getMessagesById(args: { messageIds: string[]; format: 'v1' }): Promise<MastraMessageV1[]>;
  async getMessagesById(args: { messageIds: string[]; format?: 'v2' }): Promise<MastraMessageV2[]>;
  async getMessagesById(args: {
    messageIds: string[];
    format?: 'v1' | 'v2';
  }): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    await this.init();
    return this._memory.getMessagesById(args);
  }

  async getMessagesPaginated(
    args: StorageGetMessagesArg & { format?: 'v1' | 'v2' }
  ): Promise<PaginationInfo & { messages: MastraMessageV1[] | MastraMessageV2[] }> {
    await this.init();
    return this._memory.getMessagesPaginated(args);
  }

  async saveMessages(args: { messages: MastraMessageV1[]; format?: 'v1' }): Promise<MastraMessageV1[]>;
  async saveMessages(args: { messages: MastraMessageV2[]; format: 'v2' }): Promise<MastraMessageV2[]>;
  async saveMessages(
    args: { messages: MastraMessageV1[]; format?: 'v1' } | { messages: MastraMessageV2[]; format: 'v2' }
  ): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    await this.init();
    return this._memory.saveMessages(args);
  }

  async updateMessages(args: {
    messages: (Partial<Omit<MastraMessageV2, 'createdAt'>> & {
      id: string;
      content?: { metadata?: MastraMessageContentV2['metadata']; content?: MastraMessageContentV2['content'] };
    })[];
  }): Promise<MastraMessageV2[]> {
    await this.init();
    return this._memory.updateMessages(args);
  }

  async deleteMessages(messageIds: string[]): Promise<void> {
    await this.init();
    return this._memory.deleteMessages(messageIds);
  }

  // ============================================
  // RESOURCES (delegates to MemorySurreal)
  // ============================================

  async getResourceById(args: { resourceId: string }): Promise<StorageResourceType | null> {
    await this.init();
    return this._memory.getResourceById(args);
  }

  async saveResource(args: { resource: StorageResourceType }): Promise<StorageResourceType> {
    await this.init();
    return this._memory.saveResource(args);
  }

  async updateResource(args: {
    resourceId: string;
    workingMemory?: string;
    metadata?: Record<string, unknown>;
  }): Promise<StorageResourceType> {
    await this.init();
    return this._memory.updateResource(args);
  }

  // ============================================
  // WORKFLOWS (delegates to WorkflowsSurreal)
  // ============================================

  async updateWorkflowResults(args: {
    workflowName: string;
    runId: string;
    stepId: string;
    result: StepResult<any, any, any, any>;
    runtimeContext: Record<string, any>;
  }): Promise<Record<string, StepResult<any, any, any, any>>> {
    await this.init();
    return this._workflows.updateWorkflowResults(args);
  }

  async updateWorkflowState(args: {
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
    return this._workflows.updateWorkflowState(args);
  }

  async persistWorkflowSnapshot(args: {
    workflowName: string;
    runId: string;
    resourceId?: string;
    snapshot: WorkflowRunState;
  }): Promise<void> {
    await this.init();
    return this._workflows.persistWorkflowSnapshot(args);
  }

  async loadWorkflowSnapshot(args: {
    workflowName: string;
    runId: string;
  }): Promise<WorkflowRunState | null> {
    await this.init();
    return this._workflows.loadWorkflowSnapshot(args);
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
    return this._workflows.getWorkflowRuns(args);
  }

  async getWorkflowRunById(args: {
    runId: string;
    workflowName?: string;
  }): Promise<WorkflowRun | null> {
    await this.init();
    return this._workflows.getWorkflowRunById(args);
  }

  // ============================================
  // TRACES (delegates to ObservabilitySurreal)
  // ============================================

  async getTraces(args: StorageGetTracesArg): Promise<Trace[]> {
    await this.init();
    return this._observability.getTraces(args);
  }

  async getTracesPaginated(
    args: StorageGetTracesPaginatedArg
  ): Promise<PaginationInfo & { traces: Trace[] }> {
    await this.init();
    return this._observability.getTracesPaginated(args);
  }

  async batchTraceInsert(args: { records: Record<string, any>[] }): Promise<void> {
    await this.init();
    return this._observability.batchTraceInsert(args);
  }

  // ============================================
  // EVALS (delegates to ScoresSurreal)
  // ============================================

  async getEvalsByAgentName(agentName: string, type?: 'test' | 'live'): Promise<EvalRow[]> {
    await this.init();
    return this._scores.getEvalsByAgentName(agentName, type);
  }

  async getEvals(
    options?: { agentName?: string; type?: 'test' | 'live' } & PaginationArgs
  ): Promise<PaginationInfo & { evals: EvalRow[] }> {
    await this.init();
    return this._scores.getEvals(options);
  }

  // ============================================
  // SCORES (delegates to ScoresSurreal)
  // ============================================

  async getScoreById(args: { id: string }): Promise<ScoreRowData | null> {
    await this.init();
    return this._scores.getScoreById(args);
  }

  async saveScore(score: ScoreRowData): Promise<{ score: ScoreRowData }> {
    await this.init();
    return this._scores.saveScore(score);
  }

  async getScoresByScorerId(args: {
    scorerId: string;
    pagination: StoragePagination;
    entityId?: string;
    entityType?: string;
    source?: ScoringSource;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    await this.init();
    return this._scores.getScoresByScorerId(args);
  }

  async getScoresByRunId(args: {
    runId: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    await this.init();
    return this._scores.getScoresByRunId(args);
  }

  async getScoresByEntityId(args: {
    entityId: string;
    entityType: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    await this.init();
    return this._scores.getScoresByEntityId(args);
  }
}

export default SurrealStore;
