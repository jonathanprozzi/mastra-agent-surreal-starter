import { z } from 'zod';

/**
 * SurrealDB Configuration Schema
 */
export const SurrealDBConfigSchema = z.object({
  // Connection
  url: z.string().url().default('ws://localhost:8000'),
  namespace: z.string().default('mastra'),
  database: z.string().default('development'),

  // Auth
  username: z.string().optional(),
  password: z.string().optional(),
  token: z.string().optional(),

  // Vector config (optional)
  vector: z
    .object({
      dimension: z.number().default(1536), // OpenAI text-embedding-3-large
      distanceMetric: z.enum(['COSINE', 'EUCLIDEAN', 'MANHATTAN']).default('COSINE'),
      indexType: z.enum(['HNSW', 'MTREE']).default('HNSW'),
    })
    .optional(),
});

export type SurrealDBConfig = z.infer<typeof SurrealDBConfigSchema>;

/**
 * Load config from environment variables
 */
export function loadConfigFromEnv(): SurrealDBConfig {
  return SurrealDBConfigSchema.parse({
    url: process.env.SURREALDB_URL,
    namespace: process.env.SURREALDB_NS,
    database: process.env.SURREALDB_DB,
    username: process.env.SURREALDB_USER,
    password: process.env.SURREALDB_PASS,
    token: process.env.SURREALDB_TOKEN,
    vector: process.env.VECTOR_DIMENSION
      ? {
          dimension: parseInt(process.env.VECTOR_DIMENSION, 10),
          distanceMetric: process.env.VECTOR_DISTANCE as 'COSINE' | 'EUCLIDEAN' | 'MANHATTAN',
          indexType: process.env.VECTOR_INDEX as 'HNSW' | 'MTREE',
        }
      : undefined,
  });
}
