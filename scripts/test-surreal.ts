/**
 * Test script for SurrealDB storage adapter
 *
 * Usage: bun run scripts/test-surreal.ts
 *
 * Make sure SurrealDB is running: docker-compose up -d
 */

import { SurrealDBStore } from '../src/mastra/storage';

async function test() {
  console.log('🧪 Testing SurrealDB Storage Adapter\n');

  const store = new SurrealDBStore();

  try {
    // 1. Initialize connection (schema already applied via db:setup)
    console.log('1. Connecting to SurrealDB...');
    console.log('   URL:', process.env.SURREALDB_URL || 'http://localhost:8000 (default)');
    console.log('   NS:', process.env.SURREALDB_NS || 'mastra (default)');
    console.log('   DB:', process.env.SURREALDB_DB || 'development (default)');
    console.log('   User:', process.env.SURREALDB_USER || 'root (default)');
    await store.init(false); // false = don't re-apply schema
    console.log('   ✅ Connected to SurrealDB\n');

    // Quick connectivity test
    console.log('   Testing raw query...');
    const testQuery = await store.database.query('INFO FOR DB;');
    console.log('   ✅ Raw query works, tables:', Object.keys((testQuery[0] as any)?.tables || {}));
    console.log('');

    // 2. Test Thread CRUD
    console.log('2. Testing Thread operations...');
    console.log('   Attempting to create thread...');
    const thread = await store.createThread({
      id: 'test-thread-1',
      resourceId: 'user-123',
      title: 'Test Conversation',
      metadata: { source: 'test-script' },
    });
    console.log('   ✅ Created thread:', thread.id);

    const fetchedThread = await store.getThread('test-thread-1');
    console.log('   ✅ Fetched thread:', fetchedThread?.title);

    const userThreads = await store.getThreadsByResource('user-123');
    console.log('   ✅ Found', userThreads.length, 'thread(s) for user\n');

    // 3. Test Message CRUD
    console.log('3. Testing Message operations...');
    const message1 = await store.addMessage({
      id: 'msg-1',
      threadId: 'test-thread-1',
      role: 'user',
      content: 'Hello, this is a test message!',
    });
    console.log('   ✅ Added user message:', message1.id);

    const message2 = await store.addMessage({
      id: 'msg-2',
      threadId: 'test-thread-1',
      role: 'assistant',
      content: 'Hello! I received your test message.',
    });
    console.log('   ✅ Added assistant message:', message2.id);

    const messages = await store.getMessages('test-thread-1');
    console.log('   ✅ Found', messages.length, 'message(s) in thread\n');

    // 4. Test Resource (Working Memory)
    console.log('4. Testing Resource (Working Memory) operations...');
    const resource = await store.setResource({
      id: 'res-1',
      resourceId: 'user-123',
      key: 'preferences',
      value: { theme: 'dark', language: 'en' },
      metadata: { lastUpdated: new Date().toISOString() },
    });
    console.log('   ✅ Set resource:', resource.key);

    const fetchedResource = await store.getResource('user-123', 'preferences');
    console.log('   ✅ Fetched resource value:', JSON.stringify(fetchedResource?.value));

    const allResources = await store.getResourcesByResourceId('user-123');
    console.log('   ✅ Found', allResources.length, 'resource(s) for user\n');

    // 5. Test Workflow Snapshot
    console.log('5. Testing Workflow Snapshot operations...');
    const snapshot = await store.saveWorkflowSnapshot({
      id: 'snap-1',
      workflowId: 'text-processing',
      runId: 'run-abc123',
      snapshot: {
        currentStep: 'process-input',
        state: { text: 'hello world' },
      },
    });
    console.log('   ✅ Saved workflow snapshot');

    const fetchedSnapshot = await store.getWorkflowSnapshot('text-processing', 'run-abc123');
    console.log('   ✅ Fetched snapshot, current step:', (fetchedSnapshot?.snapshot as any)?.currentStep, '\n');

    // 6. Test Trace
    console.log('6. Testing Trace operations...');
    const trace = await store.saveTrace({
      id: 'trace-1',
      traceId: 'trace-abc',
      name: 'agent.generate',
      startTime: new Date(),
      attributes: { model: 'claude-sonnet-4-20250514' },
    });
    console.log('   ✅ Saved trace:', trace.name);

    const traces = await store.getTraces('trace-abc');
    console.log('   ✅ Found', traces.length, 'trace(s)\n');

    // 7. Test Eval
    console.log('7. Testing Eval operations...');
    const evalResult = await store.saveEval({
      id: 'eval-1',
      name: 'response-quality',
      input: 'What is 2+2?',
      output: '4',
      expected: '4',
      score: 1.0,
    });
    console.log('   ✅ Saved eval:', evalResult.name, 'score:', evalResult.score);

    const evals = await store.getEvals('response-quality');
    console.log('   ✅ Found', evals.length, 'eval(s)\n');

    // 8. Cleanup
    console.log('8. Cleaning up test data...');
    await store.deleteMessagesByThread('test-thread-1');
    await store.deleteThread('test-thread-1');
    await store.deleteResource('user-123', 'preferences');
    await store.deleteWorkflowSnapshot('text-processing', 'run-abc123');
    console.log('   ✅ Cleaned up test data\n');

    console.log('✅ All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await store.close();
  }
}

test();
