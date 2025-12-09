/**
 * Observability Domain for SurrealDB Storage
 *
 * Handles traces and spans for debugging/monitoring.
 */

import type Surreal from 'surrealdb';
import type {
  StorageGetTracesArg,
  PaginationInfo,
  StorageGetTracesPaginatedArg,
} from '@mastra/core/storage';
import type { Trace } from '@mastra/core/telemetry';

export class ObservabilitySurreal {
  constructor(private db: Surreal) {}

  async getTraces(args: StorageGetTracesArg): Promise<Trace[]> {
    const { name, scope, page = 1, perPage = 100 } = args;
    const offset = (page - 1) * perPage;

    let query = 'SELECT * FROM mastra_traces WHERE 1=1';
    const params: Record<string, any> = { limit: perPage, offset };

    if (name) {
      query += ' AND name = $name';
      params.name = name;
    }
    if (scope) {
      query += ' AND scope = $scope';
      params.scope = scope;
    }

    query += ' ORDER BY createdAt DESC LIMIT $limit START $offset';

    const results = await this.db.query<[Trace[]]>(query, params);
    return results[0] || [];
  }

  async getTracesPaginated(
    args: StorageGetTracesPaginatedArg
  ): Promise<PaginationInfo & { traces: Trace[] }> {
    const page = args.page ?? 1;
    const perPage = args.perPage ?? 100;
    const traces = await this.getTraces({ ...args, page, perPage });
    return {
      traces,
      page,
      perPage,
      total: traces.length,
      hasMore: traces.length === perPage,
    };
  }

  async batchTraceInsert({ records }: { records: Record<string, any>[] }): Promise<void> {
    for (const record of records) {
      await this.db.create('mastra_traces', {
        ...record,
        createdAt: new Date(),
      });
    }
  }
}

export default ObservabilitySurreal;
