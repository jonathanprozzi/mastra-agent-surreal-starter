-- Mastra SurrealDB Schema
-- Compatible with MastraStorage interface (9 tables)

-- ============================================
-- 1. THREADS (conversation threads)
-- ============================================
DEFINE TABLE mastra_threads SCHEMAFULL PERMISSIONS FULL;
DEFINE FIELD id ON mastra_threads TYPE string;
DEFINE FIELD resourceId ON mastra_threads TYPE string;
DEFINE FIELD title ON mastra_threads TYPE option<string>;
DEFINE FIELD metadata ON mastra_threads TYPE option<object>;
DEFINE FIELD createdAt ON mastra_threads TYPE datetime DEFAULT time::now();
DEFINE FIELD updatedAt ON mastra_threads TYPE datetime DEFAULT time::now();

DEFINE INDEX idx_threads_id ON mastra_threads FIELDS id UNIQUE;
DEFINE INDEX idx_threads_resource ON mastra_threads FIELDS resourceId;
DEFINE INDEX idx_threads_resource_created ON mastra_threads FIELDS resourceId, createdAt;

-- ============================================
-- 2. MESSAGES (conversation messages)
-- ============================================
DEFINE TABLE mastra_messages SCHEMALESS PERMISSIONS FULL;
DEFINE FIELD id ON mastra_messages TYPE string;
DEFINE FIELD threadId ON mastra_messages TYPE string;
DEFINE FIELD role ON mastra_messages TYPE string ASSERT $value IN ['user', 'assistant', 'system', 'tool'];
-- content can be string or array (v2 format), using SCHEMALESS for flexibility
DEFINE FIELD toolCalls ON mastra_messages TYPE option<array<object>>;
DEFINE FIELD toolCallId ON mastra_messages TYPE option<string>;
DEFINE FIELD createdAt ON mastra_messages TYPE datetime DEFAULT time::now();
-- Vector embedding for semantic recall
DEFINE FIELD embedding ON mastra_messages TYPE option<array<float>>;

DEFINE INDEX idx_messages_id ON mastra_messages FIELDS id UNIQUE;
DEFINE INDEX idx_messages_thread ON mastra_messages FIELDS threadId;
DEFINE INDEX idx_messages_thread_created ON mastra_messages FIELDS threadId, createdAt;
-- HNSW index for semantic search (1536 dimensions for OpenAI embeddings)
-- DEFINE INDEX idx_messages_embedding ON mastra_messages FIELDS embedding HNSW DIMENSION 1536 DIST COSINE TYPE F32;

-- ============================================
-- 3. WORKFLOW SNAPSHOTS (suspended workflow state)
-- ============================================
DEFINE TABLE mastra_workflow_snapshot SCHEMAFULL PERMISSIONS FULL;
DEFINE FIELD id ON mastra_workflow_snapshot TYPE string;
DEFINE FIELD workflowName ON mastra_workflow_snapshot TYPE string;
DEFINE FIELD runId ON mastra_workflow_snapshot TYPE string;
DEFINE FIELD resourceId ON mastra_workflow_snapshot TYPE option<string>;
DEFINE FIELD snapshot ON mastra_workflow_snapshot TYPE object;
DEFINE FIELD status ON mastra_workflow_snapshot TYPE option<string>;
DEFINE FIELD error ON mastra_workflow_snapshot TYPE option<string>;
DEFINE FIELD result ON mastra_workflow_snapshot TYPE option<object>;
DEFINE FIELD suspendedPaths ON mastra_workflow_snapshot TYPE option<object>;
DEFINE FIELD waitingPaths ON mastra_workflow_snapshot TYPE option<object>;
DEFINE FIELD createdAt ON mastra_workflow_snapshot TYPE datetime DEFAULT time::now();
DEFINE FIELD updatedAt ON mastra_workflow_snapshot TYPE datetime DEFAULT time::now();

DEFINE INDEX idx_workflow_snapshot_id ON mastra_workflow_snapshot FIELDS id UNIQUE;
DEFINE INDEX idx_workflow_snapshot_run ON mastra_workflow_snapshot FIELDS workflowName, runId;
DEFINE INDEX idx_workflow_snapshot_resource ON mastra_workflow_snapshot FIELDS resourceId;

-- ============================================
-- 4. TRACES (OpenTelemetry data)
-- ============================================
DEFINE TABLE mastra_traces SCHEMAFULL PERMISSIONS FULL;
DEFINE FIELD id ON mastra_traces TYPE string;
DEFINE FIELD traceId ON mastra_traces TYPE string;
DEFINE FIELD parentSpanId ON mastra_traces TYPE option<string>;
DEFINE FIELD name ON mastra_traces TYPE string;
DEFINE FIELD kind ON mastra_traces TYPE option<string>;
DEFINE FIELD status ON mastra_traces TYPE option<object>;
DEFINE FIELD attributes ON mastra_traces TYPE option<object>;
DEFINE FIELD events ON mastra_traces TYPE option<array<object>>;
DEFINE FIELD startTime ON mastra_traces TYPE datetime;
DEFINE FIELD endTime ON mastra_traces TYPE option<datetime>;
DEFINE FIELD createdAt ON mastra_traces TYPE datetime DEFAULT time::now();

DEFINE INDEX idx_traces_id ON mastra_traces FIELDS id UNIQUE;
DEFINE INDEX idx_traces_trace ON mastra_traces FIELDS traceId;
DEFINE INDEX idx_traces_name ON mastra_traces FIELDS name;

-- ============================================
-- 5. EVALS (evaluation results)
-- ============================================
DEFINE TABLE mastra_evals SCHEMALESS PERMISSIONS FULL;
DEFINE FIELD id ON mastra_evals TYPE string;
DEFINE FIELD name ON mastra_evals TYPE string;
DEFINE FIELD agentName ON mastra_evals TYPE option<string>;
DEFINE FIELD type ON mastra_evals TYPE option<string>;
-- input, output, expected can be any type - using SCHEMALESS
DEFINE FIELD score ON mastra_evals TYPE option<float>;
DEFINE FIELD metadata ON mastra_evals TYPE option<object>;
DEFINE FIELD createdAt ON mastra_evals TYPE datetime DEFAULT time::now();

DEFINE INDEX idx_evals_id ON mastra_evals FIELDS id UNIQUE;
DEFINE INDEX idx_evals_name ON mastra_evals FIELDS name;
DEFINE INDEX idx_evals_agent ON mastra_evals FIELDS agentName;

-- ============================================
-- 6. SCORERS (scoring data)
-- ============================================
DEFINE TABLE mastra_scorers SCHEMAFULL PERMISSIONS FULL;
DEFINE FIELD id ON mastra_scorers TYPE string;
DEFINE FIELD name ON mastra_scorers TYPE string;
DEFINE FIELD score ON mastra_scorers TYPE float;
DEFINE FIELD reasoning ON mastra_scorers TYPE option<string>;
DEFINE FIELD metadata ON mastra_scorers TYPE option<object>;
DEFINE FIELD createdAt ON mastra_scorers TYPE datetime DEFAULT time::now();

DEFINE INDEX idx_scorers_id ON mastra_scorers FIELDS id UNIQUE;
DEFINE INDEX idx_scorers_name ON mastra_scorers FIELDS name;

-- ============================================
-- 7. SCORES (scoring run data - distinct from scorers)
-- ============================================
DEFINE TABLE mastra_scores SCHEMALESS PERMISSIONS FULL;
DEFINE FIELD id ON mastra_scores TYPE string;
DEFINE FIELD scorerId ON mastra_scores TYPE string;
DEFINE FIELD entityId ON mastra_scores TYPE option<string>;
DEFINE FIELD entityType ON mastra_scores TYPE option<string>;
DEFINE FIELD runId ON mastra_scores TYPE option<string>;
DEFINE FIELD source ON mastra_scores TYPE option<string>;
DEFINE FIELD score ON mastra_scores TYPE option<float>;
DEFINE FIELD reasoning ON mastra_scores TYPE option<string>;
DEFINE FIELD metadata ON mastra_scores TYPE option<object>;
DEFINE FIELD createdAt ON mastra_scores TYPE datetime DEFAULT time::now();
DEFINE FIELD updatedAt ON mastra_scores TYPE datetime DEFAULT time::now();

DEFINE INDEX idx_scores_id ON mastra_scores FIELDS id UNIQUE;
DEFINE INDEX idx_scores_scorer ON mastra_scores FIELDS scorerId;
DEFINE INDEX idx_scores_entity ON mastra_scores FIELDS entityId, entityType;
DEFINE INDEX idx_scores_run ON mastra_scores FIELDS runId;

-- ============================================
-- 8. RESOURCES (working memory / resource-scoped)
-- ============================================
DEFINE TABLE mastra_resources SCHEMALESS PERMISSIONS FULL;
DEFINE FIELD id ON mastra_resources TYPE string;
DEFINE FIELD resourceId ON mastra_resources TYPE string;
DEFINE FIELD workingMemory ON mastra_resources TYPE option<string>;
-- value can be any type - using SCHEMALESS
DEFINE FIELD metadata ON mastra_resources TYPE option<object>;
DEFINE FIELD createdAt ON mastra_resources TYPE datetime DEFAULT time::now();
DEFINE FIELD updatedAt ON mastra_resources TYPE datetime DEFAULT time::now();
-- Vector embedding for semantic memory
DEFINE FIELD embedding ON mastra_resources TYPE option<array<float>>;

DEFINE INDEX idx_resources_id ON mastra_resources FIELDS id UNIQUE;
DEFINE INDEX idx_resources_resource ON mastra_resources FIELDS resourceId UNIQUE;
-- HNSW index for semantic search
-- DEFINE INDEX idx_resources_embedding ON mastra_resources FIELDS embedding HNSW DIMENSION 1536 DIST COSINE TYPE F32;

-- ============================================
-- 9. AGENTS (agent configurations)
-- ============================================
DEFINE TABLE mastra_agents SCHEMALESS PERMISSIONS FULL;
DEFINE FIELD id ON mastra_agents TYPE string;
DEFINE FIELD name ON mastra_agents TYPE string;
DEFINE FIELD description ON mastra_agents TYPE option<string>;
DEFINE FIELD instructions ON mastra_agents TYPE option<string>;
-- Complex objects stored as JSON strings
DEFINE FIELD model ON mastra_agents TYPE option<string>;
DEFINE FIELD tools ON mastra_agents TYPE option<string>;
DEFINE FIELD defaultOptions ON mastra_agents TYPE option<string>;
DEFINE FIELD workflows ON mastra_agents TYPE option<string>;
DEFINE FIELD agents ON mastra_agents TYPE option<string>;
DEFINE FIELD inputProcessors ON mastra_agents TYPE option<string>;
DEFINE FIELD outputProcessors ON mastra_agents TYPE option<string>;
DEFINE FIELD memory ON mastra_agents TYPE option<string>;
DEFINE FIELD scorers ON mastra_agents TYPE option<string>;
DEFINE FIELD metadata ON mastra_agents TYPE option<object>;
DEFINE FIELD createdAt ON mastra_agents TYPE datetime DEFAULT time::now();
DEFINE FIELD updatedAt ON mastra_agents TYPE datetime DEFAULT time::now();

DEFINE INDEX idx_agents_id ON mastra_agents FIELDS id UNIQUE;
DEFINE INDEX idx_agents_name ON mastra_agents FIELDS name;
