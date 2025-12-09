/**
 * Trace Full Semantic Recall Flow
 * Step by step debugging to find where cross-thread recall breaks
 */

import Surreal from 'surrealdb';
import { mastra } from '../src/mastra';
import { memory, surrealVector, surrealStore } from '../src/mastra/memory';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

const RESOURCE_ID = 'trace-user-' + Date.now();
const THREAD_1 = 'trace-thread-1-' + Date.now();
const THREAD_2 = 'trace-thread-2-' + Date.now();

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('========================================');
  console.log('TRACING FULL SEMANTIC RECALL FLOW');
  console.log('========================================\n');

  console.log('Test IDs:');
  console.log('  resourceId:', RESOURCE_ID);
  console.log('  thread1:', THREAD_1);
  console.log('  thread2:', THREAD_2);

  const agent = mastra.getAgent('exampleAgent');

  // STEP 1: Create message in Thread 1
  console.log('\n--- STEP 1: Create message in Thread 1 ---');
  const response1 = await agent.generate(
    'My favorite programming language is Rust because of memory safety.',
    { resourceId: RESOURCE_ID, threadId: THREAD_1 }
  );
  console.log('Response:', response1.text.substring(0, 80) + '...');

  // Wait for embedding
  console.log('\nWaiting 3s for embedding to save...');
  await sleep(3000);

  // STEP 2: Check what got saved to messages table
  console.log('\n--- STEP 2: Check messages table ---');
  const messages = await surrealStore.getMessages({ threadId: THREAD_1 });
  console.log('Messages in thread 1:', messages.length);
  if (messages.length > 0) {
    for (const m of messages) {
      console.log('  - ID:', (m as any).id);
      console.log('    Role:', m.role);
      console.log('    Content:', String(m.content).substring(0, 50) + '...');
    }
  }

  // STEP 3: Check what got saved to vector table
  console.log('\n--- STEP 3: Check vector table ---');

  // Connect directly to DB to check raw data
  const db = new Surreal();
  await db.connect('ws://localhost:8000/rpc');
  await db.signin({ username: 'root', password: 'root' });
  await db.use({ namespace: 'mastra', database: 'development' });

  const vectorRecords = await db.query<[any[]]>(
    'SELECT id, metadata FROM mastra_vector_memory_messages WHERE metadata.resource_id = $resourceId',
    { resourceId: RESOURCE_ID }
  );
  console.log('Vectors for resource:', vectorRecords[0]?.length || 0);
  if (vectorRecords[0]?.length > 0) {
    for (const v of vectorRecords[0]) {
      console.log('  - Vector ID:', v.id);
      console.log('    metadata.message_id:', v.metadata?.message_id);
      console.log('    metadata.thread_id:', v.metadata?.thread_id);
      console.log('    metadata.resource_id:', v.metadata?.resource_id);
    }
  }

  // STEP 4: Do a vector search like Mastra does
  console.log('\n--- STEP 4: Vector search (like Mastra) ---');
  const searchEmbedding = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: 'What programming language do I like?',
  });

  // Mastra uses filter: { resource_id: resourceId } for scope: 'resource'
  const vectorResults = await surrealVector.query({
    indexName: 'memory_messages',
    queryVector: searchEmbedding.embedding,
    topK: 5,
    filter: { resource_id: RESOURCE_ID },
    includeVector: false,
  });

  console.log('Vector search results:', vectorResults.length);
  for (const r of vectorResults) {
    console.log('  - ID:', r.id);
    console.log('    Score:', r.score);
    console.log('    metadata.message_id:', (r.metadata as any)?.message_id);
    console.log('    metadata.thread_id:', (r.metadata as any)?.thread_id);
  }

  // STEP 5: Build selectBy.include like Mastra does
  console.log('\n--- STEP 5: Build selectBy.include (like Mastra) ---');
  const selectByInclude = vectorResults.map(r => ({
    id: (r.metadata as any)?.message_id,
    threadId: (r.metadata as any)?.thread_id,
    withNextMessages: 2,
    withPreviousMessages: 2,
  }));
  console.log('selectBy.include:', JSON.stringify(selectByInclude, null, 2));

  // STEP 6: Call getMessages with selectBy.include
  console.log('\n--- STEP 6: Call storage.getMessages with selectBy.include ---');
  const retrievedMessages = await surrealStore.getMessages({
    threadId: THREAD_2, // Note: Different thread!
    selectBy: { include: selectByInclude },
  });
  console.log('Retrieved messages:', retrievedMessages.length);
  for (const m of retrievedMessages) {
    console.log('  - ID:', (m as any).id);
    console.log('    Role:', m.role);
    console.log('    Content:', String(m.content).substring(0, 50) + '...');
  }

  // STEP 7: Final analysis
  console.log('\n--- ANALYSIS ---');
  if (messages.length === 0) {
    console.log('PROBLEM: No messages saved to storage');
  } else if (vectorRecords[0]?.length === 0) {
    console.log('PROBLEM: No vectors saved (embeddings not stored)');
  } else if (vectorResults.length === 0) {
    console.log('PROBLEM: Vector search returned no results');
  } else if (!selectByInclude[0]?.id) {
    console.log('PROBLEM: Vector metadata missing message_id');
  } else if (retrievedMessages.length === 0) {
    console.log('PROBLEM: getMessages with selectBy.include returned nothing');
    console.log('  Trying to find message by ID directly...');

    // Try to find the message directly
    const directLookup = await db.query<[any[]]>(
      'SELECT * FROM mastra_messages WHERE id = $id',
      { id: selectByInclude[0].id }
    );
    console.log('  Direct lookup result:', directLookup[0]?.length || 0);

    // Also check using thread id
    const byThread = await db.query<[any[]]>(
      'SELECT * FROM mastra_messages WHERE threadId = $threadId',
      { threadId: THREAD_1 }
    );
    console.log('  Messages in thread 1 (raw):', byThread[0]?.length || 0);
    if (byThread[0]?.length > 0) {
      console.log('  First message ID:', byThread[0][0].id);
    }
  } else {
    console.log('SUCCESS: Full flow working!');
  }

  await db.close();
  console.log('\n========================================');
}

main().catch(console.error);
