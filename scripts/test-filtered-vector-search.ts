/**
 * Test Filtered Vector Search (mimics Mastra's semantic recall)
 *
 * Tests that our SurrealVector can filter by resource_id for cross-thread recall
 */

import { surrealVector } from '../src/mastra/memory';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

async function testFilteredSearch() {
  console.log('🔍 Testing Filtered Vector Search (Cross-Thread Recall)\n');

  // Generate embedding for cooking-related query
  console.log('1️⃣ Generating embedding for "pasta carbonara Italian cuisine"...');
  const cookingResult = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: 'pasta carbonara Italian cuisine guanciale',
  });

  // Test 1: Filter by resource_id (cross-thread)
  console.log('\n2️⃣ Querying with resource_id filter (cross-thread recall)...');
  const resourceFilterResults = await surrealVector.query({
    indexName: 'memory_messages',
    queryVector: cookingResult.embedding,
    topK: 5,
    filter: {
      resource_id: 'test-user-semantic',  // This is how Mastra filters for scope: 'resource'
    },
    includeVector: false,
  });

  console.log(`   Found ${resourceFilterResults.length} results with resource_id filter:`);
  for (const r of resourceFilterResults) {
    const score = typeof r.score === 'number' ? r.score.toFixed(4) : r.score;
    const meta = r.metadata as any;
    console.log(`   Score: ${score}`);
    console.log(`     thread_id: ${meta?.thread_id || 'N/A'}`);
    console.log(`     resource_id: ${meta?.resource_id || 'N/A'}`);
  }

  // Test 2: Filter by thread_id (same-thread)
  console.log('\n3️⃣ Querying with thread_id filter (same-thread recall)...');
  const threadFilterResults = await surrealVector.query({
    indexName: 'memory_messages',
    queryVector: cookingResult.embedding,
    topK: 5,
    filter: {
      thread_id: 'semantic-test-thread-2',  // The cooking thread
    },
    includeVector: false,
  });

  console.log(`   Found ${threadFilterResults.length} results with thread_id filter:`);
  for (const r of threadFilterResults) {
    const score = typeof r.score === 'number' ? r.score.toFixed(4) : r.score;
    const meta = r.metadata as any;
    console.log(`   Score: ${score}`);
    console.log(`     thread_id: ${meta?.thread_id || 'N/A'}`);
    console.log(`     resource_id: ${meta?.resource_id || 'N/A'}`);
  }

  // Test 3: No filter (all messages)
  console.log('\n4️⃣ Querying without filter (all messages)...');
  const noFilterResults = await surrealVector.query({
    indexName: 'memory_messages',
    queryVector: cookingResult.embedding,
    topK: 5,
    includeVector: false,
  });

  console.log(`   Found ${noFilterResults.length} results without filter:`);
  for (const r of noFilterResults) {
    const score = typeof r.score === 'number' ? r.score.toFixed(4) : r.score;
    const meta = r.metadata as any;
    console.log(`   Score: ${score}`);
    console.log(`     thread_id: ${meta?.thread_id || 'N/A'}`);
    console.log(`     resource_id: ${meta?.resource_id || 'N/A'}`);
  }

  console.log('\n✅ Filtered vector search test complete!');
}

testFilteredSearch().catch(console.error);
