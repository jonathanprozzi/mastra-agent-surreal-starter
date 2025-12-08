/**
 * Test script for SurrealDB storage adapter (MastraStorage interface)
 *
 * Usage: bun run scripts/test-surreal.ts
 *
 * Make sure SurrealDB is running: docker-compose up -d
 */

import { SurrealStore } from '../src/mastra/storage';

async function test() {
  console.log('🧪 Testing SurrealDB Storage Adapter (MastraStorage Interface)\n');

  const store = new SurrealStore();

  try {
    // 1. Initialize connection
    console.log('1. Connecting to SurrealDB...');
    console.log('   URL:', process.env.SURREALDB_URL || 'http://localhost:8000 (default)');
    console.log('   NS:', process.env.SURREALDB_NS || 'mastra (default)');
    console.log('   DB:', process.env.SURREALDB_DB || 'development (default)');
    console.log('   User:', process.env.SURREALDB_USER || 'root (default)');
    await store.init();
    console.log('   ✅ Connected to SurrealDB\n');

    // 2. Test Thread operations (MastraStorage interface)
    console.log('2. Testing Thread operations...');
    const thread = await store.saveThread({
      thread: {
        id: 'test-thread-1',
        resourceId: 'user-123',
        title: 'Test Conversation',
        metadata: { source: 'test-script' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log('   ✅ Saved thread:', thread.id);

    const fetchedThread = await store.getThreadById({ threadId: 'test-thread-1' });
    console.log('   ✅ Fetched thread:', fetchedThread?.title);

    const userThreads = await store.getThreadsByResourceId({ resourceId: 'user-123' });
    console.log('   ✅ Found', userThreads.length, 'thread(s) for user\n');

    // 3. Test Message operations (v1 format - simpler)
    console.log('3. Testing Message operations...');
    const savedMessages = await store.saveMessages({
      messages: [
        {
          id: 'msg-1',
          threadId: 'test-thread-1',
          role: 'user',
          content: 'Hello, this is a test message!',
          createdAt: new Date(),
          type: 'text',
        },
        {
          id: 'msg-2',
          threadId: 'test-thread-1',
          role: 'assistant',
          content: 'Hello! I received your test message.',
          createdAt: new Date(),
          type: 'text',
        },
      ],
    });
    console.log('   ✅ Saved', savedMessages.length, 'messages');

    const messages = await store.getMessages({
      threadId: 'test-thread-1',
    });
    console.log('   ✅ Found', messages.length, 'message(s) in thread\n');

    // 4. Test Resource (Working Memory) operations
    console.log('4. Testing Resource (Working Memory) operations...');
    const resource = await store.saveResource({
      resource: {
        id: 'user-123', // StorageResourceType uses 'id' not 'resourceId'
        workingMemory: JSON.stringify({ preferences: { theme: 'dark', language: 'en' } }),
        metadata: { lastUpdated: new Date().toISOString() },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log('   ✅ Saved resource with id:', resource.id);

    const fetchedResource = await store.getResourceById({ resourceId: 'user-123' });
    console.log('   ✅ Fetched resource working memory:', fetchedResource?.workingMemory?.substring(0, 50) + '...\n');

    // 5. Test Workflow Snapshot operations
    console.log('5. Testing Workflow Snapshot operations...');
    // Note: Using type assertion for test since WorkflowRunState has complex context type
    await store.persistWorkflowSnapshot({
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
    console.log('   ✅ Persisted workflow snapshot');

    const fetchedSnapshot = await store.loadWorkflowSnapshot({
      workflowName: 'text-processing',
      runId: 'run-abc123',
    });
    console.log('   ✅ Loaded snapshot status:', fetchedSnapshot?.status, '\n');

    // 6. Test Workflow Runs
    console.log('6. Testing Workflow Runs...');
    const runs = await store.getWorkflowRuns({ workflowName: 'text-processing' });
    console.log('   ✅ Found', runs.runs.length, 'workflow run(s)\n');

    // 7. Cleanup
    console.log('7. Cleaning up test data...');
    // Delete messages first
    await store.deleteMessages(['msg-1', 'msg-2']);
    // Delete thread
    await store.deleteThread({ threadId: 'test-thread-1' });
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
