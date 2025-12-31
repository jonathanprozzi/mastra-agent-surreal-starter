# Mastra Agent SurrealDB Starter

[![Node.js](https://img.shields.io/badge/Node.js->=20.9.0-green.svg)](https://nodejs.org/)
[![SurrealDB](https://img.shields.io/badge/SurrealDB-v2.2-purple.svg)](https://surrealdb.com/)

> **Community Project** - Built in collaboration with Claude Opus 4.5 to rapidly prototype [Mastra](https://mastra.ai) with SurrealDB, following established Mastra store patterns.

This is a lightweight Mastra agent starter with SurrealDB as the agent's store that we used in a handful of other projects while testing. SurrealDB is a multi-model database with lots of powerful features for agents.

## Features

- **SurrealDB Storage Adapter** — `SurrealStore` extends `MastraStorage` with domain classes (matches official Mastra store patterns)
- **SurrealDB Vector Store** — `SurrealVector` extends `MastraVector` with native HNSW indexing
- **Cross-Thread Semantic Recall** — Agent recalls information across different conversation threads via `scope: 'resource'`
- **Working Memory** — Persistent user context and preferences across sessions
- **Workflow Persistence** — Snapshot and resume workflow executions
- **Vector Similarity Search** — HNSW-powered semantic search with metadata filtering
- **Docker Setup** — One command to start SurrealDB locally
- **Example Agent** — Working agent with tools, memory, and semantic recall
- **Bun Compatible** — Fast development with Bun runtime

## Quick Start

```bash
# 1. Clone and setup
git clone https://github.com/jonathanprozzi/mastra-agent-surreal-starter.git
cd mastra-agent-surreal-starter
cp .env.example .env
# Add your ANTHROPIC_API_KEY or OPENAI_API_KEY to .env

# 2. Install dependencies
bun install

# 3. Start SurrealDB
docker-compose up -d

# 4. Apply database schema
bun run db:setup

# 5. Test the SurrealDB adapter
bun run scripts/test-surreal.ts

# 6. Run Mastra Studio
bun run dev
# Open http://localhost:4111
```

## Project Structure

```
├── src/mastra/
│   ├── agents/              # Agent definitions
│   ├── tools/               # Tool definitions
│   ├── workflows/           # Workflow definitions
│   ├── memory/              # Memory configuration (semantic recall, working memory)
│   ├── storage/             # SurrealDB adapters
│   │   ├── surreal-store.ts # Storage adapter facade
│   │   ├── domains/         # Domain classes (matches official Mastra patterns)
│   │   │   ├── memory.ts    # Thread/message persistence
│   │   │   ├── workflows.ts # Workflow state management
│   │   │   ├── scores.ts    # Evaluation scoring
│   │   │   └── observability.ts # Tracing and spans
│   │   ├── shared/          # Shared utilities and config
│   │   └── schema.surql     # Database schema
│   ├── vector/              # Vector store
│   │   └── surreal-vector.ts # HNSW vector adapter
│   └── index.ts             # Mastra instance
├── scripts/
│   ├── setup-db.ts          # Apply schema to SurrealDB
│   ├── reset-db.sh          # Reset database
│   ├── test-surreal.ts      # Test storage adapter
│   └── test-vector.ts       # Test vector adapter
├── examples/
│   ├── test-cross-thread-recall.ts  # Cross-thread semantic recall demo
│   └── test-semantic-recall.ts      # Full semantic recall example
├── docker-compose.yml       # SurrealDB container
└── .env.example             # Environment template
```

## SurrealDB Storage Adapter

The adapter implements storage for all Mastra data types (9 tables):

| Table                      | Purpose                           |
| -------------------------- | --------------------------------- |
| `mastra_threads`           | Conversation threads              |
| `mastra_messages`          | Messages with optional embeddings |
| `mastra_workflow_snapshot` | Suspended workflow state          |
| `mastra_traces`            | OpenTelemetry data                |
| `mastra_evals`             | Evaluation results                |
| `mastra_scorers`           | Scorer definitions                |
| `mastra_scores`            | Scoring run data                  |
| `mastra_resources`         | Working memory                    |
| `mastra_agents`            | Agent configurations              |

### Usage

```typescript
import { SurrealStore } from "./src/mastra/storage";

const store = new SurrealStore();
await store.init();

// Save a thread (MastraStorage interface)
const thread = await store.saveThread({
  thread: {
    id: "thread-1",
    resourceId: "user-123",
    title: "My Conversation",
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});

// Save messages
await store.saveMessages({
  messages: [
    {
      id: "msg-1",
      threadId: "thread-1",
      role: "user",
      content: "Hello!",
      createdAt: new Date(),
      type: "text",
    },
  ],
});

// Get messages from a thread
const messages = await store.getMessages({ threadId: "thread-1" });

// Save resource (working memory)
await store.saveResource({
  resource: {
    id: "user-123",
    workingMemory: JSON.stringify({ theme: "dark" }),
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});

// Close when done
await store.close();
```

### Vector Search (SurrealVector)

The `SurrealVector` class implements `MastraVector` for native HNSW vector search:

```typescript
import { SurrealVector } from "./src/mastra/storage";

const vector = new SurrealVector();

// Create an index with HNSW
await vector.createIndex({
  indexName: "embeddings",
  dimension: 1536, // OpenAI embedding dimension
  metric: "cosine",
});

// Upsert vectors with metadata
await vector.upsert({
  indexName: "embeddings",
  vectors: [embedding1, embedding2],
  metadata: [{ label: "doc1" }, { label: "doc2" }],
  ids: ["id1", "id2"],
});

// Query similar vectors
const results = await vector.query({
  indexName: "embeddings",
  queryVector: queryEmbedding,
  topK: 10,
  filter: { category: "docs" }, // Optional metadata filter
});

// results: [{ id, score, metadata }]
```

Test the vector store:

```bash
bun run scripts/test-vector.ts
```

## Examples

### Cross-Thread Semantic Recall (The "Lasagna Test")

Demonstrates that the agent can recall information from a different conversation thread:

```bash
bun run examples/test-cross-thread-recall.ts
```

This test:

1. Creates Thread 1 with a cooking conversation (lasagna recipe)
2. Creates Thread 2 and asks about cooking
3. Verifies the agent recalls lasagna from Thread 1 while in Thread 2

This works because memory is configured with `scope: 'resource'` — the agent searches across all threads for a given user, not just the current thread.

### Full Semantic Recall Demo

A comprehensive test covering multiple topics and cross-domain recall:

```bash
bun run examples/test-semantic-recall.ts
```

This test:

1. Creates threads with programming topics (TypeScript, React)
2. Creates threads with cooking topics (pasta carbonara, soufflé)
3. Tests same-thread recall and cross-thread recall
4. Verifies vector index statistics

## Environment Variables

```bash
# SurrealDB Connection
SURREALDB_URL=ws://localhost:8000
SURREALDB_NS=mastra
SURREALDB_DB=development
SURREALDB_USER=root
SURREALDB_PASS=root

# LLM Provider (for agent reasoning)
ANTHROPIC_API_KEY=sk-ant-...    # Recommended for Claude
# or
OPENAI_API_KEY=sk-...           # Also works for GPT models

# Embeddings (required for semantic recall)
OPENAI_API_KEY=sk-...           # Required - OpenAI embeddings for vector search
```

**Note:** Semantic recall requires OpenAI API key for embeddings (Claude doesn't have an embedding model). You can use Claude for reasoning and OpenAI for embeddings — this is a common pattern.

## Scripts

| Command            | Description                       |
| ------------------ | --------------------------------- |
| `bun run dev`      | Start Mastra Studio               |
| `bun run build`    | Build for production              |
| `bun run db:setup` | Apply schema to SurrealDB         |
| `bun run db:reset` | Reset database (removes all data) |

### Testing

| Command                 | Description                    |
| ----------------------- | ------------------------------ |
| `bun run test`          | Run all vitest tests           |
| `bun run test:watch`    | Run tests in watch mode        |
| `bun run test:coverage` | Run tests with coverage report |
| `bun run test:storage`  | Run only storage adapter tests |
| `bun run test:vector`   | Run only vector store tests    |
| `bun run test:quick`    | Run quick validation scripts   |

The test suite includes:

- **Storage tests** (`tests/storage.test.ts`) - Thread, message, resource, workflow operations
- **Vector tests** (`tests/vector.test.ts`) - Index management, HNSW queries, metadata filtering
- **Integration tests** (`tests/integration.test.ts`) - Cross-thread recall, concurrent operations

## Port Allocation

If running alongside other projects:

| Project                      | SurrealDB | Redis  |
| ---------------------------- | --------- | ------ |
| mastra-agent-surreal-starter | `8000`    | —      |
| my-other-project             | —         | `6378` |

## Architecture

The `SurrealStore` class extends `MastraStorage` from `@mastra/core/storage`, providing a SurrealDB-backed implementation of all storage operations. This follows the same pattern as official Mastra stores:

- **PostgresStore** (`@mastra/pg`) - Uses domain classes (MemoryPG, WorkflowsPG, etc.)
- **LibSQLStore** (`@mastra/libsql`) - SQLite-compatible with WAL mode
- **MongoDBStore** (`@mastra/mongodb`) - Document-oriented NoSQL

### Domain Classes (Implemented)

Following the official Mastra store patterns, storage is organized into domain classes:

| Domain Class           | Responsibility                                            |
| ---------------------- | --------------------------------------------------------- |
| `MemorySurreal`        | Thread/message CRUD, context retrieval with vector search |
| `WorkflowsSurreal`     | Workflow snapshot persistence and resume                  |
| `ScoresSurreal`        | Evaluation and scoring data                               |
| `ObservabilitySurreal` | Tracing and span management                               |
| `AgentsSurreal`        | Agent configuration persistence                           |
| `OperationsSurreal`    | Core table operations (insert, update, delete)            |

The `SurrealStore` facade composes these 6 domain classes and delegates operations accordingly.

### Key Implementation Details

- **Record ID Handling**: SurrealDB returns IDs like `table:⟨uuid⟩`. We use `type::thing()` in queries and `normalizeId()` helper to handle this.
- **HNSW Vector Search**: Uses `<|topK,effort|>` syntax for O(log n) performance. The effort parameter (e.g., 500) is required.
- **Semantic Recall**: Memory configured with `scope: 'resource'` enables cross-thread knowledge retrieval.

### Future Improvements

1. **Retry Mechanism** - Implement exponential backoff for connection issues
2. **Graph Relationships** - Leverage SurrealDB's graph capabilities for agent relationships

## Contributing

Feedback welcome!

## License

Apache 2.0 — aligned with [Mastra's licensing](https://github.com/mastra-ai/mastra/blob/main/LICENSE.md).
