/**
 * Memory Domain for SurrealDB Storage
 *
 * Handles threads, messages, and resources (working memory).
 */

import type Surreal from 'surrealdb';
import type {
  StorageGetMessagesArg,
  StorageResourceType,
  PaginationInfo,
  ThreadSortOptions,
} from '@mastra/core/storage';
import type { StorageThreadType, MastraMessageV1 } from '@mastra/core/memory';
import type { MastraMessageV2, MastraMessageContentV2 } from '@mastra/core/agent';
import { normalizeId, ensureDate, resolveMessageLimit } from '../shared/utils';

export class MemorySurreal {
  constructor(private db: Surreal) {}

  // ============================================
  // THREADS
  // ============================================

  async getThreadById({
    threadId,
  }: {
    threadId: string;
  }): Promise<StorageThreadType | null> {
    const results = await this.db.query<[StorageThreadType[]]>(
      'SELECT * FROM type::thing("mastra_threads", $threadId)',
      { threadId }
    );
    const thread = results[0]?.[0];
    if (!thread) return null;
    return {
      ...thread,
      id: normalizeId(thread.id),
      createdAt: ensureDate(thread.createdAt) || new Date(),
      updatedAt: ensureDate(thread.updatedAt) || new Date(),
    };
  }

  async getThreadsByResourceId(
    args: { resourceId: string } & ThreadSortOptions
  ): Promise<StorageThreadType[]> {
    const { resourceId, orderBy = 'createdAt', sortDirection = 'desc' } = args;
    const results = await this.db.query<[StorageThreadType[]]>(
      `SELECT * FROM mastra_threads WHERE resourceId = $resourceId ORDER BY ${orderBy} ${sortDirection.toUpperCase()}`,
      { resourceId }
    );
    return (results[0] || []).map((t) => ({
      ...t,
      id: normalizeId(t.id),
      createdAt: ensureDate(t.createdAt) || new Date(),
      updatedAt: ensureDate(t.updatedAt) || new Date(),
    }));
  }

  async getThreadsByResourceIdPaginated(
    args: { resourceId: string; page: number; perPage: number } & ThreadSortOptions
  ): Promise<PaginationInfo & { threads: StorageThreadType[] }> {
    const { resourceId, page, perPage, orderBy = 'createdAt', sortDirection = 'desc' } = args;
    const offset = (page - 1) * perPage;

    // Get total count
    const countResults = await this.db.query<[{ count: number }[]]>(
      'SELECT count() as count FROM mastra_threads WHERE resourceId = $resourceId GROUP ALL',
      { resourceId }
    );
    const total = countResults[0]?.[0]?.count || 0;

    // Get paginated results
    const results = await this.db.query<[StorageThreadType[]]>(
      `SELECT * FROM mastra_threads WHERE resourceId = $resourceId ORDER BY ${orderBy} ${sortDirection.toUpperCase()} LIMIT $limit START $offset`,
      { resourceId, limit: perPage, offset }
    );

    const threads = (results[0] || []).map((t) => ({
      ...t,
      id: normalizeId(t.id),
      createdAt: ensureDate(t.createdAt) || new Date(),
      updatedAt: ensureDate(t.updatedAt) || new Date(),
    }));

    return {
      threads,
      page,
      perPage,
      total,
      hasMore: offset + threads.length < total,
    };
  }

  async saveThread({
    thread,
  }: {
    thread: StorageThreadType;
  }): Promise<StorageThreadType> {
    const now = new Date();
    const toSave = {
      ...thread,
      createdAt: thread.createdAt || now,
      updatedAt: now,
    };

    await this.db.query(
      `INSERT INTO mastra_threads {
        id: $id,
        resourceId: $resourceId,
        title: $title,
        metadata: $metadata,
        createdAt: $createdAt,
        updatedAt: $updatedAt
      } ON DUPLICATE KEY UPDATE
        title = $title,
        metadata = $metadata,
        updatedAt = time::now()`,
      toSave
    );

    return toSave;
  }

  async updateThread({
    id,
    title,
    metadata,
  }: {
    id: string;
    title: string;
    metadata: Record<string, unknown>;
  }): Promise<StorageThreadType> {
    const results = await this.db.query<[StorageThreadType[]]>(
      `UPDATE type::thing("mastra_threads", $id) SET title = $title, metadata = $metadata, updatedAt = time::now() RETURN AFTER`,
      { id, title, metadata }
    );
    const thread = results[0]?.[0];
    if (!thread) throw new Error(`Thread ${id} not found`);
    return {
      ...thread,
      id: normalizeId(thread.id),
      createdAt: ensureDate(thread.createdAt) || new Date(),
      updatedAt: ensureDate(thread.updatedAt) || new Date(),
    };
  }

  async deleteThread({ threadId }: { threadId: string }): Promise<void> {
    // Delete messages first
    await this.db.query('DELETE FROM mastra_messages WHERE threadId = $threadId', { threadId });
    // Delete thread using SurrealDB record syntax
    await this.db.query('DELETE type::thing("mastra_threads", $threadId)', { threadId });
  }

  // ============================================
  // MESSAGES
  // ============================================

  async getMessages(
    args: StorageGetMessagesArg & { format?: 'v1' | 'v2' }
  ): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    const { threadId, selectBy, format = 'v1' } = args;
    const limit = resolveMessageLimit({ last: selectBy?.last, defaultLimit: 100 });

    // Handle selectBy.include for cross-thread semantic recall
    // This is used when vector search returns messages from multiple threads
    if (selectBy?.include && selectBy.include.length > 0) {
      return this.getMessagesWithContext(selectBy.include);
    }

    const results = await this.db.query<[any[]]>(
      'SELECT * FROM mastra_messages WHERE threadId = $threadId ORDER BY createdAt ASC LIMIT $limit',
      { threadId, limit }
    );

    const messages = results[0] || [];
    return messages.map((m) => ({
      ...m,
      id: normalizeId(m.id),
      threadId: m.threadId,
      createdAt: ensureDate(m.createdAt) || new Date(),
    }));
  }

  /**
   * Get messages with surrounding context for semantic recall.
   * Supports cross-thread retrieval by fetching from each message's original thread.
   */
  private async getMessagesWithContext(
    includes: {
      id: string;
      threadId?: string;
      withPreviousMessages?: number;
      withNextMessages?: number;
    }[]
  ): Promise<any[]> {
    const allMessages: any[] = [];
    const seenIds = new Set<string>();

    for (const include of includes) {
      const { id, threadId, withPreviousMessages = 0, withNextMessages = 0 } = include;

      if (!threadId) {
        // If no threadId, just fetch the message directly using type::thing for record ID
        const results = await this.db.query<[any[]]>(
          'SELECT * FROM type::thing("mastra_messages", $id)',
          { id }
        );
        const msg = results[0]?.[0];
        if (msg && !seenIds.has(normalizeId(msg.id))) {
          seenIds.add(normalizeId(msg.id));
          allMessages.push({
            ...msg,
            id: normalizeId(msg.id),
            createdAt: ensureDate(msg.createdAt) || new Date(),
          });
        }
        continue;
      }

      // Get the target message using type::thing for record ID
      // Also filter by threadId for safety
      const targetResults = await this.db.query<[any[]]>(
        'SELECT * FROM type::thing("mastra_messages", $id) WHERE threadId = $threadId LIMIT 1',
        { id, threadId }
      );
      const targetMsg = targetResults[0]?.[0];
      if (!targetMsg) continue;

      const targetCreatedAt = targetMsg.createdAt;

      // Get context: messages before and after in the same thread
      // We query a window around the target message
      const contextResults = await this.db.query<[any[]]>(
        `SELECT * FROM mastra_messages
         WHERE threadId = $threadId
         ORDER BY createdAt ASC`,
        { threadId }
      );

      const threadMessages = contextResults[0] || [];

      // Find index of target message
      const targetIndex = threadMessages.findIndex(
        (m) => normalizeId(m.id) === id || m.id === id
      );

      if (targetIndex === -1) {
        // Target not found, just add what we have
        if (!seenIds.has(normalizeId(targetMsg.id))) {
          seenIds.add(normalizeId(targetMsg.id));
          allMessages.push({
            ...targetMsg,
            id: normalizeId(targetMsg.id),
            createdAt: ensureDate(targetMsg.createdAt) || new Date(),
          });
        }
        continue;
      }

      // Get messages in context window
      const startIndex = Math.max(0, targetIndex - withPreviousMessages);
      const endIndex = Math.min(threadMessages.length, targetIndex + withNextMessages + 1);

      for (let i = startIndex; i < endIndex; i++) {
        const msg = threadMessages[i];
        const msgId = normalizeId(msg.id);
        if (!seenIds.has(msgId)) {
          seenIds.add(msgId);
          allMessages.push({
            ...msg,
            id: msgId,
            createdAt: ensureDate(msg.createdAt) || new Date(),
          });
        }
      }
    }

    // Sort all messages by createdAt
    allMessages.sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    return allMessages;
  }

  async getMessagesById({
    messageIds,
    format = 'v1',
  }: {
    messageIds: string[];
    format?: 'v1' | 'v2';
  }): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    // Build query for multiple message IDs using SurrealDB record syntax
    const recordIds = messageIds.map(id => `type::thing("mastra_messages", "${id}")`).join(', ');
    const results = await this.db.query<[any[]]>(
      `SELECT * FROM [${recordIds}]`
    );
    return (results[0] || []).map((m) => ({
      ...m,
      id: normalizeId(m.id),
      createdAt: ensureDate(m.createdAt) || new Date(),
    }));
  }

  async getMessagesPaginated(
    args: StorageGetMessagesArg & { format?: 'v1' | 'v2' }
  ): Promise<PaginationInfo & { messages: MastraMessageV1[] | MastraMessageV2[] }> {
    const messages = await this.getMessages(args);
    return {
      messages,
      page: 1,
      perPage: messages.length,
      total: messages.length,
      hasMore: false,
    };
  }

  async saveMessages(
    args: { messages: MastraMessageV1[]; format?: 'v1' } | { messages: MastraMessageV2[]; format: 'v2' }
  ): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    const { messages } = args;
    const saved: any[] = [];

    for (const msg of messages) {
      const toSave = {
        ...msg,
        createdAt: (msg as any).createdAt || new Date(),
      };
      await this.db.query(
        `INSERT INTO mastra_messages {
          id: $id,
          threadId: $threadId,
          role: $role,
          content: $content,
          type: $type,
          createdAt: $createdAt
        } ON DUPLICATE KEY UPDATE
          content = $content`,
        toSave
      );
      saved.push(toSave);
    }

    return saved;
  }

  async updateMessages({
    messages,
  }: {
    messages: (Partial<Omit<MastraMessageV2, 'createdAt'>> & {
      id: string;
      content?: { metadata?: MastraMessageContentV2['metadata']; content?: MastraMessageContentV2['content'] };
    })[];
  }): Promise<MastraMessageV2[]> {
    const updated: MastraMessageV2[] = [];

    for (const msg of messages) {
      const results = await this.db.query<[MastraMessageV2[]]>(
        `UPDATE type::thing("mastra_messages", $id) SET content = $content RETURN AFTER`,
        { id: msg.id, content: msg.content }
      );
      if (results[0]?.[0]) {
        const m = results[0][0];
        updated.push({ ...m, id: normalizeId(m.id) } as MastraMessageV2);
      }
    }

    return updated;
  }

  async deleteMessages(messageIds: string[]): Promise<void> {
    for (const messageId of messageIds) {
      await this.db.query('DELETE type::thing("mastra_messages", $messageId)', { messageId });
    }
  }

  // ============================================
  // RESOURCES (Working Memory)
  // ============================================

  async getResourceById({
    resourceId,
  }: {
    resourceId: string;
  }): Promise<StorageResourceType | null> {
    const results = await this.db.query<[StorageResourceType[]]>(
      'SELECT * FROM mastra_resources WHERE resourceId = $resourceId LIMIT 1',
      { resourceId }
    );
    return results[0]?.[0] || null;
  }

  async saveResource({
    resource,
  }: {
    resource: StorageResourceType;
  }): Promise<StorageResourceType> {
    const now = new Date();
    const toSave = {
      ...resource,
      createdAt: resource.createdAt || now,
      updatedAt: now,
    };

    await this.db.query(
      `INSERT INTO mastra_resources {
        resourceId: $resourceId,
        workingMemory: $workingMemory,
        metadata: $metadata,
        createdAt: $createdAt,
        updatedAt: $updatedAt
      } ON DUPLICATE KEY UPDATE
        workingMemory = $workingMemory,
        metadata = $metadata,
        updatedAt = time::now()`,
      toSave
    );

    return toSave;
  }

  async updateResource({
    resourceId,
    workingMemory,
    metadata,
  }: {
    resourceId: string;
    workingMemory?: string;
    metadata?: Record<string, unknown>;
  }): Promise<StorageResourceType> {
    const updates: string[] = [];
    const params: Record<string, any> = { resourceId };

    if (workingMemory !== undefined) {
      updates.push('workingMemory = $workingMemory');
      params.workingMemory = workingMemory;
    }
    if (metadata !== undefined) {
      updates.push('metadata = $metadata');
      params.metadata = metadata;
    }
    updates.push('updatedAt = time::now()');

    const results = await this.db.query<[StorageResourceType[]]>(
      `UPDATE mastra_resources SET ${updates.join(', ')} WHERE resourceId = $resourceId RETURN AFTER`,
      params
    );

    const resource = results[0]?.[0];
    if (!resource) throw new Error(`Resource ${resourceId} not found`);
    return resource;
  }
}

export default MemorySurreal;
