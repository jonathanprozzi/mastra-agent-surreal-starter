/**
 * Observability Domain for SurrealDB Storage
 *
 * Handles traces and spans for debugging/monitoring.
 * Extends ObservabilityStorage from @mastra/core for v1 compatibility.
 *
 * Note: v1 introduces a new span-based API. This implementation provides
 * basic support - additional methods can be implemented as needed.
 */

import type Surreal from 'surrealdb';
import {
  ObservabilityStorage,
  TABLE_SPANS,
  type CreateSpanArgs,
  type UpdateSpanArgs,
  type GetSpanArgs,
  type GetSpanResponse,
  type GetRootSpanArgs,
  type GetRootSpanResponse,
  type GetTraceArgs,
  type GetTraceResponse,
  type ListTracesArgs,
  type ListTracesResponse,
  type BatchCreateSpansArgs,
  type BatchUpdateSpansArgs,
  type BatchDeleteTracesArgs,
} from '@mastra/core/storage';
import { ensureDate } from '../shared/utils';

export class ObservabilitySurreal extends ObservabilityStorage {
  constructor(private db: Surreal) {
    super();
  }

  async dangerouslyClearAll(): Promise<void> {
    await this.db.query(`DELETE FROM ${TABLE_SPANS}`);
  }

  public override get tracingStrategy(): {
    preferred: 'batch-with-updates';
    supported: ('batch-with-updates' | 'insert-only')[];
  } {
    return {
      preferred: 'batch-with-updates',
      supported: ['batch-with-updates', 'insert-only'],
    };
  }

  /**
   * Create a single span record
   */
  async createSpan(args: CreateSpanArgs): Promise<void> {
    const now = new Date();
    await this.db.create(TABLE_SPANS, {
      ...args.span,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Update a span with partial data
   */
  async updateSpan(args: UpdateSpanArgs): Promise<void> {
    const { traceId, spanId, updates } = args;
    const updateFields: string[] = ['updatedAt = time::now()'];
    const params: Record<string, unknown> = { traceId, spanId };

    const setField = (field: string, value: unknown) => {
      if (value !== undefined) {
        updateFields.push(`${field} = $${field}`);
        params[field] = value;
      }
    };

    setField('error', updates.error);
    setField('runId', updates.runId);
    setField('input', updates.input);
    setField('threadId', updates.threadId);
    setField('resourceId', updates.resourceId);
    setField('metadata', updates.metadata);
    setField('source', updates.source);
    setField('output', updates.output);
    setField('name', updates.name);
    setField('entityType', updates.entityType);
    setField('entityId', updates.entityId);
    setField('links', updates.links);
    setField('endedAt', updates.endedAt);
    setField('startedAt', updates.startedAt);
    setField('spanType', updates.spanType);
    setField('isEvent', updates.isEvent);
    setField('parentSpanId', updates.parentSpanId);
    setField('attributes', updates.attributes);
    setField('entityName', updates.entityName);
    setField('userId', updates.userId);
    setField('organizationId', updates.organizationId);
    setField('sessionId', updates.sessionId);
    setField('requestId', updates.requestId);
    setField('environment', updates.environment);
    setField('serviceName', updates.serviceName);
    setField('scope', updates.scope);
    setField('tags', updates.tags);

    await this.db.query(
      `UPDATE ${TABLE_SPANS} SET ${updateFields.join(', ')} WHERE traceId = $traceId AND spanId = $spanId`,
      params
    );
  }

  /**
   * Get a single span by traceId and spanId
   */
  async getSpan(args: GetSpanArgs): Promise<GetSpanResponse | null> {
    const { traceId, spanId } = args;
    const results = await this.db.query<[any[]]>(
      `SELECT * FROM ${TABLE_SPANS} WHERE traceId = $traceId AND spanId = $spanId LIMIT 1`,
      { traceId, spanId }
    );
    const span = results[0]?.[0];
    return span ? this.normalizeSpan(span) : null;
  }

  /**
   * Get the root span for a trace
   */
  async getRootSpan(args: GetRootSpanArgs): Promise<GetRootSpanResponse | null> {
    const { traceId } = args;
    const results = await this.db.query<[any[]]>(
      `SELECT * FROM ${TABLE_SPANS} WHERE traceId = $traceId AND parentSpanId = NONE LIMIT 1`,
      { traceId }
    );
    const span = results[0]?.[0];
    return span ? this.normalizeSpan(span) : null;
  }

  /**
   * Get a trace with all its spans
   */
  async getTrace(args: GetTraceArgs): Promise<GetTraceResponse | null> {
    const { traceId } = args;
    const results = await this.db.query<[any[]]>(
      `SELECT * FROM ${TABLE_SPANS} WHERE traceId = $traceId ORDER BY startedAt ASC`,
      { traceId }
    );
    const spans = results[0] || [];
    if (spans.length === 0) return null;
    return {
      traceId,
      spans: spans.map(span => this.normalizeSpan(span)),
    };
  }

  /**
   * List traces with optional filtering
   */
  async listTraces(args: ListTracesArgs): Promise<ListTracesResponse> {
    const filters = args?.filters ?? {};
    const pagination = args?.pagination ?? {};
    const orderBy = args?.orderBy ?? {};

    const page = pagination.page ?? 0;
    const perPage = pagination.perPage ?? 50;
    const limit = perPage;
    const offset = page * perPage;

    const where: string[] = ['parentSpanId = NONE'];
    const params: Record<string, any> = {};

    const addEquality = (field: string, value: unknown) => {
      if (value !== undefined) {
        where.push(`${field} = $${field}`);
        params[field] = value;
      }
    };

    addEquality('entityType', filters.entityType);
    addEquality('entityId', filters.entityId);
    addEquality('entityName', filters.entityName);
    addEquality('userId', filters.userId);
    addEquality('organizationId', filters.organizationId);
    addEquality('resourceId', filters.resourceId);
    addEquality('runId', filters.runId);
    addEquality('sessionId', filters.sessionId);
    addEquality('threadId', filters.threadId);
    addEquality('requestId', filters.requestId);
    addEquality('environment', filters.environment);
    addEquality('source', filters.source);
    addEquality('serviceName', filters.serviceName);
    addEquality('spanType', filters.spanType);

    if (filters.metadata) {
      this.validateObjectFilterKeys(filters.metadata, 'metadata');
      for (const [key, value] of Object.entries(filters.metadata)) {
        const paramKey = `metadata_${key}`;
        where.push(`metadata.${key} = $${paramKey}`);
        params[paramKey] = value;
      }
    }

    if (filters.scope) {
      this.validateObjectFilterKeys(filters.scope, 'scope');
      for (const [key, value] of Object.entries(filters.scope)) {
        const paramKey = `scope_${key}`;
        where.push(`scope.${key} = $${paramKey}`);
        params[paramKey] = value;
      }
    }

    if (filters.tags && filters.tags.length > 0) {
      filters.tags.forEach((tag, idx) => {
        const paramKey = `tag_${idx}`;
        where.push(`tags CONTAINS $${paramKey}`);
        params[paramKey] = tag;
      });
    }

    const applyDateRange = (
      field: string,
      range?: {
        start?: Date;
        end?: Date;
        startExclusive?: boolean;
        endExclusive?: boolean;
      }
    ) => {
      if (!range) return;
      if (range.start) {
        const op = range.startExclusive ? '>' : '>=';
        const paramKey = `${field}_start`;
        where.push(`${field} ${op} $${paramKey}`);
        params[paramKey] = range.start;
      }
      if (range.end) {
        const op = range.endExclusive ? '<' : '<=';
        const paramKey = `${field}_end`;
        where.push(`${field} ${op} $${paramKey}`);
        params[paramKey] = range.end;
      }
    };

    applyDateRange('startedAt', filters.startedAt);
    applyDateRange('endedAt', filters.endedAt);

    if (filters.status) {
      if (filters.status === 'error') {
        where.push('error != NONE');
      } else if (filters.status === 'success') {
        where.push('error = NONE');
        where.push('endedAt != NONE');
      } else if (filters.status === 'running') {
        where.push('endedAt = NONE');
      }
    }

    if (filters.hasChildError === true) {
      where.push(
        `traceId IN (SELECT traceId FROM ${TABLE_SPANS} WHERE error != NONE AND parentSpanId != NONE)`
      );
    } else if (filters.hasChildError === false) {
      where.push(
        `traceId NOT IN (SELECT traceId FROM ${TABLE_SPANS} WHERE error != NONE AND parentSpanId != NONE)`
      );
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const orderFieldInput = orderBy.field ?? 'startedAt';
    const orderField = orderFieldInput === 'endedAt' ? 'endedAt' : 'startedAt';
    const orderDirectionInput = orderBy.direction ?? 'DESC';
    const orderDirection = orderDirectionInput === 'ASC' ? 'ASC' : 'DESC';

    const countParams = { ...params };
    const countResults = await this.db.query<[{ count: number }[]]>(
      `SELECT count() as count FROM ${TABLE_SPANS} ${whereClause} GROUP ALL`,
      countParams
    );
    const total = countResults[0]?.[0]?.count || 0;

    const results = await this.db.query<[any[]]>(
      `SELECT * FROM ${TABLE_SPANS} ${whereClause} ORDER BY ${orderField} ${orderDirection} LIMIT $limit START $offset`,
      { ...params, limit, offset }
    );
    const spans = (results[0] || []).map(span => this.normalizeSpan(span));

    return {
      spans,
      pagination: {
        total,
        page,
        perPage,
        hasMore: offset + spans.length < total,
      },
    };
  }

  /**
   * Batch create multiple spans
   */
  async batchCreateSpans(args: BatchCreateSpansArgs): Promise<void> {
    const now = new Date();
    for (const span of args.records) {
      await this.db.create(TABLE_SPANS, {
        ...span,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  /**
   * Batch update multiple spans
   */
  async batchUpdateSpans(args: BatchUpdateSpansArgs): Promise<void> {
    for (const update of args.records) {
      await this.updateSpan(update);
    }
  }

  /**
   * Batch delete traces and their spans
   */
  async batchDeleteTraces(args: BatchDeleteTracesArgs): Promise<void> {
    for (const traceId of args.traceIds) {
      await this.db.query(`DELETE FROM ${TABLE_SPANS} WHERE traceId = $traceId`, { traceId });
    }
  }

  private normalizeSpan(span: any): any {
    return {
      ...span,
      createdAt: ensureDate(span.createdAt) || new Date(),
      updatedAt: ensureDate(span.updatedAt),
      startedAt: ensureDate(span.startedAt) || new Date(),
      endedAt: ensureDate(span.endedAt),
    };
  }

  private validateObjectFilterKeys(record: Record<string, unknown>, label: string): void {
    for (const key of Object.keys(record)) {
      if (!/^[A-Za-z0-9_]+$/.test(key)) {
        throw new Error(`${label} keys must contain only letters, numbers, or underscore`);
      }
    }
  }
}

export default ObservabilitySurreal;
