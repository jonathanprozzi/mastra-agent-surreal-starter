# Mastra Agent Surreal Starter

Production-ready [Mastra](https://mastra.ai) agent starter with SurrealDB storage — document, vector, and graph capabilities in a single database.

## Features

- **SurrealDB Storage Adapter** — `SurrealStore` extends `MastraStorage` for full Mastra compatibility
- **SurrealDB Vector Store** — `SurrealVector` extends `MastraVector` with native HNSW indexing
- **Agent Memory** — Persistent conversation threads and messages across sessions
- **Working Memory** — Resource storage for agent state
- **Workflow Persistence** — Snapshot and resume workflow executions
- **Semantic Search** — Vector similarity queries with metadata filtering
- **Docker Setup** — One command to start SurrealDB locally
- **Example Agent** — Working agent with tools, memory, and workflows
- **Bun Compatible** — Fast development with Bun runtime

## Quick Start

```bash
# 1. Clone and setup
git clone <repo-url> mastra-agent-surreal-starter
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
│   ├── agents/          # Agent definitions
│   ├── tools/           # Tool definitions
│   ├── workflows/       # Workflow definitions
│   ├── storage/         # SurrealDB adapters
│   │   ├── surreal-store.ts   # Storage adapter (MastraStorage)
│   │   ├── surreal-vector.ts  # Vector adapter (MastraVector)
│   │   ├── schema.surql       # Database schema
│   │   └── config.ts          # Configuration
│   └── index.ts         # Mastra instance
├── scripts/
│   ├── setup-db.ts      # Apply schema to SurrealDB
│   ├── reset-db.sh      # Reset database
│   ├── test-surreal.ts  # Test storage adapter
│   └── test-vector.ts   # Test vector adapter
├── docker-compose.yml   # SurrealDB container
└── .env.example         # Environment template
```

## SurrealDB Storage Adapter

The adapter implements storage for all Mastra data types:

| Table | Purpose |
|-------|---------|
| `mastra_threads` | Conversation threads |
| `mastra_messages` | Messages with optional embeddings |
| `mastra_workflow_snapshot` | Suspended workflow state |
| `mastra_traces` | OpenTelemetry data |
| `mastra_evals` | Evaluation results |
| `mastra_scorers` | Scoring data |
| `mastra_resources` | Working memory |

### Usage

```typescript
import { SurrealStore } from './src/mastra/storage';

const store = new SurrealStore();
await store.init();

// Save a thread (MastraStorage interface)
const thread = await store.saveThread({
  thread: {
    id: 'thread-1',
    resourceId: 'user-123',
    title: 'My Conversation',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});

// Save messages
await store.saveMessages({
  messages: [
    {
      id: 'msg-1',
      threadId: 'thread-1',
      role: 'user',
      content: 'Hello!',
      createdAt: new Date(),
      type: 'text',
    },
  ],
});

// Get messages from a thread
const messages = await store.getMessages({ threadId: 'thread-1' });

// Save resource (working memory)
await store.saveResource({
  resource: {
    id: 'user-123',
    workingMemory: JSON.stringify({ theme: 'dark' }),
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
import { SurrealVector } from './src/mastra/storage';

const vector = new SurrealVector();

// Create an index with HNSW
await vector.createIndex({
  indexName: 'embeddings',
  dimension: 1536, // OpenAI embedding dimension
  metric: 'cosine',
});

// Upsert vectors with metadata
await vector.upsert({
  indexName: 'embeddings',
  vectors: [embedding1, embedding2],
  metadata: [{ label: 'doc1' }, { label: 'doc2' }],
  ids: ['id1', 'id2'],
});

// Query similar vectors
const results = await vector.query({
  indexName: 'embeddings',
  queryVector: queryEmbedding,
  topK: 10,
  filter: { category: 'docs' }, // Optional metadata filter
});

// results: [{ id, score, metadata }]
```

Test the vector store:

```bash
bun run scripts/test-vector.ts
```

## Environment Variables

```bash
# SurrealDB Connection
SURREALDB_URL=ws://localhost:8000
SURREALDB_NS=mastra
SURREALDB_DB=development
SURREALDB_USER=root
SURREALDB_PASS=root

# Model Provider (pick one)
ANTHROPIC_API_KEY=sk-ant-...
# or
OPENAI_API_KEY=sk-...
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start Mastra Studio |
| `bun run build` | Build for production |
| `bun run db:setup` | Apply schema to SurrealDB |
| `bun run db:reset` | Reset database (removes all data) |

## Port Allocation

If running alongside other projects:

| Project | SurrealDB | Redis |
|---------|-----------|-------|
| mastra-agent-surreal-starter | `8000` | — |
| intuition-portal | — | `6378` |
| intuition-weave | `8001` | `6377` |

## Architecture

The `SurrealStore` class extends `MastraStorage` from `@mastra/core/storage`, providing a SurrealDB-backed implementation of all storage operations. This follows the same pattern as official Mastra stores:

- **PostgresStore** (`@mastra/pg`) - Uses domain classes (MemoryPG, WorkflowsPG, etc.)
- **LibSQLStore** (`@mastra/libsql`) - SQLite-compatible with WAL mode
- **MongoDBStore** (`@mastra/mongodb`) - Document-oriented NoSQL

### Future Improvements

Based on analysis of official Mastra stores, these enhancements would align with best practices:

1. **Domain Classes** - Refactor into separate domain classes:
   - `SurrealOperations` - Core table operations
   - `SurrealMemory` - Thread/message persistence
   - `SurrealWorkflows` - Workflow state management
   - `SurrealScores` - Evaluation scoring
   - `SurrealObservability` - Tracing and spans

2. **CI/CD Support** - Add `disableInit` flag (like LibSQLStore) for deployment pipelines

3. **Retry Mechanism** - Implement exponential backoff for connection issues

4. **Full Observability** - Implement span creation/update methods for tracing

5. **Agents Domain** - Add AgentsSurreal for agent-specific operations

6. **Contribute to Mastra** - Package as `@mastra/surrealdb` for the official stores collection

## License

MIT
