/**
 * Direct Vector Search Test
 * Tests HNSW vector search to verify embeddings and search work
 */

import { surrealVector } from '../src/mastra/memory';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

async function testVectorSearch() {
  console.log('🔍 Testing Direct Vector Search\n');

  // Generate embedding for cooking-related query
  console.log('1️⃣ Generating embedding for "pasta carbonara Italian cuisine"...');
  const cookingResult = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: 'pasta carbonara Italian cuisine guanciale',
  });
  console.log('   Embedding dimension:', cookingResult.embedding.length);

  // Search the vector index
  console.log('\n2️⃣ Searching memory_messages index...');
  const cookingResults = await surrealVector.query({
    indexName: 'memory_messages',
    queryVector: cookingResult.embedding,
    topK: 5,
    includeVector: false,
  });

  console.log('\n   Cooking query - Top 5 results:');
  for (const r of cookingResults) {
    const score = typeof r.score === 'number' ? r.score.toFixed(4) : r.score;
    console.log(`   Score: ${score}, ID: ${r.id}`);
    if (r.metadata) {
      console.log(`     resourceId: ${(r.metadata as any).resourceId || 'N/A'}`);
      console.log(`     threadId: ${(r.metadata as any).threadId || 'N/A'}`);
    }
  }

  // Now test a programming-related query
  console.log('\n3️⃣ Generating embedding for "TypeScript React programming"...');
  const progResult = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: 'TypeScript React programming static typing',
  });

  const progResults = await surrealVector.query({
    indexName: 'memory_messages',
    queryVector: progResult.embedding,
    topK: 5,
    includeVector: false,
  });

  console.log('\n   Programming query - Top 5 results:');
  for (const r of progResults) {
    const score = typeof r.score === 'number' ? r.score.toFixed(4) : r.score;
    console.log(`   Score: ${score}, ID: ${r.id}`);
    if (r.metadata) {
      console.log(`     resourceId: ${(r.metadata as any).resourceId || 'N/A'}`);
      console.log(`     threadId: ${(r.metadata as any).threadId || 'N/A'}`);
    }
  }

  // Get index stats
  console.log('\n4️⃣ Index Statistics:');
  const stats = await surrealVector.describeIndex({ indexName: 'memory_messages' });
  console.log('   Dimension:', stats.dimension);
  console.log('   Count:', stats.count);
  console.log('   Metric:', stats.metric);

  console.log('\n✅ Vector search test complete!');
}

testVectorSearch().catch(console.error);
