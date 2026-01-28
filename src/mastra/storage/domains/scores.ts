/**
 * Scores Domain for SurrealDB Storage
 *
 * Handles scoring data for evaluations.
 * Extends ScoresStorage from @mastra/core for v1 compatibility.
 */

import type Surreal from 'surrealdb';
import { ScoresStorage } from '@mastra/core/storage';
import type { StoragePagination } from '@mastra/core/storage';
import type {
  ScoreRowData,
  SaveScorePayload,
  ListScoresResponse,
  ScoringSource,
} from '@mastra/core/evals';

export class ScoresSurreal extends ScoresStorage {
  constructor(private db: Surreal) {
    super();
  }

  async dangerouslyClearAll(): Promise<void> {
    await this.db.query('DELETE FROM mastra_scores');
  }

  async getScoreById({ id }: { id: string }): Promise<ScoreRowData | null> {
    const results = await this.db.query<[ScoreRowData[]]>(
      'SELECT * FROM mastra_scores WHERE id = $id LIMIT 1',
      { id }
    );
    return results[0]?.[0] || null;
  }

  async saveScore(score: SaveScorePayload): Promise<{ score: ScoreRowData }> {
    const now = new Date();
    const toSave = {
      ...score,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.create('mastra_scores', toSave);
    return { score: toSave as ScoreRowData };
  }

  async listScoresByScorerId({
    scorerId,
    pagination,
    entityId,
    entityType,
    source,
  }: {
    scorerId: string;
    pagination: StoragePagination;
    entityId?: string;
    entityType?: string;
    source?: ScoringSource;
  }): Promise<ListScoresResponse> {
    const { page, perPage } = pagination;
    const limit = perPage === false ? Number.MAX_SAFE_INTEGER : perPage;
    const offset = page * (perPage === false ? 0 : perPage);

    let query = 'SELECT * FROM mastra_scores WHERE scorerId = $scorerId';
    const params: Record<string, any> = { scorerId, limit, offset };

    if (entityId) {
      query += ' AND entityId = $entityId';
      params.entityId = entityId;
    }
    if (entityType) {
      query += ' AND entityType = $entityType';
      params.entityType = entityType;
    }
    if (source) {
      query += ' AND source = $source';
      params.source = source;
    }

    query += ' ORDER BY createdAt DESC LIMIT $limit START $offset';

    const results = await this.db.query<[ScoreRowData[]]>(query, params);
    const scores = results[0] || [];

    return {
      pagination: {
        page,
        perPage,
        total: scores.length,
        hasMore: perPage !== false && scores.length === perPage,
      },
      scores,
    };
  }

  async listScoresByRunId({
    runId,
    pagination,
  }: {
    runId: string;
    pagination: StoragePagination;
  }): Promise<ListScoresResponse> {
    const { page, perPage } = pagination;
    const limit = perPage === false ? Number.MAX_SAFE_INTEGER : perPage;
    const offset = page * (perPage === false ? 0 : perPage);

    const results = await this.db.query<[ScoreRowData[]]>(
      'SELECT * FROM mastra_scores WHERE runId = $runId ORDER BY createdAt DESC LIMIT $limit START $offset',
      { runId, limit, offset }
    );
    const scores = results[0] || [];

    return {
      pagination: {
        page,
        perPage,
        total: scores.length,
        hasMore: perPage !== false && scores.length === perPage,
      },
      scores,
    };
  }

  async listScoresByEntityId({
    entityId,
    entityType,
    pagination,
  }: {
    entityId: string;
    entityType: string;
    pagination: StoragePagination;
  }): Promise<ListScoresResponse> {
    const { page, perPage } = pagination;
    const limit = perPage === false ? Number.MAX_SAFE_INTEGER : perPage;
    const offset = page * (perPage === false ? 0 : perPage);

    const results = await this.db.query<[ScoreRowData[]]>(
      'SELECT * FROM mastra_scores WHERE entityId = $entityId AND entityType = $entityType ORDER BY createdAt DESC LIMIT $limit START $offset',
      { entityId, entityType, limit, offset }
    );
    const scores = results[0] || [];

    return {
      pagination: {
        page,
        perPage,
        total: scores.length,
        hasMore: perPage !== false && scores.length === perPage,
      },
      scores,
    };
  }
}

export default ScoresSurreal;
