/**
 * Test script for SurrealDB storage adapter (Mastra v1 API)
 *
 * Usage: bun run scripts/test-surreal.ts
 *
 * Make sure SurrealDB is running: docker-compose up -d
 */

import { SurrealStore } from '../src/mastra/storage';

async function test() {
  console.log('Testing SurrealDB Storage Adapter (Mastra v1 API)\n');

  const store = new SurrealStore();

  try {
    // 1. Initialize connection
    console.log('1. Connecting to SurrealDB...');
    console.log('   URL:', process.env.SURREALDB_URL || 'http://localhost:8000 (default)');
    console.log('   NS:', process.env.SURREALDB_NS || 'mastra (default)');
    console.log('   DB:', process.env.SURREALDB_DB || 'development (default)');
    console.log('   User:', process.env.SURREALDB_USER || 'root (default)');
    await store.init();
    console.log('   Connected to SurrealDB\n');

    // Get domain stores (v1 API)
    const memory = await store.getStore('memory');
    const workflows = await store.getStore('workflows');

    if (!memory) throw new Error('Memory domain not available');
    if (!workflows) throw new Error('Workflows domain not available');

    // 2. Test Thread operations
    console.log('2. Testing Thread operations...');
    const thread = await memory.saveThread({
      thread: {
        id: 'test-thread-1',
        resourceId: 'user-123',
        title: 'Test Conversation',
        metadata: { source: 'test-script' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log('   Saved thread:', thread.id);

    const fetchedThread = await memory.getThreadById({ threadId: 'test-thread-1' });
    console.log('   Fetched thread:', fetchedThread?.title);

    const userThreads = await memory.listThreads({
      filter: { resourceId: 'user-123' },
    });
    console.log('   Found', userThreads.threads.length, 'thread(s) for user\n');

    // 3. Test Message operations
    console.log('3. Testing Message operations...');
    const savedMessages = await memory.saveMessages({
      messages: [
        {
          id: 'msg-1',
          threadId: 'test-thread-1',
          role: 'user',
          content: [{ type: 'text', text: 'Hello, this is a test message!' }],
          createdAt: new Date(),
          type: 'text',
        },
        {
          id: 'msg-2',
          threadId: 'test-thread-1',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello! I received your test message.' }],
          createdAt: new Date(),
          type: 'text',
        },
      ] as any,
    });
    console.log('   Saved', savedMessages.messages.length, 'messages');

    const messagesResult = await memory.listMessages({
      threadId: 'test-thread-1',
    });
    console.log('   Found', messagesResult.messages.length, 'message(s) in thread\n');

    // 4. Test Resource (Working Memory) operations
    console.log('4. Testing Resource (Working Memory) operations...');
    const resource = await memory.saveResource({
      resource: {
        id: 'user-123',
        workingMemory: JSON.stringify({ preferences: { theme: 'dark', language: 'en' } }),
        metadata: { lastUpdated: new Date().toISOString() },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log('   Saved resource with id:', resource.id);

    const fetchedResource = await memory.getResourceById({ resourceId: 'user-123' });
    console.log('   Fetched resource working memory:', fetchedResource?.workingMemory?.substring(0, 50) + '...\n');

    // 5. Test Workflow Snapshot operations
    console.log('5. Testing Workflow Snapshot operations...');
    await workflows.persistWorkflowSnapshot({
      workflowName: 'text-processing',
      runId: 'run-abc123',
      resourceId: 'user-123',
      snapshot: {
        runId: 'run-abc123',
        status: 'running',
        value: {},
        context: {},
        serializedStepGraph: [],
        activePaths: [],
        suspendedPaths: {},
        resumeLabels: {},
        waitingPaths: {},
        timestamp: Date.now(),
      } as any,
    });
    console.log('   Persisted workflow snapshot');

    const fetchedSnapshot = await workflows.loadWorkflowSnapshot({
      workflowName: 'text-processing',
      runId: 'run-abc123',
    });
    console.log('   Loaded snapshot status:', fetchedSnapshot?.status, '\n');

    // 6. Test Workflow Runs
    console.log('6. Testing Workflow Runs...');
    const runs = await workflows.listWorkflowRuns({ workflowName: 'text-processing' });
    console.log('   Found', runs.runs.length, 'workflow run(s)\n');

    // 7. Cleanup
    console.log('7. Cleaning up test data...');
    await memory.deleteMessages(['msg-1', 'msg-2']);
    await memory.deleteThread({ threadId: 'test-thread-1' });
    console.log('   Cleaned up test data\n');

    console.log('All tests passed!');

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    await store.close();
  }
}

test();
