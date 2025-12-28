/**
 * SurrealVector Test Suite
 *
 * Comprehensive tests for the SurrealDB vector store adapter.
 * Tests all MastraVector interface methods.
 *
 * Prerequisites:
 * - SurrealDB running: docker-compose up -d
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { SurrealVector } from '../src/mastra/vector';

describe('SurrealVector', () => {
  let vector: SurrealVector;
  const testIndexName = 'test_vectors';
  const testDimension = 128; // Smaller dimension for faster tests

  // Helper to generate random vectors
  const randomVector = (dim: number): number[] =>
    Array.from({ length: dim }, () => Math.random());

  // Helper to generate a normalized vector (for cosine similarity)
  const normalizedVector = (dim: number): number[] => {
    const vec = randomVector(dim);
    const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return vec.map(v => v / magnitude);
  };

  beforeAll(async () => {
    vector = new SurrealVector({
      database: 'test',
    });
  });

  afterAll(async () => {
    await vector.close();
  });

  describe('Connection', () => {
    it('should connect to SurrealDB successfully', async () => {
      const testVector = new SurrealVector({ database: 'test' });
      // createIndex will trigger init()
      await expect(
        testVector.createIndex({
          indexName: 'connection_test',
          dimension: 8,
          metric: 'cosine',
        })
      ).resolves.not.toThrow();
      await testVector.deleteIndex({ indexName: 'connection_test' });
      await testVector.close();
    });
  });

  describe('Index Management', () => {
    afterEach(async () => {
      try {
        await vector.deleteIndex({ indexName: testIndexName });
      } catch {
        // Ignore if doesn't exist
      }
    });

    it('should create an index with cosine metric', async () => {
      await expect(
        vector.createIndex({
          indexName: testIndexName,
          dimension: testDimension,
          metric: 'cosine',
        })
      ).resolves.not.toThrow();
    });

    it('should create an index with euclidean metric', async () => {
      await expect(
        vector.createIndex({
          indexName: 'euclidean_test',
          dimension: testDimension,
          metric: 'euclidean',
        })
      ).resolves.not.toThrow();
      await vector.deleteIndex({ indexName: 'euclidean_test' });
    });

    it('should be idempotent (create same index twice)', async () => {
      await vector.createIndex({
        indexName: testIndexName,
        dimension: testDimension,
        metric: 'cosine',
      });

      // Second create should not throw
      await expect(
        vector.createIndex({
          indexName: testIndexName,
          dimension: testDimension,
          metric: 'cosine',
        })
      ).resolves.not.toThrow();
    });

    it('should list indexes', async () => {
      await vector.createIndex({
        indexName: testIndexName,
        dimension: testDimension,
        metric: 'cosine',
      });

      const indexes = await vector.listIndexes();

      expect(indexes).toBeInstanceOf(Array);
      expect(indexes).toContain(testIndexName);
    });

    it('should describe an index', async () => {
      await vector.createIndex({
        indexName: testIndexName,
        dimension: testDimension,
        metric: 'cosine',
      });

      const stats = await vector.describeIndex({ indexName: testIndexName });

      expect(stats).toBeDefined();
      expect(stats.dimension).toBe(testDimension);
      expect(stats.count).toBe(0);
      expect(stats.metric).toBe('cosine');
    });

    it('should delete an index', async () => {
      await vector.createIndex({
        indexName: testIndexName,
        dimension: testDimension,
        metric: 'cosine',
      });

      await vector.deleteIndex({ indexName: testIndexName });

      const indexes = await vector.listIndexes();
      expect(indexes).not.toContain(testIndexName);
    });
  });

  describe('Vector Operations', () => {
    beforeEach(async () => {
      await vector.createIndex({
        indexName: testIndexName,
        dimension: testDimension,
        metric: 'cosine',
      });
    });

    afterEach(async () => {
      try {
        await vector.deleteIndex({ indexName: testIndexName });
      } catch {
        // Ignore
      }
    });

    it('should upsert vectors with IDs', async () => {
      const vectors = [normalizedVector(testDimension), normalizedVector(testDimension)];
      const ids = ['vec-1', 'vec-2'];

      const insertedIds = await vector.upsert({
        indexName: testIndexName,
        vectors,
        ids,
        metadata: [{ label: 'first' }, { label: 'second' }],
      });

      expect(insertedIds).toEqual(ids);
    });

    it('should upsert vectors without IDs (auto-generate)', async () => {
      const vectors = [normalizedVector(testDimension)];

      const insertedIds = await vector.upsert({
        indexName: testIndexName,
        vectors,
      });

      expect(insertedIds.length).toBe(1);
      expect(insertedIds[0]).toBeDefined();
    });

    it('should upsert (update) existing vectors', async () => {
      const vec1 = normalizedVector(testDimension);
      const vec2 = normalizedVector(testDimension);

      // First insert
      await vector.upsert({
        indexName: testIndexName,
        vectors: [vec1],
        ids: ['update-test'],
        metadata: [{ version: 1 }],
      });

      // Update with same ID
      await vector.upsert({
        indexName: testIndexName,
        vectors: [vec2],
        ids: ['update-test'],
        metadata: [{ version: 2 }],
      });

      // Should still only have 1 vector
      const stats = await vector.describeIndex({ indexName: testIndexName });
      expect(stats.count).toBe(1);
    });

    it('should query similar vectors using HNSW', async () => {
      const baseVector = normalizedVector(testDimension);
      const similarVector = baseVector.map(v => v + (Math.random() - 0.5) * 0.1);
      const dissimilarVector = normalizedVector(testDimension);

      await vector.upsert({
        indexName: testIndexName,
        vectors: [baseVector, similarVector, dissimilarVector],
        ids: ['base', 'similar', 'dissimilar'],
        metadata: [{ type: 'base' }, { type: 'similar' }, { type: 'dissimilar' }],
      });

      const results = await vector.query({
        indexName: testIndexName,
        queryVector: baseVector,
        topK: 3,
      });

      expect(results.length).toBe(3);
      // First result should be the base vector itself (highest similarity)
      expect(results[0].id).toBe('base');
      expect(results[0].score).toBeGreaterThan(0.9); // Should be very high similarity
    });

    it('should query with metadata filter (brute force fallback)', async () => {
      await vector.upsert({
        indexName: testIndexName,
        vectors: [
          normalizedVector(testDimension),
          normalizedVector(testDimension),
          normalizedVector(testDimension),
        ],
        ids: ['cat-a-1', 'cat-a-2', 'cat-b-1'],
        metadata: [
          { category: 'A' },
          { category: 'A' },
          { category: 'B' },
        ],
      });

      const results = await vector.query({
        indexName: testIndexName,
        queryVector: normalizedVector(testDimension),
        topK: 10,
        filter: { category: 'A' },
      });

      expect(results.length).toBe(2);
      expect(results.every(r => r.metadata?.category === 'A')).toBe(true);
    });

    it('should include vector in results when requested', async () => {
      const testVec = normalizedVector(testDimension);

      await vector.upsert({
        indexName: testIndexName,
        vectors: [testVec],
        ids: ['include-vec-test'],
      });

      const results = await vector.query({
        indexName: testIndexName,
        queryVector: testVec,
        topK: 1,
        includeVector: true,
      });

      expect(results[0].vector).toBeDefined();
      expect(results[0].vector?.length).toBe(testDimension);
    });

    it('should not include vector by default', async () => {
      await vector.upsert({
        indexName: testIndexName,
        vectors: [normalizedVector(testDimension)],
        ids: ['no-vec-test'],
      });

      const results = await vector.query({
        indexName: testIndexName,
        queryVector: normalizedVector(testDimension),
        topK: 1,
      });

      expect(results[0].vector).toBeUndefined();
    });

    it('should update vector metadata', async () => {
      const testVec = normalizedVector(testDimension);

      await vector.upsert({
        indexName: testIndexName,
        vectors: [testVec],
        ids: ['metadata-update'],
        metadata: [{ original: true, label: 'test' }],
      });

      await vector.updateVector({
        indexName: testIndexName,
        id: 'metadata-update',
        update: {
          metadata: { updated: true, label: 'updated' },
        },
      });

      // Query using the same vector to get high similarity match
      const results = await vector.query({
        indexName: testIndexName,
        queryVector: testVec,
        topK: 1,
      });

      // Verify the record exists and was updated
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('metadata-update');
      expect(results[0].metadata?.updated).toBe(true);
      expect(results[0].metadata?.label).toBe('updated');
    });

    it('should delete a single vector', async () => {
      await vector.upsert({
        indexName: testIndexName,
        vectors: [normalizedVector(testDimension), normalizedVector(testDimension)],
        ids: ['keep', 'delete-me'],
      });

      await vector.deleteVector({
        indexName: testIndexName,
        id: 'delete-me',
      });

      const stats = await vector.describeIndex({ indexName: testIndexName });
      expect(stats.count).toBe(1);
    });

    it('should delete multiple vectors by IDs', async () => {
      await vector.upsert({
        indexName: testIndexName,
        vectors: [
          normalizedVector(testDimension),
          normalizedVector(testDimension),
          normalizedVector(testDimension),
        ],
        ids: ['bulk-1', 'bulk-2', 'bulk-3'],
      });

      await vector.deleteVectors({
        indexName: testIndexName,
        ids: ['bulk-1', 'bulk-2'],
      });

      const stats = await vector.describeIndex({ indexName: testIndexName });
      expect(stats.count).toBe(1);
    });

    it('should delete vectors by filter', async () => {
      await vector.upsert({
        indexName: testIndexName,
        vectors: [
          normalizedVector(testDimension),
          normalizedVector(testDimension),
          normalizedVector(testDimension),
        ],
        ids: ['filter-del-1', 'filter-del-2', 'filter-keep'],
        metadata: [
          { deleteMe: true },
          { deleteMe: true },
          { deleteMe: false },
        ],
      });

      await vector.deleteVectors({
        indexName: testIndexName,
        filter: { deleteMe: true },
      });

      const stats = await vector.describeIndex({ indexName: testIndexName });
      expect(stats.count).toBe(1);
    });

    it('should truncate an index', async () => {
      await vector.upsert({
        indexName: testIndexName,
        vectors: [
          normalizedVector(testDimension),
          normalizedVector(testDimension),
        ],
        ids: ['trunc-1', 'trunc-2'],
      });

      await vector.truncateIndex(testIndexName);

      const stats = await vector.describeIndex({ indexName: testIndexName });
      expect(stats.count).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await vector.createIndex({
        indexName: testIndexName,
        dimension: testDimension,
        metric: 'cosine',
      });
    });

    afterEach(async () => {
      try {
        await vector.deleteIndex({ indexName: testIndexName });
      } catch {
        // Ignore
      }
    });

    it('should handle empty query results', async () => {
      const results = await vector.query({
        indexName: testIndexName,
        queryVector: normalizedVector(testDimension),
        topK: 10,
      });

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(0);
    });

    it('should handle topK larger than result count', async () => {
      await vector.upsert({
        indexName: testIndexName,
        vectors: [normalizedVector(testDimension)],
        ids: ['only-one'],
      });

      const results = await vector.query({
        indexName: testIndexName,
        queryVector: normalizedVector(testDimension),
        topK: 100,
      });

      expect(results.length).toBe(1);
    });

    it('should handle filter with no matches', async () => {
      await vector.upsert({
        indexName: testIndexName,
        vectors: [normalizedVector(testDimension)],
        ids: ['filter-no-match'],
        metadata: [{ category: 'existing' }],
      });

      const results = await vector.query({
        indexName: testIndexName,
        queryVector: normalizedVector(testDimension),
        topK: 10,
        filter: { category: 'nonexistent' },
      });

      expect(results.length).toBe(0);
    });

    it('should handle array values in filter (IN clause)', async () => {
      await vector.upsert({
        indexName: testIndexName,
        vectors: [
          normalizedVector(testDimension),
          normalizedVector(testDimension),
          normalizedVector(testDimension),
        ],
        ids: ['in-1', 'in-2', 'in-3'],
        metadata: [
          { color: 'red' },
          { color: 'blue' },
          { color: 'green' },
        ],
      });

      const results = await vector.query({
        indexName: testIndexName,
        queryVector: normalizedVector(testDimension),
        topK: 10,
        filter: { color: ['red', 'blue'] },
      });

      expect(results.length).toBe(2);
      expect(results.every(r => ['red', 'blue'].includes(r.metadata?.color))).toBe(true);
    });

    it('should handle numeric filter values', async () => {
      await vector.upsert({
        indexName: testIndexName,
        vectors: [
          normalizedVector(testDimension),
          normalizedVector(testDimension),
        ],
        ids: ['num-1', 'num-2'],
        metadata: [{ priority: 1 }, { priority: 2 }],
      });

      const results = await vector.query({
        indexName: testIndexName,
        queryVector: normalizedVector(testDimension),
        topK: 10,
        filter: { priority: 1 },
      });

      expect(results.length).toBe(1);
      expect(results[0].metadata?.priority).toBe(1);
    });

    it('should handle boolean filter values', async () => {
      await vector.upsert({
        indexName: testIndexName,
        vectors: [
          normalizedVector(testDimension),
          normalizedVector(testDimension),
        ],
        ids: ['bool-1', 'bool-2'],
        metadata: [{ active: true }, { active: false }],
      });

      const results = await vector.query({
        indexName: testIndexName,
        queryVector: normalizedVector(testDimension),
        topK: 10,
        filter: { active: true },
      });

      expect(results.length).toBe(1);
      expect(results[0].metadata?.active).toBe(true);
    });
  });

  describe('Performance Characteristics', () => {
    const perfIndexName = 'perf_test';
    const perfDimension = 384; // More realistic dimension

    beforeAll(async () => {
      await vector.createIndex({
        indexName: perfIndexName,
        dimension: perfDimension,
        metric: 'cosine',
      });

      // Insert a batch of vectors for performance testing
      const batchSize = 100;
      const vectors = Array.from({ length: batchSize }, () =>
        normalizedVector(perfDimension)
      );
      const ids = Array.from({ length: batchSize }, (_, i) => `perf-${i}`);
      const metadata = Array.from({ length: batchSize }, (_, i) => ({
        batch: Math.floor(i / 10),
        index: i,
      }));

      await vector.upsert({
        indexName: perfIndexName,
        vectors,
        ids,
        metadata,
      });
    });

    afterAll(async () => {
      try {
        await vector.deleteIndex({ indexName: perfIndexName });
      } catch {
        // Ignore
      }
    });

    it('should query 100 vectors efficiently with HNSW', async () => {
      const start = performance.now();

      const results = await vector.query({
        indexName: perfIndexName,
        queryVector: normalizedVector(perfDimension),
        topK: 10,
      });

      const duration = performance.now() - start;

      expect(results.length).toBe(10);
      expect(duration).toBeLessThan(5000); // Should complete in under 5s
      console.log(`   HNSW query time: ${duration.toFixed(2)}ms`);
    });

    it('should query with filter efficiently (brute force)', async () => {
      const start = performance.now();

      const results = await vector.query({
        indexName: perfIndexName,
        queryVector: normalizedVector(perfDimension),
        topK: 10,
        filter: { batch: 5 },
      });

      const duration = performance.now() - start;

      expect(results.length).toBeLessThanOrEqual(10);
      expect(duration).toBeLessThan(5000); // Should complete in under 5s
      console.log(`   Filtered query time: ${duration.toFixed(2)}ms`);
    });
  });
});
