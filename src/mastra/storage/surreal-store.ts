/**
 * SurrealDB Storage Adapter for Mastra v1
 *
 * Extends MastraCompositeStore to provide full compatibility with Mastra's storage interface.
 * Uses the FACADE pattern - delegates all operations to specialized domain classes.
 *
 * Architecture follows official Mastra store patterns:
 * - Memory domain: threads, messages, resources (working memory)
 * - Workflows domain: snapshots, run tracking
 * - Scores domain: evals, scoring data
 * - Observability domain: traces, spans
 * - Agents domain: agent configurations
 */

import Surreal from 'surrealdb';
import { MastraCompositeStore } from '@mastra/core/storage';
import type { StorageDomains } from '@mastra/core/storage';
import { type SurrealDBConfig, loadConfigFromEnv } from './shared/config';
import {
  MemorySurreal,
  WorkflowsSurreal,
  ScoresSurreal,
  ObservabilitySurreal,
  AgentsSurreal,
  OperationsSurreal,
} from './domains';

export interface SurrealStoreConfig {
  url?: string;
  namespace?: string;
  database?: string;
  username?: string;
  password?: string;
  token?: string;
  /** Skip automatic initialization (useful for CI/CD pipelines) */
  disableInit?: boolean;
}

export class SurrealStore extends MastraCompositeStore {
  private db: Surreal;
  private config: SurrealDBConfig;
  private isConnected = false;

  // Domain instances (lazy initialized after connection)
  private _memory!: MemorySurreal;
  private _workflows!: WorkflowsSurreal;
  private _scores!: ScoresSurreal;
  private _observability!: ObservabilitySurreal;
  private _agents!: AgentsSurreal;
  private _operations!: OperationsSurreal;

  constructor(config?: SurrealStoreConfig) {
    super({
      id: 'surreal-store',
      name: 'SurrealStore',
      disableInit: config?.disableInit ?? false,
    });
    this.db = new Surreal();
    this.config = {
      ...loadConfigFromEnv(),
      ...config,
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
    this._agents = new AgentsSurreal(this.db);
    this._operations = new OperationsSurreal(this.db);

    // Initialize agents table
    await this._agents.init();

    // Set up the stores property for getStore() access
    this.stores = {
      memory: this._memory,
      workflows: this._workflows,
      scores: this._scores,
      observability: this._observability,
      agents: this._agents,
    } as StorageDomains;

    this.isConnected = true;
  }

  async close(): Promise<void> {
    await this.db.close();
    this.isConnected = false;
  }

  /**
   * Get a domain-specific storage interface.
   * Overrides base class to ensure initialization before access.
   */
  async getStore<K extends keyof StorageDomains>(
    storeName: K
  ): Promise<StorageDomains[K] | undefined> {
    await this.init();
    return this.stores?.[storeName];
  }

  /**
   * Get the operations domain for low-level table operations.
   * Note: Operations is not part of standard StorageDomains.
   */
  async getOperations(): Promise<OperationsSurreal> {
    await this.init();
    return this._operations;
  }
}

export default SurrealStore;
