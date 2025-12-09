/**
 * Test script for SurrealVector
 *
 * Run: bun run scripts/test-vector.ts
 *
 * Prerequisites:
 * - SurrealDB running via docker-compose up -d
 * - .env file configured
 */

import { SurrealVector } from '../src/mastra/storage/surreal-vector';

async function main() {
  console.log('🧪 Testing SurrealVector...\n');

  const vector = new SurrealVector();

  try {
    // Test 1: Create index
    console.log('1️⃣ Creating test index...');
    await vector.createIndex({
      indexName: 'test_embeddings',
      dimension: 384, // Small dimension for testing
      metric: 'cosine',
    });
    console.log('   ✅ Index created\n');

    // Test 2: List indexes
    console.log('2️⃣ Listing indexes...');
    const indexes = await vector.listIndexes();
    console.log('   Indexes:', indexes);
    console.log('   ✅ Found', indexes.length, 'index(es)\n');

    // Test 3: Upsert vectors
    console.log('3️⃣ Upserting vectors...');
    const testVectors = [
      Array(384).fill(0).map(() => Math.random()),
      Array(384).fill(0).map(() => Math.random()),
      Array(384).fill(0).map(() => Math.random()),
    ];
    const ids = await vector.upsert({
      indexName: 'test_embeddings',
      vectors: testVectors,
      metadata: [
        { label: 'vector1', category: 'test' },
        { label: 'vector2', category: 'test' },
        { label: 'vector3', category: 'production' },
      ],
      ids: ['v1', 'v2', 'v3'],
    });
    console.log('   Inserted IDs:', ids);
    console.log('   ✅ Upserted', ids.length, 'vectors\n');

    // Test 4: Describe index
    console.log('4️⃣ Describing index...');
    const stats = await vector.describeIndex({ indexName: 'test_embeddings' });
    console.log('   Stats:', stats);
    console.log('   ✅ Index has', stats.count, 'vectors\n');

    // Test 5: Query vectors
    console.log('5️⃣ Querying similar vectors...');
    const queryVector = testVectors[0]; // Query with first vector (should return itself as top result)
    const results = await vector.query({
      indexName: 'test_embeddings',
      queryVector,
      topK: 3,
      includeVector: false,
    });
    console.log('   Results:', results.map(r => ({ id: r.id, score: r.score.toFixed(4), metadata: r.metadata })));
    console.log('   ✅ Found', results.length, 'similar vectors\n');

    // Test 6: Query with filter
    console.log('6️⃣ Querying with metadata filter...');
    const filteredResults = await vector.query({
      indexName: 'test_embeddings',
      queryVector,
      topK: 3,
      filter: { category: 'test' },
    });
    console.log('   Filtered results:', filteredResults.map(r => ({ id: r.id, metadata: r.metadata })));
    console.log('   ✅ Found', filteredResults.length, 'filtered vectors\n');

    // Test 7: Update vector
    console.log('7️⃣ Updating vector metadata...');
    await vector.updateVector({
      indexName: 'test_embeddings',
      id: 'v1',
      update: { metadata: { label: 'updated_vector1', category: 'test', updated: true } },
    });
    console.log('   ✅ Vector updated\n');

    // Test 8: Delete vector
    console.log('8️⃣ Deleting single vector...');
    await vector.deleteVector({ indexName: 'test_embeddings', id: 'v3' });
    const afterDelete = await vector.describeIndex({ indexName: 'test_embeddings' });
    console.log('   ✅ Deleted, now', afterDelete.count, 'vectors remain\n');

    // Test 9: Delete multiple vectors
    console.log('9️⃣ Deleting multiple vectors by filter...');
    await vector.deleteVectors({
      indexName: 'test_embeddings',
      filter: { category: 'test' },
    });
    const afterBulkDelete = await vector.describeIndex({ indexName: 'test_embeddings' });
    console.log('   ✅ Bulk delete, now', afterBulkDelete.count, 'vectors remain\n');

    // Test 10: Truncate index
    console.log('🔟 Truncating index...');
    // Re-add some vectors first
    await vector.upsert({
      indexName: 'test_embeddings',
      vectors: [testVectors[0]],
      ids: ['cleanup'],
    });
    await vector.truncateIndex('test_embeddings');
    const afterTruncate = await vector.describeIndex({ indexName: 'test_embeddings' });
    console.log('   ✅ Truncated, now', afterTruncate.count, 'vectors\n');

    // Cleanup: Delete index
    console.log('🧹 Cleaning up - deleting test index...');
    await vector.deleteIndex({ indexName: 'test_embeddings' });
    console.log('   ✅ Test index deleted\n');

    console.log('✅ All SurrealVector tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await vector.close();
  }
}

main();
