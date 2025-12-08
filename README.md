# Mastra Agent Surreal Starter

Production-ready [Mastra](https://mastra.ai) agent starter with SurrealDB storage — document, vector, and graph capabilities in a single database.

## Features

- **SurrealDB Storage Adapter** — Full implementation for threads, messages, workflows, traces, evals, and resources
- **Vector Search Ready** — HNSW indexes for semantic memory (just uncomment in schema)
- **Docker Setup** — One command to start SurrealDB locally
- **Example Agent** — Working agent with tools and workflows
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
│   ├── storage/         # SurrealDB adapter
│   │   ├── surreal-store.ts   # Main adapter class
│   │   ├── schema.surql       # Database schema
│   │   └── config.ts          # Configuration
│   └── index.ts         # Mastra instance
├── scripts/
│   ├── setup-db.ts      # Apply schema to SurrealDB
│   ├── reset-db.sh      # Reset database
│   └── test-surreal.ts  # Test the adapter
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
import { SurrealDBStore } from './src/mastra/storage';

const store = new SurrealDBStore();
await store.init(true); // true = apply schema

// Create a thread
const thread = await store.createThread({
  id: 'thread-1',
  resourceId: 'user-123',
  title: 'My Conversation',
});

// Add messages
await store.addMessage({
  id: 'msg-1',
  threadId: 'thread-1',
  role: 'user',
  content: 'Hello!',
});

// Store working memory
await store.setResource({
  id: 'res-1',
  resourceId: 'user-123',
  key: 'preferences',
  value: { theme: 'dark' },
});

// Close when done
await store.close();
```

### Vector Search (Semantic Memory)

To enable vector search, uncomment the HNSW indexes in `schema.surql`:

```sql
DEFINE INDEX idx_messages_embedding ON mastra_messages
  FIELDS embedding HNSW DIMENSION 1536 DIST COSINE TYPE F32;
```

Then use the search methods:

```typescript
const similar = await store.searchMessagesByEmbedding(embedding, 10);
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

## License

MIT
