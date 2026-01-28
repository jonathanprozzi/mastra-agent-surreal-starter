/**
 * Memory Domain for SurrealDB Storage
 *
 * Handles threads, messages, and resources (working memory).
 * Extends MemoryStorage from @mastra/core for v1 compatibility.
 */

import type Surreal from 'surrealdb';
import { MemoryStorage } from '@mastra/core/storage';
import type {
  StorageResourceType,
  StorageListMessagesInput,
  StorageListMessagesOutput,
  StorageListThreadsInput,
  StorageListThreadsOutput,
  StorageCloneThreadInput,
  StorageCloneThreadOutput,
  ThreadCloneMetadata,
  PaginationInfo,
} from '@mastra/core/storage';
import type { StorageThreadType } from '@mastra/core/memory';
import type { MastraDBMessage, MastraMessageContentV2 } from '@mastra/core/agent';
import { normalizeId, ensureDate } from '../shared/utils';

export class MemorySurreal extends MemoryStorage {
  constructor(private db: Surreal) {
    super();
  }

  async dangerouslyClearAll(): Promise<void> {
    await this.db.query('DELETE FROM mastra_threads');
    await this.db.query('DELETE FROM mastra_messages');
    await this.db.query('DELETE FROM mastra_resources');
  }

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

  async listThreads(
    args: StorageListThreadsInput
  ): Promise<StorageListThreadsOutput> {
    const {
      page = 0,
      perPage = 100,
      orderBy,
      filter,
    } = args;

    this.validatePaginationInput(page, perPage);

    const { field, direction } = this.parseOrderBy(orderBy);
    const offset = page * (perPage === false ? 0 : perPage);
    const limit = perPage === false ? Number.MAX_SAFE_INTEGER : perPage;

    let query = 'SELECT * FROM mastra_threads WHERE 1=1';
    const params: Record<string, any> = { limit, offset };

    if (filter?.resourceId) {
      query += ' AND resourceId = $resourceId';
      params.resourceId = filter.resourceId;
    }

    if (filter?.metadata) {
      this.validateMetadataKeys(filter.metadata);
      for (const [key, value] of Object.entries(filter.metadata)) {
        query += ` AND metadata.${key} = $meta_${key}`;
        params[`meta_${key}`] = value;
      }
    }

    query += ` ORDER BY ${field} ${direction.toUpperCase()} LIMIT $limit START $offset`;

    // Get total count
    let countQuery = 'SELECT count() as count FROM mastra_threads WHERE 1=1';
    if (filter?.resourceId) {
      countQuery += ' AND resourceId = $resourceId';
    }
    countQuery += ' GROUP ALL';
    const countResults = await this.db.query<[{ count: number }[]]>(countQuery, params);
    const total = countResults[0]?.[0]?.count || 0;

    // Get paginated results
    const results = await this.db.query<[StorageThreadType[]]>(query, params);

    const threads = (results[0] || []).map((t) => ({
      ...t,
      id: normalizeId(t.id),
      createdAt: ensureDate(t.createdAt) || new Date(),
      updatedAt: ensureDate(t.updatedAt) || new Date(),
    }));

    return {
      threads,
      page,
      perPage: perPage === false ? false : perPage,
      total,
      hasMore: perPage !== false && offset + threads.length < total,
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

  async listMessages(args: StorageListMessagesInput): Promise<StorageListMessagesOutput> {
    const {
      threadId,
      resourceId,
      include,
      perPage = 40,
      page = 0,
      filter,
      orderBy,
    } = args;

    this.validatePaginationInput(page, perPage);

    const { field, direction } = this.parseOrderBy(orderBy, 'ASC');
    const limit = perPage === false ? Number.MAX_SAFE_INTEGER : perPage;
    const offset = page * (perPage === false ? 0 : perPage);

    // Handle array of threadIds
    const threadIds = (Array.isArray(threadId) ? threadId : [threadId]).filter(
      (id): id is string => typeof id === 'string' && id.trim().length > 0
    );

    if (threadIds.length === 0) {
      throw new Error('threadId must be a non-empty string or array of non-empty strings');
    }

    let query = 'SELECT * FROM mastra_messages WHERE threadId IN $threadIds';
    const params: Record<string, any> = { threadIds, limit, offset };

    if (resourceId) {
      query += ' AND resourceId = $resourceId';
      params.resourceId = resourceId;
    }

    if (filter?.dateRange) {
      if (filter.dateRange.start) {
        const op = filter.dateRange.startExclusive ? '>' : '>=';
        query += ` AND createdAt ${op} $startDate`;
        params.startDate = filter.dateRange.start;
      }
      if (filter.dateRange.end) {
        const op = filter.dateRange.endExclusive ? '<' : '<=';
        query += ` AND createdAt ${op} $endDate`;
        params.endDate = filter.dateRange.end;
      }
    }

    query += ` ORDER BY ${field} ${direction.toUpperCase()} LIMIT $limit START $offset`;

    const results = await this.db.query<[any[]]>(query, params);
    const messages = (results[0] || []).map((m) => ({
      ...m,
      id: normalizeId(m.id),
      threadId: m.threadId,
      createdAt: ensureDate(m.createdAt) || new Date(),
    }));

    // Get total count
    let countQuery = 'SELECT count() as count FROM mastra_messages WHERE threadId IN $threadIds';
    const countParams: Record<string, any> = { threadIds };
    if (resourceId) {
      countQuery += ' AND resourceId = $resourceId';
      countParams.resourceId = resourceId;
    }
    if (filter?.dateRange) {
      if (filter.dateRange.start) {
        const op = filter.dateRange.startExclusive ? '>' : '>=';
        countQuery += ` AND createdAt ${op} $startDate`;
        countParams.startDate = filter.dateRange.start;
      }
      if (filter.dateRange.end) {
        const op = filter.dateRange.endExclusive ? '<' : '<=';
        countQuery += ` AND createdAt ${op} $endDate`;
        countParams.endDate = filter.dateRange.end;
      }
    }
    countQuery += ' GROUP ALL';
    const countResults = await this.db.query<[{ count: number }[]]>(countQuery, countParams);
    const total = countResults[0]?.[0]?.count || 0;

    // Merge in included messages for semantic recall
    if (include && include.length > 0) {
      const includeMessages = await this.getMessagesWithContext(include);
      const seen = new Set(messages.map((m) => normalizeId(m.id)));
      for (const msg of includeMessages) {
        const msgId = normalizeId(msg.id);
        if (!seen.has(msgId)) {
          seen.add(msgId);
          messages.push(msg);
        }
      }
      messages.sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }

    return {
      messages,
      page,
      perPage: perPage === false ? false : perPage,
      total,
      hasMore: perPage !== false && offset + messages.length < total,
    };
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
  ): Promise<MastraDBMessage[]> {
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
      const targetResults = await this.db.query<[any[]]>(
        'SELECT * FROM type::thing("mastra_messages", $id) WHERE threadId = $threadId LIMIT 1',
        { id, threadId }
      );
      const targetMsg = targetResults[0]?.[0];
      if (!targetMsg) continue;

      // Get context: messages before and after in the same thread
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

  async listMessagesById({
    messageIds,
  }: {
    messageIds: string[];
  }): Promise<{ messages: MastraDBMessage[] }> {
    // Build query for multiple message IDs using SurrealDB record syntax
    const recordIds = messageIds.map(id => `type::thing("mastra_messages", "${id}")`).join(', ');
    const results = await this.db.query<[any[]]>(
      `SELECT * FROM [${recordIds}]`
    );
    const messages = (results[0] || []).map((m) => ({
      ...m,
      id: normalizeId(m.id),
      createdAt: ensureDate(m.createdAt) || new Date(),
    }));
    return { messages };
  }

  async saveMessages(args: { messages: MastraDBMessage[] }): Promise<{ messages: MastraDBMessage[] }> {
    const { messages } = args;
    const saved: MastraDBMessage[] = [];

    if (messages.length === 0) {
      return { messages: [] };
    }

    const threadId = messages[0]?.threadId;
    if (!threadId) {
      throw new Error('Thread ID is required to save messages');
    }

    const thread = await this.getThreadById({ threadId });
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`);
    }

    const now = new Date();

    for (const msg of messages) {
      const messageResourceId = msg.resourceId || thread.resourceId;
      if (!messageResourceId) {
        throw new Error('Resource ID is required to save messages');
      }

      const toSave = {
        ...msg,
        resourceId: messageResourceId,
        createdAt: (msg as any).createdAt || now,
      };
      await this.db.query(
        `INSERT INTO mastra_messages {
          id: $id,
          threadId: $threadId,
          resourceId: $resourceId,
          role: $role,
          content: $content,
          type: $type,
          createdAt: $createdAt
        } ON DUPLICATE KEY UPDATE
          threadId = $threadId,
          resourceId = $resourceId,
          role = $role,
          type = $type,
          content = $content`,
        toSave
      );
      saved.push(toSave);
    }

    await this.db.query(
      'UPDATE type::thing("mastra_threads", $threadId) SET updatedAt = time::now()',
      { threadId }
    );

    return { messages: saved };
  }

  async updateMessages({
    messages,
  }: {
    messages: (Partial<Omit<MastraDBMessage, 'createdAt'>> & {
      id: string;
      content?: { metadata?: MastraMessageContentV2['metadata']; content?: MastraMessageContentV2['content'] };
    })[];
  }): Promise<MastraDBMessage[]> {
    const updated: MastraDBMessage[] = [];

    for (const msg of messages) {
      const results = await this.db.query<[MastraDBMessage[]]>(
        `UPDATE type::thing("mastra_messages", $id) SET content = $content RETURN AFTER`,
        { id: msg.id, content: msg.content }
      );
      if (results[0]?.[0]) {
        const m = results[0][0];
        updated.push({ ...m, id: normalizeId(m.id) } as MastraDBMessage);
      }
    }

    return updated;
  }

  async deleteMessages(messageIds: string[]): Promise<void> {
    for (const messageId of messageIds) {
      await this.db.query('DELETE type::thing("mastra_messages", $messageId)', { messageId });
    }
  }

  async cloneThread(args: StorageCloneThreadInput): Promise<StorageCloneThreadOutput> {
    const {
      sourceThreadId,
      newThreadId: providedThreadId,
      resourceId,
      title,
      metadata,
      options,
    } = args;

    const sourceThread = await this.getThreadById({ threadId: sourceThreadId });
    if (!sourceThread) {
      throw new Error(`Source thread with id ${sourceThreadId} not found`);
    }

    const newThreadId = providedThreadId || crypto.randomUUID();
    const existingThread = await this.getThreadById({ threadId: newThreadId });
    if (existingThread) {
      throw new Error(`Thread with id ${newThreadId} already exists`);
    }

    let query = 'SELECT * FROM mastra_messages WHERE threadId = $threadId';
    const params: Record<string, any> = { threadId: sourceThreadId };

    if (options?.messageFilter?.startDate) {
      query += ' AND createdAt >= $startDate';
      params.startDate = options.messageFilter.startDate;
    }
    if (options?.messageFilter?.endDate) {
      query += ' AND createdAt <= $endDate';
      params.endDate = options.messageFilter.endDate;
    }
    if (options?.messageFilter?.messageIds && options.messageFilter.messageIds.length > 0) {
      query += ' AND id IN $messageIds';
      params.messageIds = options.messageFilter.messageIds;
    }

    const useLimit = typeof options?.messageLimit === 'number' && options.messageLimit > 0;
    query += ` ORDER BY createdAt ${useLimit ? 'DESC' : 'ASC'}`;
    if (useLimit) {
      query += ' LIMIT $limit';
      params.limit = options!.messageLimit!;
    }

    const results = await this.db.query<[any[]]>(query, params);
    let sourceMessages = results[0] || [];
    if (useLimit) {
      sourceMessages = sourceMessages.reverse();
    }

    const now = new Date();
    const lastMessageId =
      sourceMessages.length > 0 ? normalizeId(sourceMessages[sourceMessages.length - 1]?.id) : undefined;

    const cloneMetadata: ThreadCloneMetadata = {
      sourceThreadId,
      clonedAt: now,
      ...(lastMessageId && { lastMessageId }),
    };

    const newThread: StorageThreadType = {
      id: newThreadId,
      resourceId: resourceId || sourceThread.resourceId,
      title: title || (sourceThread.title ? `Clone of ${sourceThread.title}` : undefined),
      metadata: {
        ...(metadata || {}),
        clone: cloneMetadata,
      },
      createdAt: now,
      updatedAt: now,
    };

    await this.saveThread({ thread: newThread });

    const clonedMessages: MastraDBMessage[] = [];
    const targetResourceId = resourceId || sourceThread.resourceId;

    for (const msg of sourceMessages) {
      const newMessageId = crypto.randomUUID();
      const createdAt = ensureDate(msg.createdAt) || new Date();

      const clonedMessage: MastraDBMessage = {
        id: newMessageId,
        threadId: newThreadId,
        content: msg.content,
        role: msg.role,
        type: msg.type,
        createdAt,
        resourceId: targetResourceId,
      };

      await this.db.query(
        `INSERT INTO mastra_messages {
          id: $id,
          threadId: $threadId,
          resourceId: $resourceId,
          role: $role,
          content: $content,
          type: $type,
          createdAt: $createdAt
        }`,
        clonedMessage
      );

      clonedMessages.push(clonedMessage);
    }

    return {
      thread: newThread,
      clonedMessages,
    };
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
      // StorageResourceType uses 'id' as the resource identifier
      resourceId: resource.id,
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
    // Check if resource exists first
    const existing = await this.getResourceById({ resourceId });

    // If resource doesn't exist, create it (upsert pattern like PG store)
    if (!existing) {
      const newResource: StorageResourceType = {
        id: resourceId,
        workingMemory,
        metadata: metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return this.saveResource({ resource: newResource });
    }

    // Resource exists, update it
    const updates: string[] = [];
    const params: Record<string, any> = { resourceId };

    if (workingMemory !== undefined) {
      updates.push('workingMemory = $workingMemory');
      params.workingMemory = workingMemory;
    }
    if (metadata !== undefined) {
      // Merge metadata like PG store does
      updates.push('metadata = $metadata');
      params.metadata = { ...existing.metadata, ...metadata };
    }
    updates.push('updatedAt = time::now()');

    const results = await this.db.query<[StorageResourceType[]]>(
      `UPDATE mastra_resources SET ${updates.join(', ')} WHERE resourceId = $resourceId RETURN AFTER`,
      params
    );

    return results[0]?.[0] || existing;
  }
}

export default MemorySurreal;
