/**
 * Memory configuration for Mastra agents
 *
 * Uses SurrealDB for all memory capabilities:
 * - SurrealStore: Conversation threads, messages, working memory
 * - SurrealVector: Semantic recall via HNSW vector search
 *
 * This demonstrates SurrealDB's multi-model advantage: document + vector in one DB.
 */

import { anthropic } from '@ai-sdk/anthropic';
import { Memory } from '@mastra/memory';
import { SurrealStore, SurrealVector } from '../storage';

/**
 * SurrealDB store for agent memory (threads, messages, resources)
 * Connects using environment variables (SURREALDB_URL, etc.)
 */
export const surrealStore = new SurrealStore();

/**
 * SurrealDB vector store for semantic recall
 * Uses native HNSW indexing for similarity search
 */
export const surrealVector = new SurrealVector();

/**
 * Memory instance for agent conversations
 *
 * Features enabled:
 * - Conversation history (lastMessages)
 * - Semantic recall (vector search for relevant past messages)
 * - Working memory (persistent user context across conversations)
 * - Auto-generated thread titles
 */
export const memory = new Memory({
  storage: surrealStore,
  vector: surrealVector,
  embedder: 'openai/text-embedding-3-small', // 1536 dimensions
  options: {
    lastMessages: 20,

    // Semantic recall: find relevant past messages by meaning
    semanticRecall: {
      topK: 5, // Number of similar messages to retrieve
      messageRange: 2, // Include surrounding context
      resourceScope: true, // Search across ALL threads for this user
    },

    // Working memory: persistent user context
    workingMemory: {
      enabled: true,
      template: `# User Context
## Preferences
- Communication style:
- Topics of interest:

## Session Notes
- Current goal:
- Important context:`,
    },

    threads: {
      generateTitle: {
        model: anthropic('claude-haiku-4-5-20251001'),
        instructions:
          'Generate a concise 2-4 word title that captures the main topic. Use title case. No punctuation.',
      },
    },
  },
});
