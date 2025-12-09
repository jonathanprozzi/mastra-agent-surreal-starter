/**
 * Check actual database state
 */

import Surreal from 'surrealdb';

async function main() {
  const db = new Surreal();
  await db.connect('ws://localhost:8000/rpc');
  await db.signin({ username: 'root', password: 'root' });
  await db.use({ namespace: 'mastra', database: 'memory' });

  console.log('=== Messages for debug-thread-1 ===');
  const messages = await db.query<[any[]]>(
    'SELECT id, threadId, role FROM mastra_messages WHERE threadId = $threadId',
    { threadId: 'debug-thread-1' }
  );
  console.log(JSON.stringify(messages[0], null, 2));

  console.log('\n=== Vector metadata for debug-recall-user ===');
  const vectors = await db.query<[any[]]>(
    'SELECT id, metadata FROM mastra_vector_memory_messages WHERE metadata.resource_id = $resourceId LIMIT 5',
    { resourceId: 'debug-recall-user' }
  );
  console.log(JSON.stringify(vectors[0], null, 2));

  console.log('\n=== All messages (last 5) ===');
  const allMsgs = await db.query<[any[]]>(
    'SELECT id, threadId, role FROM mastra_messages ORDER BY createdAt DESC LIMIT 5'
  );
  console.log(JSON.stringify(allMsgs[0], null, 2));

  await db.close();
}

main().catch(console.error);
