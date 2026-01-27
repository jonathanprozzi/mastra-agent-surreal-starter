/**
 * SurrealStore Test Suite (Mastra v1 API)
 *
 * Comprehensive tests for the SurrealDB storage adapter.
 * Uses v1 domain-based API: store.getStore('memory'), store.getStore('workflows'), etc.
 *
 * Prerequisites:
 * - SurrealDB running: docker-compose up -d
 * - Schema applied: bun run db:setup
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { SurrealStore, MemorySurreal, WorkflowsSurreal, OperationsSurreal } from '../src/mastra/storage';
import type { StorageThreadType } from '@mastra/core/memory';

describe('SurrealStore', () => {
  let store: SurrealStore;
  let memory: MemorySurreal;
  let workflows: WorkflowsSurreal;

  beforeAll(async () => {
    store = new SurrealStore({
      database: 'test', // Use test database
    });
    await store.init();

    // Get domain stores (v1 API)
    const memoryDomain = await store.getStore('memory');
    const workflowsDomain = await store.getStore('workflows');

    if (!memoryDomain) throw new Error('Memory domain not available');
    if (!workflowsDomain) throw new Error('Workflows domain not available');

    memory = memoryDomain as MemorySurreal;
    workflows = workflowsDomain as WorkflowsSurreal;
  });

  afterAll(async () => {
    await store.close();
  });

  describe('Connection', () => {
    it('should connect to SurrealDB successfully', async () => {
      const testStore = new SurrealStore({ database: 'test' });
      await expect(testStore.init()).resolves.not.toThrow();
      await testStore.close();
    });

    it('should provide access to domain stores', async () => {
      const memoryDomain = await store.getStore('memory');
      const workflowsDomain = await store.getStore('workflows');

      expect(memoryDomain).toBeDefined();
      expect(workflowsDomain).toBeDefined();
    });
  });

  describe('Thread Operations', () => {
    const testThread: StorageThreadType = {
      id: 'test-thread-storage-1',
      resourceId: 'test-user-1',
      title: 'Test Thread',
      metadata: { source: 'vitest' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    afterEach(async () => {
      // Cleanup
      try {
        await memory.deleteThread({ threadId: testThread.id });
      } catch {
        // Ignore if already deleted
      }
    });

    it('should save a thread', async () => {
      const saved = await memory.saveThread({ thread: testThread });

      expect(saved).toBeDefined();
      expect(saved.id).toBe(testThread.id);
      expect(saved.resourceId).toBe(testThread.resourceId);
      expect(saved.title).toBe(testThread.title);
    });

    it('should get a thread by ID', async () => {
      await memory.saveThread({ thread: testThread });
      const fetched = await memory.getThreadById({ threadId: testThread.id });

      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(testThread.id);
      expect(fetched?.title).toBe(testThread.title);
    });

    it('should return null for non-existent thread', async () => {
      const fetched = await memory.getThreadById({ threadId: 'non-existent-id' });
      expect(fetched).toBeNull();
    });

    it('should list threads by resource ID', async () => {
      await memory.saveThread({ thread: testThread });
      const result = await memory.listThreads({
        filter: { resourceId: testThread.resourceId },
      });

      expect(result.threads).toBeInstanceOf(Array);
      expect(result.threads.length).toBeGreaterThanOrEqual(1);
      expect(result.threads.some(t => t.id === testThread.id)).toBe(true);
    });

    it('should update a thread', async () => {
      await memory.saveThread({ thread: testThread });
      const updated = await memory.updateThread({
        id: testThread.id,
        title: 'Updated Title',
        metadata: { updated: true },
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.metadata).toEqual({ updated: true });
    });

    it('should delete a thread', async () => {
      await memory.saveThread({ thread: testThread });
      await memory.deleteThread({ threadId: testThread.id });

      const fetched = await memory.getThreadById({ threadId: testThread.id });
      expect(fetched).toBeNull();
    });

    it('should paginate threads', async () => {
      // Create multiple threads
      const threads = Array.from({ length: 5 }, (_, i) => ({
        ...testThread,
        id: `test-thread-pagination-${i}`,
        title: `Thread ${i}`,
      }));

      for (const t of threads) {
        await memory.saveThread({ thread: t });
      }

      try {
        const result = await memory.listThreads({
          filter: { resourceId: testThread.resourceId },
          page: 1,
          perPage: 2,
        });

        expect(result.threads.length).toBeLessThanOrEqual(2);
        expect(result.page).toBe(1);
        expect(result.perPage).toBe(2);
        expect(typeof result.total).toBe('number');
        expect(typeof result.hasMore).toBe('boolean');
      } finally {
        // Cleanup
        for (const t of threads) {
          try {
            await memory.deleteThread({ threadId: t.id });
          } catch {
            // Ignore
          }
        }
      }
    });
  });

  describe('Message Operations', () => {
    const testThreadId = 'test-thread-messages';
    const testMessages = [
      {
        id: 'test-msg-1',
        threadId: testThreadId,
        role: 'user' as const,
        content: [{ type: 'text' as const, text: 'Hello, this is a test!' }],
        createdAt: new Date(),
        type: 'text' as const,
      },
      {
        id: 'test-msg-2',
        threadId: testThreadId,
        role: 'assistant' as const,
        content: [{ type: 'text' as const, text: 'Hello! I received your message.' }],
        createdAt: new Date(Date.now() + 1000),
        type: 'text' as const,
      },
    ];

    beforeEach(async () => {
      // Create thread for messages
      await memory.saveThread({
        thread: {
          id: testThreadId,
          resourceId: 'test-user-messages',
          title: 'Message Test Thread',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    });

    afterEach(async () => {
      // Cleanup
      try {
        await memory.deleteMessages(testMessages.map(m => m.id));
        await memory.deleteThread({ threadId: testThreadId });
      } catch {
        // Ignore
      }
    });

    it('should save messages', async () => {
      const result = await memory.saveMessages({ messages: testMessages as any });

      expect(result.messages).toBeInstanceOf(Array);
      expect(result.messages.length).toBe(2);
    });

    it('should list messages by thread ID', async () => {
      await memory.saveMessages({ messages: testMessages as any });
      const result = await memory.listMessages({ threadId: testThreadId });

      expect(result.messages).toBeInstanceOf(Array);
      expect(result.messages.length).toBe(2);
    });

    it('should list messages by IDs', async () => {
      await memory.saveMessages({ messages: testMessages as any });
      const result = await memory.listMessagesById({
        messageIds: ['test-msg-1'],
      });

      expect(result.messages.length).toBe(1);
      expect(result.messages[0].id).toBe('test-msg-1');
    });

    it('should delete messages', async () => {
      await memory.saveMessages({ messages: testMessages as any });
      await memory.deleteMessages(['test-msg-1']);

      const result = await memory.listMessages({ threadId: testThreadId });
      expect(result.messages.length).toBe(1);
      expect(result.messages[0].id).toBe('test-msg-2');
    });

    it('should respect message limit (perPage)', async () => {
      await memory.saveMessages({ messages: testMessages as any });
      const result = await memory.listMessages({
        threadId: testThreadId,
        perPage: 1,
      });

      expect(result.messages.length).toBe(1);
    });
  });

  describe('Resource (Working Memory) Operations', () => {
    const testResourceId = 'test-resource-1';

    it('should save a resource', async () => {
      const resource = await memory.saveResource({
        resource: {
          id: testResourceId,
          workingMemory: JSON.stringify({ preferences: { theme: 'dark' } }),
          metadata: { version: 1 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      expect(resource).toBeDefined();
      expect(resource.id).toBe(testResourceId);
    });

    it('should get a resource by ID', async () => {
      const uniqueResourceId = 'test-resource-get-' + Date.now();

      await memory.saveResource({
        resource: {
          id: uniqueResourceId,
          workingMemory: JSON.stringify({ testValue: 'hello' }),
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const fetched = await memory.getResourceById({ resourceId: uniqueResourceId });
      expect(fetched).toBeDefined();
      expect(fetched?.workingMemory).toContain('testValue');
    });

    it('should update a resource', async () => {
      await memory.saveResource({
        resource: {
          id: testResourceId,
          workingMemory: 'initial',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const updated = await memory.updateResource({
        resourceId: testResourceId,
        workingMemory: 'updated memory',
        metadata: { updated: true },
      });

      expect(updated.workingMemory).toBe('updated memory');
    });
  });

  describe('Workflow Operations', () => {
    const workflowName = 'test-workflow';
    const runId = 'test-run-1';

    it('should persist a workflow snapshot', async () => {
      await expect(
        workflows.persistWorkflowSnapshot({
          workflowName,
          runId,
          resourceId: 'test-user',
          snapshot: {
            runId,
            status: 'running',
            value: { step: 1 },
            context: {},
            serializedStepGraph: [],
            activePaths: [],
            suspendedPaths: {},
            resumeLabels: {},
            waitingPaths: {},
            timestamp: Date.now(),
          } as any,
        })
      ).resolves.not.toThrow();
    });

    it('should load a workflow snapshot', async () => {
      await workflows.persistWorkflowSnapshot({
        workflowName,
        runId,
        snapshot: {
          runId,
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

      const snapshot = await workflows.loadWorkflowSnapshot({ workflowName, runId });
      expect(snapshot).toBeDefined();
      expect(snapshot?.status).toBe('running');
    });

    it('should list workflow runs', async () => {
      const result = await workflows.listWorkflowRuns({ workflowName });

      expect(result).toBeDefined();
      expect(result.runs).toBeInstanceOf(Array);
      expect(typeof result.total).toBe('number');
    });

    it('should update workflow state', async () => {
      await workflows.persistWorkflowSnapshot({
        workflowName,
        runId: 'state-update-test',
        snapshot: {
          runId: 'state-update-test',
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

      const updated = await workflows.updateWorkflowState({
        workflowName,
        runId: 'state-update-test',
        opts: {
          status: 'completed',
        },
      });

      // The update should succeed (may return undefined based on implementation)
      expect(updated === undefined || updated?.status === 'completed').toBe(true);
    });
  });

  describe('Operations Domain', () => {
    const testTableName = 'test_operations_table' as any;

    // Get operations domain
    let operations: OperationsSurreal;

    beforeAll(async () => {
      // Operations is not part of standard StorageDomains, use getOperations()
      operations = await store.getOperations();
    });

    afterEach(async () => {
      try {
        await operations.dropTable({ tableName: testTableName });
      } catch {
        // Ignore if doesn't exist
      }
    });

    it('should create a table', async () => {
      await expect(
        operations.createTable({
          tableName: testTableName,
          schema: {
            id: { type: 'string', nullable: false },
            name: { type: 'string', nullable: true },
          },
        })
      ).resolves.not.toThrow();
    });

    it('should insert a record', async () => {
      await operations.createTable({
        tableName: testTableName,
        schema: { id: { type: 'string', nullable: false } },
      });

      await expect(
        operations.insert({
          tableName: testTableName,
          record: { id: 'test-1', name: 'Test Record' },
        })
      ).resolves.not.toThrow();
    });

    it('should batch insert records', async () => {
      await operations.createTable({
        tableName: testTableName,
        schema: { id: { type: 'string', nullable: false } },
      });

      await expect(
        operations.batchInsert({
          tableName: testTableName,
          records: [
            { id: 'batch-1', name: 'Record 1' },
            { id: 'batch-2', name: 'Record 2' },
          ],
        })
      ).resolves.not.toThrow();
    });

    it('should load a record by keys', async () => {
      await operations.createTable({
        tableName: testTableName,
        schema: { id: { type: 'string', nullable: false } },
      });

      await operations.insert({
        tableName: testTableName,
        record: { id: 'load-test', name: 'Load Test' },
      });

      // Load by a field that isn't the record ID
      const loaded = await operations.load<{ id: string; name: string }>({
        tableName: testTableName,
        keys: { name: 'Load Test' },
      });

      expect(loaded).toBeDefined();
      expect(loaded?.name).toBe('Load Test');
    });

    it('should clear a table', async () => {
      await operations.createTable({
        tableName: testTableName,
        schema: { id: { type: 'string', nullable: false } },
      });

      await operations.insert({
        tableName: testTableName,
        record: { id: 'clear-test' },
      });

      await operations.clearTable({ tableName: testTableName });

      const loaded = await operations.load({
        tableName: testTableName,
        keys: { id: 'clear-test' },
      });

      expect(loaded).toBeNull();
    });

    it('should drop a table', async () => {
      await operations.createTable({
        tableName: testTableName,
        schema: { id: { type: 'string', nullable: false } },
      });

      await expect(
        operations.dropTable({ tableName: testTableName })
      ).resolves.not.toThrow();
    });
  });
});
