/**
 * Memory configuration for Mastra agents
 *
 * Uses SurrealDB for conversation memory via the SurrealStore adapter.
 * SurrealDB provides document, vector, and graph capabilities in a single database.
 */

import { anthropic } from '@ai-sdk/anthropic';
import { Memory } from '@mastra/memory';
import { SurrealStore } from '../storage';

/**
 * SurrealDB store for agent memory
 * Connects using environment variables (SURREALDB_URL, etc.)
 */
export const surrealStore = new SurrealStore();

/**
 * Memory instance for agent conversations
 *
 * Configuration:
 * - lastMessages: Number of recent messages to include in context
 * - threads.generateTitle: Auto-generate thread titles using a model
 */
export const memory = new Memory({
  storage: surrealStore,
  options: {
    lastMessages: 20,
    threads: {
      generateTitle: {
        model: anthropic('claude-haiku-4-20250514'),
        instructions:
          'Generate a concise 2-4 word title that captures the main topic. Use title case. No punctuation.',
      },
    },
  },
});
