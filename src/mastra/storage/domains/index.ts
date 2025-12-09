/**
 * Domain classes for SurrealDB Storage
 *
 * Each domain handles a specific area of functionality:
 * - Memory: threads, messages, resources (working memory)
 * - Workflows: snapshots, run tracking
 * - Scores: evals, scoring data
 * - Observability: traces, spans
 * - Operations: generic table CRUD
 */

export { MemorySurreal } from './memory';
export { WorkflowsSurreal } from './workflows';
export { ScoresSurreal } from './scores';
export { ObservabilitySurreal } from './observability';
export { OperationsSurreal } from './operations';
