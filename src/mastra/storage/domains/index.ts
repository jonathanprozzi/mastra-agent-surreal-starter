/**
 * Domain classes for SurrealDB Storage
 *
 * Each domain handles a specific area of functionality:
 * - Memory: threads, messages, resources (working memory)
 * - Workflows: snapshots, run tracking
 * - Scores: evals, scoring data
 * - Observability: traces, spans
 * - Agents: agent configurations and persistence
 * - Operations: generic table CRUD
 */

export { MemorySurreal } from './memory';
export { WorkflowsSurreal } from './workflows';
export { ScoresSurreal } from './scores';
export { ObservabilitySurreal } from './observability';
export { AgentsSurreal, type StoredAgent, type AgentInput } from './agents';
export { OperationsSurreal } from './operations';
