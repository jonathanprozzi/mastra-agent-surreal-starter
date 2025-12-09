/**
 * Debug Semantic Recall Flow
 * Traces what's happening at each step
 */

import { mastra } from '../src/mastra';
import { memory, surrealVector, surrealStore } from '../src/mastra/memory';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

const RESOURCE_ID = 'debug-recall-user';
const THREAD_1 = 'debug-thread-1';
const THREAD_2 = 'debug-thread-2';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🔍 Debugging Semantic Recall Flow\n');

  const agent = mastra.getAgent('exampleAgent');

  // Step 1: Clean up and create test data
  console.log('1️⃣ Setup: Creating test conversation...');
  try {
    await memory.deleteThread(THREAD_1);
    await memory.deleteThread(THREAD_2);
  } catch (e) {}

  // Create a message in Thread 1
  const response1 = await agent.generate(
    'My favorite programming language is Rust because of its memory safety features.',
    { resourceId: RESOURCE_ID, threadId: THREAD_1 }
  );
  console.log('   Thread 1 message stored');
  await sleep(2000); // Wait for embedding

  // Step 2: Check what's in the vector index
  console.log('\n2️⃣ Check vector index for our resource...');
  const searchEmbedding = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: 'What is my favorite programming language?',
  });

  // Search by resource_id (cross-thread)
  const vectorResults = await surrealVector.query({
    indexName: 'memory_messages',
    queryVector: searchEmbedding.embedding,
    topK: 5,
    filter: { resource_id: RESOURCE_ID },
    includeVector: false,
  });

  console.log('   Found ' + vectorResults.length + ' vectors for resource ' + RESOURCE_ID + ':');
  for (const r of vectorResults) {
    const meta = r.metadata as any;
    console.log('   - ID: ' + r.id + ', thread: ' + meta?.thread_id + ', score: ' + r.score);
  }

  // Step 3: Check what selectBy.include would be constructed
  console.log('\n3️⃣ Simulating what Memory.query() would build for selectBy.include...');
  const includeData = vectorResults.map(r => ({
    id: (r.metadata as any)?.message_id || r.id,
    threadId: (r.metadata as any)?.thread_id,
    withPreviousMessages: 2,
    withNextMessages: 2,
  }));
  console.log('   selectBy.include would be:', JSON.stringify(includeData, null, 2));

  // Step 4: Test our getMessages directly with selectBy.include
  console.log('\n4️⃣ Testing storage.getMessages with selectBy.include...');
  const storageMessages = await surrealStore.getMessages({
    threadId: THREAD_2, // Different thread!
    selectBy: { include: includeData },
  });
  console.log('   Storage returned ' + storageMessages.length + ' messages:');
  for (const m of storageMessages) {
    console.log('   - ID: ' + (m as any).id + ', role: ' + m.role + ', content: ' + String(m.content).substring(0, 50) + '...');
  }

  // Step 5: Now let's test what the Memory class does
  console.log('\n5️⃣ Testing memory.query() for semantic search...');
  // Memory.query returns vector search results
  const memoryQueryResults = await memory.query({
    threadId: THREAD_2,
    resourceId: RESOURCE_ID,
    selectBy: {
      vectorSearchString: 'What programming language do I like?',
    },
  });
  console.log('   memory.query returned ' + memoryQueryResults.length + ' messages');
  for (const m of memoryQueryResults) {
    console.log('   - ID: ' + (m as any).id + ', role: ' + m.role);
  }

  console.log('\n✅ Debug complete');
}

main().catch(console.error);
