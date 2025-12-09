/**
 * Debug Message ID format
 */

import Surreal from 'surrealdb';

async function main() {
  const db = new Surreal();
  await db.connect('ws://localhost:8000/rpc');
  await db.signin({ username: 'root', password: 'root' });
  await db.use({ namespace: 'mastra', database: 'development' });

  // Get all messages
  console.log('=== All messages (last 5) ===');
  const allMsgs = await db.query<[any[]]>(
    'SELECT id, threadId FROM mastra_messages LIMIT 5'
  );
  console.log(JSON.stringify(allMsgs[0], null, 2));

  // Try different ID formats
  if (allMsgs[0]?.length > 0) {
    const firstMsg = allMsgs[0][0];
    const rawId = firstMsg.id;
    console.log('\nFirst message raw ID:', rawId);
    console.log('Type:', typeof rawId);

    // Try to extract the actual ID part
    let idPart = rawId;
    if (typeof rawId === 'object' && rawId.id) {
      idPart = rawId.id;
      console.log('ID from object:', idPart);
    }
    if (typeof rawId === 'string' && rawId.includes(':')) {
      idPart = rawId.split(':')[1];
      console.log('ID after split:', idPart);
    }

    // Query by different formats
    console.log('\n--- Testing different query formats ---');

    // 1. Query by raw id
    const q1 = await db.query<[any[]]>(
      'SELECT * FROM mastra_messages WHERE id = $id LIMIT 1',
      { id: rawId }
    );
    console.log('Query by raw id:', q1[0]?.length || 0, 'results');

    // 2. Query using type::thing
    const q2 = await db.query<[any[]]>(
      'SELECT * FROM type::thing("mastra_messages", $id) LIMIT 1',
      { id: idPart }
    );
    console.log('Query by type::thing:', q2[0]?.length || 0, 'results');

    // 3. Query with direct record syntax
    const q3 = await db.query<[any[]]>(
      `SELECT * FROM mastra_messages:⟨${idPart}⟩ LIMIT 1`
    );
    console.log('Query by direct record:', q3[0]?.length || 0, 'results');
  }

  await db.close();
}

main().catch(console.error);
