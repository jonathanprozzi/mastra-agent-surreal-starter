-- Mastra SurrealDB Schema
-- Compatible with MastraStorage interface (7 tables)

-- ============================================
-- 1. THREADS (conversation threads)
-- ============================================
DEFINE TABLE mastra_threads SCHEMAFULL;
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
DEFINE TABLE mastra_messages SCHEMAFULL;
DEFINE FIELD id ON mastra_messages TYPE string;
DEFINE FIELD threadId ON mastra_messages TYPE string;
DEFINE FIELD role ON mastra_messages TYPE string ASSERT $value IN ['user', 'assistant', 'system', 'tool'];
DEFINE FIELD content ON mastra_messages TYPE any; -- string or array for v2 format
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
DEFINE TABLE mastra_workflow_snapshot SCHEMAFULL;
DEFINE FIELD id ON mastra_workflow_snapshot TYPE string;
DEFINE FIELD workflowId ON mastra_workflow_snapshot TYPE string;
DEFINE FIELD runId ON mastra_workflow_snapshot TYPE string;
DEFINE FIELD snapshot ON mastra_workflow_snapshot TYPE object;
DEFINE FIELD createdAt ON mastra_workflow_snapshot TYPE datetime DEFAULT time::now();
DEFINE FIELD updatedAt ON mastra_workflow_snapshot TYPE datetime DEFAULT time::now();

DEFINE INDEX idx_workflow_snapshot_id ON mastra_workflow_snapshot FIELDS id UNIQUE;
DEFINE INDEX idx_workflow_snapshot_run ON mastra_workflow_snapshot FIELDS workflowId, runId;

-- ============================================
-- 4. TRACES (OpenTelemetry data)
-- ============================================
DEFINE TABLE mastra_traces SCHEMAFULL;
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
DEFINE TABLE mastra_evals SCHEMAFULL;
DEFINE FIELD id ON mastra_evals TYPE string;
DEFINE FIELD name ON mastra_evals TYPE string;
DEFINE FIELD input ON mastra_evals TYPE any;
DEFINE FIELD output ON mastra_evals TYPE any;
DEFINE FIELD expected ON mastra_evals TYPE option<any>;
DEFINE FIELD score ON mastra_evals TYPE option<float>;
DEFINE FIELD metadata ON mastra_evals TYPE option<object>;
DEFINE FIELD createdAt ON mastra_evals TYPE datetime DEFAULT time::now();

DEFINE INDEX idx_evals_id ON mastra_evals FIELDS id UNIQUE;
DEFINE INDEX idx_evals_name ON mastra_evals FIELDS name;

-- ============================================
-- 6. SCORERS (scoring data)
-- ============================================
DEFINE TABLE mastra_scorers SCHEMAFULL;
DEFINE FIELD id ON mastra_scorers TYPE string;
DEFINE FIELD name ON mastra_scorers TYPE string;
DEFINE FIELD score ON mastra_scorers TYPE float;
DEFINE FIELD reasoning ON mastra_scorers TYPE option<string>;
DEFINE FIELD metadata ON mastra_scorers TYPE option<object>;
DEFINE FIELD createdAt ON mastra_scorers TYPE datetime DEFAULT time::now();

DEFINE INDEX idx_scorers_id ON mastra_scorers FIELDS id UNIQUE;
DEFINE INDEX idx_scorers_name ON mastra_scorers FIELDS name;

-- ============================================
-- 7. RESOURCES (working memory / resource-scoped)
-- ============================================
DEFINE TABLE mastra_resources SCHEMAFULL;
DEFINE FIELD id ON mastra_resources TYPE string;
DEFINE FIELD resourceId ON mastra_resources TYPE string;
DEFINE FIELD key ON mastra_resources TYPE string;
DEFINE FIELD value ON mastra_resources TYPE any;
DEFINE FIELD metadata ON mastra_resources TYPE option<object>;
DEFINE FIELD createdAt ON mastra_resources TYPE datetime DEFAULT time::now();
DEFINE FIELD updatedAt ON mastra_resources TYPE datetime DEFAULT time::now();
-- Vector embedding for semantic memory
DEFINE FIELD embedding ON mastra_resources TYPE option<array<float>>;

DEFINE INDEX idx_resources_id ON mastra_resources FIELDS id UNIQUE;
DEFINE INDEX idx_resources_resource_key ON mastra_resources FIELDS resourceId, key UNIQUE;
-- HNSW index for semantic search
-- DEFINE INDEX idx_resources_embedding ON mastra_resources FIELDS embedding HNSW DIMENSION 1536 DIST COSINE TYPE F32;
