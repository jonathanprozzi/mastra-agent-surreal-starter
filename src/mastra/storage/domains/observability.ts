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
import { ObservabilityStorage } from '@mastra/core/storage/domains';
import type {
  CreateSpanArgs,
  UpdateSpanArgs,
  GetSpanArgs,
  GetSpanResponse,
  GetRootSpanArgs,
  GetRootSpanResponse,
  GetTraceArgs,
  GetTraceResponse,
  ListTracesArgs,
  ListTracesResponse,
  BatchCreateSpansArgs,
  BatchUpdateSpansArgs,
  BatchDeleteTracesArgs,
} from '@mastra/core/storage/domains/observability';

export class ObservabilitySurreal extends ObservabilityStorage {
  constructor(private db: Surreal) {
    super();
  }

  async dangerouslyClearAll(): Promise<void> {
    await this.db.query('DELETE FROM mastra_spans');
    await this.db.query('DELETE FROM mastra_traces');
  }

  /**
   * Create a single span record
   */
  async createSpan(args: CreateSpanArgs): Promise<void> {
    const now = new Date();
    await this.db.create('mastra_spans', {
      ...args.span,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Update a span with partial data
   */
  async updateSpan(args: UpdateSpanArgs): Promise<void> {
    const { traceId, spanId, span } = args;
    await this.db.query(
      `UPDATE mastra_spans SET
        output = $output,
        error = $error,
        endedAt = $endedAt,
        updatedAt = time::now()
      WHERE traceId = $traceId AND spanId = $spanId`,
      { traceId, spanId, ...span }
    );
  }

  /**
   * Get a single span by traceId and spanId
   */
  async getSpan(args: GetSpanArgs): Promise<GetSpanResponse | null> {
    const { traceId, spanId } = args;
    const results = await this.db.query<[any[]]>(
      'SELECT * FROM mastra_spans WHERE traceId = $traceId AND spanId = $spanId LIMIT 1',
      { traceId, spanId }
    );
    return results[0]?.[0] || null;
  }

  /**
   * Get the root span for a trace
   */
  async getRootSpan(args: GetRootSpanArgs): Promise<GetRootSpanResponse | null> {
    const { traceId } = args;
    const results = await this.db.query<[any[]]>(
      'SELECT * FROM mastra_spans WHERE traceId = $traceId AND parentSpanId = NONE LIMIT 1',
      { traceId }
    );
    return results[0]?.[0] || null;
  }

  /**
   * Get a trace with all its spans
   */
  async getTrace(args: GetTraceArgs): Promise<GetTraceResponse | null> {
    const { traceId } = args;
    const results = await this.db.query<[any[]]>(
      'SELECT * FROM mastra_spans WHERE traceId = $traceId ORDER BY startedAt ASC',
      { traceId }
    );
    const spans = results[0] || [];
    if (spans.length === 0) return null;

    const rootSpan = spans.find(s => !s.parentSpanId);
    return {
      traceId,
      spans,
      rootSpan: rootSpan || null,
    };
  }

  /**
   * List traces with optional filtering
   */
  async listTraces(args: ListTracesArgs): Promise<ListTracesResponse> {
    const {
      page = 0,
      perPage = 50,
      name,
      entityType,
      entityId,
      fromDate,
      toDate,
      status,
    } = args;

    const limit = perPage === false ? Number.MAX_SAFE_INTEGER : perPage;
    const offset = page * (perPage === false ? 0 : perPage);

    // Get distinct traces by querying root spans
    let query = 'SELECT * FROM mastra_spans WHERE parentSpanId = NONE';
    const params: Record<string, any> = { limit, offset };

    if (name) {
      query += ' AND name = $name';
      params.name = name;
    }
    if (entityType) {
      query += ' AND entityType = $entityType';
      params.entityType = entityType;
    }
    if (entityId) {
      query += ' AND entityId = $entityId';
      params.entityId = entityId;
    }
    if (fromDate) {
      query += ' AND startedAt >= $fromDate';
      params.fromDate = fromDate;
    }
    if (toDate) {
      query += ' AND startedAt <= $toDate';
      params.toDate = toDate;
    }
    if (status) {
      // Map status to span state
      if (status === 'error') {
        query += ' AND error != NONE';
      } else if (status === 'success') {
        query += ' AND error = NONE AND endedAt != NONE';
      } else if (status === 'running') {
        query += ' AND endedAt = NONE';
      }
    }

    query += ' ORDER BY startedAt DESC LIMIT $limit START $offset';

    const results = await this.db.query<[any[]]>(query, params);
    const rootSpans = results[0] || [];

    // Build traces from root spans
    const traces = rootSpans.map(rootSpan => ({
      traceId: rootSpan.traceId,
      rootSpan,
      spans: [rootSpan], // Just the root span for listing
    }));

    return {
      traces,
      pagination: {
        page,
        perPage: perPage === false ? false : perPage,
        total: traces.length,
        hasMore: perPage !== false && traces.length === perPage,
      },
    };
  }

  /**
   * Batch create multiple spans
   */
  async batchCreateSpans(args: BatchCreateSpansArgs): Promise<void> {
    const now = new Date();
    for (const span of args.spans) {
      await this.db.create('mastra_spans', {
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
    for (const update of args.spans) {
      await this.updateSpan(update);
    }
  }

  /**
   * Batch delete traces and their spans
   */
  async batchDeleteTraces(args: BatchDeleteTracesArgs): Promise<void> {
    for (const traceId of args.traceIds) {
      await this.db.query('DELETE FROM mastra_spans WHERE traceId = $traceId', { traceId });
    }
  }
}

export default ObservabilitySurreal;
