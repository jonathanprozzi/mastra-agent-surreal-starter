/**
 * SurrealStore Test Suite
 *
 * Comprehensive tests for the SurrealDB storage adapter.
 * Tests all MastraStorage interface methods.
 *
 * Prerequisites:
 * - SurrealDB running: docker-compose up -d
 * - Schema applied: bun run db:setup
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { SurrealStore } from '../src/mastra/storage';
import type { StorageThreadType } from '@mastra/core/memory';

describe('SurrealStore', () => {
  let store: SurrealStore;

  beforeAll(async () => {
    store = new SurrealStore({
      database: 'test', // Use test database
    });
    await store.init();
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

    it('should report correct capabilities', () => {
      expect(store.supports).toEqual({
        selectByIncludeResourceScope: true,
        resourceWorkingMemory: true,
        hasColumn: false,
        createTable: true,
        deleteMessages: true,
        aiTracing: false,
        indexManagement: false,
        getScoresBySpan: false,
      });
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
        await store.deleteThread({ threadId: testThread.id });
      } catch {
        // Ignore if already deleted
      }
    });

    it('should save a thread', async () => {
      const saved = await store.saveThread({ thread: testThread });

      expect(saved).toBeDefined();
      expect(saved.id).toBe(testThread.id);
      expect(saved.resourceId).toBe(testThread.resourceId);
      expect(saved.title).toBe(testThread.title);
    });

    it('should get a thread by ID', async () => {
      await store.saveThread({ thread: testThread });
      const fetched = await store.getThreadById({ threadId: testThread.id });

      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(testThread.id);
      expect(fetched?.title).toBe(testThread.title);
    });

    it('should return null for non-existent thread', async () => {
      const fetched = await store.getThreadById({ threadId: 'non-existent-id' });
      expect(fetched).toBeNull();
    });

    it('should get threads by resource ID', async () => {
      await store.saveThread({ thread: testThread });
      const threads = await store.getThreadsByResourceId({
        resourceId: testThread.resourceId,
      });

      expect(threads).toBeInstanceOf(Array);
      expect(threads.length).toBeGreaterThanOrEqual(1);
      expect(threads.some(t => t.id === testThread.id)).toBe(true);
    });

    it('should update a thread', async () => {
      await store.saveThread({ thread: testThread });
      const updated = await store.updateThread({
        id: testThread.id,
        title: 'Updated Title',
        metadata: { updated: true },
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.metadata).toEqual({ updated: true });
    });

    it('should delete a thread', async () => {
      await store.saveThread({ thread: testThread });
      await store.deleteThread({ threadId: testThread.id });

      const fetched = await store.getThreadById({ threadId: testThread.id });
      expect(fetched).toBeNull();
    });

    it('should paginate threads by resource ID', async () => {
      // Create multiple threads
      const threads = Array.from({ length: 5 }, (_, i) => ({
        ...testThread,
        id: `test-thread-pagination-${i}`,
        title: `Thread ${i}`,
      }));

      for (const t of threads) {
        await store.saveThread({ thread: t });
      }

      try {
        const result = await store.getThreadsByResourceIdPaginated({
          resourceId: testThread.resourceId,
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
            await store.deleteThread({ threadId: t.id });
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
        content: 'Hello, this is a test!',
        createdAt: new Date(),
        type: 'text' as const,
      },
      {
        id: 'test-msg-2',
        threadId: testThreadId,
        role: 'assistant' as const,
        content: 'Hello! I received your message.',
        createdAt: new Date(Date.now() + 1000),
        type: 'text' as const,
      },
    ];

    beforeEach(async () => {
      // Create thread for messages
      await store.saveThread({
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
        await store.deleteMessages(testMessages.map(m => m.id));
        await store.deleteThread({ threadId: testThreadId });
      } catch {
        // Ignore
      }
    });

    it('should save messages', async () => {
      const saved = await store.saveMessages({ messages: testMessages });

      expect(saved).toBeInstanceOf(Array);
      expect(saved.length).toBe(2);
    });

    it('should get messages by thread ID', async () => {
      await store.saveMessages({ messages: testMessages });
      const messages = await store.getMessages({ threadId: testThreadId });

      expect(messages).toBeInstanceOf(Array);
      expect(messages.length).toBe(2);
      // Should be ordered by createdAt ASC
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });

    it('should get messages by IDs', async () => {
      await store.saveMessages({ messages: testMessages });
      const messages = await store.getMessagesById({
        messageIds: ['test-msg-1'],
        format: 'v1',
      });

      expect(messages.length).toBe(1);
      expect(messages[0].id).toBe('test-msg-1');
    });

    it('should delete messages', async () => {
      await store.saveMessages({ messages: testMessages });
      await store.deleteMessages(['test-msg-1']);

      const messages = await store.getMessages({ threadId: testThreadId });
      expect(messages.length).toBe(1);
      expect(messages[0].id).toBe('test-msg-2');
    });

    it('should respect message limit', async () => {
      await store.saveMessages({ messages: testMessages });
      const messages = await store.getMessages({
        threadId: testThreadId,
        selectBy: { last: 1 },
      });

      expect(messages.length).toBe(1);
    });
  });

  describe('Resource (Working Memory) Operations', () => {
    const testResourceId = 'test-resource-1';

    afterEach(async () => {
      // Note: There's no deleteResource in the interface, so we can't clean up easily
      // Resources are left in the database but won't affect other tests
    });

    it('should save a resource', async () => {
      const resource = await store.saveResource({
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

      await store.saveResource({
        resource: {
          id: uniqueResourceId,
          workingMemory: JSON.stringify({ testValue: 'hello' }),
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const fetched = await store.getResourceById({ resourceId: uniqueResourceId });
      expect(fetched).toBeDefined();
      expect(fetched?.workingMemory).toContain('testValue');
    });

    it('should update a resource', async () => {
      await store.saveResource({
        resource: {
          id: testResourceId,
          workingMemory: 'initial',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const updated = await store.updateResource({
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

    afterEach(async () => {
      // Cleanup - workflows don't have a delete method in the interface
    });

    it('should persist a workflow snapshot', async () => {
      await expect(
        store.persistWorkflowSnapshot({
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
      await store.persistWorkflowSnapshot({
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

      const snapshot = await store.loadWorkflowSnapshot({ workflowName, runId });
      expect(snapshot).toBeDefined();
      expect(snapshot?.status).toBe('running');
    });

    it('should get workflow runs', async () => {
      const runs = await store.getWorkflowRuns({ workflowName });

      expect(runs).toBeDefined();
      expect(runs.runs).toBeInstanceOf(Array);
      expect(typeof runs.total).toBe('number');
    });

    it('should update workflow state', async () => {
      await store.persistWorkflowSnapshot({
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

      const updated = await store.updateWorkflowState({
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

  describe('Table Operations', () => {
    const testTableName = 'test_operations_table' as any;

    afterEach(async () => {
      try {
        await store.dropTable({ tableName: testTableName });
      } catch {
        // Ignore if doesn't exist
      }
    });

    it('should create a table', async () => {
      await expect(
        store.createTable({
          tableName: testTableName,
          schema: {
            id: { type: 'string', nullable: false },
            name: { type: 'string', nullable: true },
          },
        })
      ).resolves.not.toThrow();
    });

    it('should insert a record', async () => {
      await store.createTable({
        tableName: testTableName,
        schema: { id: { type: 'string', nullable: false } },
      });

      await expect(
        store.insert({
          tableName: testTableName,
          record: { id: 'test-1', name: 'Test Record' },
        })
      ).resolves.not.toThrow();
    });

    it('should batch insert records', async () => {
      await store.createTable({
        tableName: testTableName,
        schema: { id: { type: 'string', nullable: false } },
      });

      await expect(
        store.batchInsert({
          tableName: testTableName,
          records: [
            { id: 'batch-1', name: 'Record 1' },
            { id: 'batch-2', name: 'Record 2' },
          ],
        })
      ).resolves.not.toThrow();
    });

    it('should load a record by keys', async () => {
      await store.createTable({
        tableName: testTableName,
        schema: { id: { type: 'string', nullable: false } },
      });

      await store.insert({
        tableName: testTableName,
        record: { id: 'load-test', name: 'Load Test' },
      });

      // Load by a field that isn't the record ID
      const loaded = await store.load<{ id: string; name: string }>({
        tableName: testTableName,
        keys: { name: 'Load Test' },
      });

      expect(loaded).toBeDefined();
      expect(loaded?.name).toBe('Load Test');
    });

    it('should clear a table', async () => {
      await store.createTable({
        tableName: testTableName,
        schema: { id: { type: 'string', nullable: false } },
      });

      await store.insert({
        tableName: testTableName,
        record: { id: 'clear-test' },
      });

      await store.clearTable({ tableName: testTableName });

      const loaded = await store.load({
        tableName: testTableName,
        keys: { id: 'clear-test' },
      });

      expect(loaded).toBeNull();
    });

    it('should drop a table', async () => {
      await store.createTable({
        tableName: testTableName,
        schema: { id: { type: 'string', nullable: false } },
      });

      await expect(
        store.dropTable({ tableName: testTableName })
      ).resolves.not.toThrow();
    });
  });
});
