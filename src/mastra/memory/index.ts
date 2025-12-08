/**
 * Memory configuration for Mastra agents
 *
 * Uses LibSQL for conversation memory (proven, simple)
 * SurrealDB available via surrealStore for custom state/graph operations
 */

import { anthropic } from '@ai-sdk/anthropic';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';

/**
 * LibSQL store for agent memory
 * Path is relative to .mastra/output directory when running
 */
export const libsqlStore = new LibSQLStore({
  url: 'file:../mastra.db',
});

/**
 * Memory instance for agent conversations
 *
 * Configuration:
 * - lastMessages: Number of recent messages to include in context
 * - threads.generateTitle: Auto-generate thread titles using a model
 */
export const memory = new Memory({
  storage: libsqlStore,
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
