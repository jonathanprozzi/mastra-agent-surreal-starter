/**
 * SurrealDB Storage exports
 */

export { SurrealStore, type SurrealStoreConfig } from './surreal-store';
export { type SurrealDBConfig, SurrealDBConfigSchema, loadConfigFromEnv } from './shared/config';

// Domain classes (for direct use if needed)
export {
  MemorySurreal,
  WorkflowsSurreal,
  ScoresSurreal,
  ObservabilitySurreal,
  OperationsSurreal,
} from './domains';
