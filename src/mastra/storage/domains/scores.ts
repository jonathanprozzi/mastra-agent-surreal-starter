/**
 * Scores Domain for SurrealDB Storage
 *
 * Handles evaluations and scoring data.
 */

import type Surreal from 'surrealdb';
import type {
  EvalRow,
  PaginationInfo,
  PaginationArgs,
  StoragePagination,
} from '@mastra/core/storage';
import type { ScoreRowData, ScoringSource } from '@mastra/core/scores';

export class ScoresSurreal {
  constructor(private db: Surreal) {}

  // ============================================
  // EVALS
  // ============================================

  async getEvalsByAgentName(agentName: string, type?: 'test' | 'live'): Promise<EvalRow[]> {
    let query = 'SELECT * FROM mastra_evals WHERE agentName = $agentName';
    const params: Record<string, any> = { agentName };

    if (type) {
      query += ' AND type = $type';
      params.type = type;
    }

    query += ' ORDER BY createdAt DESC';

    const results = await this.db.query<[EvalRow[]]>(query, params);
    return results[0] || [];
  }

  async getEvals(
    options?: { agentName?: string; type?: 'test' | 'live' } & PaginationArgs
  ): Promise<PaginationInfo & { evals: EvalRow[] }> {
    const { agentName, type, page = 1, perPage = 100 } = options || {};
    const offset = (page - 1) * perPage;

    let query = 'SELECT * FROM mastra_evals WHERE 1=1';
    const params: Record<string, any> = { limit: perPage, offset };

    if (agentName) {
      query += ' AND agentName = $agentName';
      params.agentName = agentName;
    }
    if (type) {
      query += ' AND type = $type';
      params.type = type;
    }

    query += ' ORDER BY createdAt DESC LIMIT $limit START $offset';

    const results = await this.db.query<[EvalRow[]]>(query, params);
    const evals = results[0] || [];

    return {
      evals,
      page,
      perPage,
      total: evals.length,
      hasMore: evals.length === perPage,
    };
  }

  // ============================================
  // SCORES
  // ============================================

  async getScoreById({ id }: { id: string }): Promise<ScoreRowData | null> {
    const results = await this.db.query<[ScoreRowData[]]>(
      'SELECT * FROM mastra_scores WHERE id = $id LIMIT 1',
      { id }
    );
    return results[0]?.[0] || null;
  }

  async saveScore(score: ScoreRowData): Promise<{ score: ScoreRowData }> {
    const toSave = {
      ...score,
      createdAt: score.createdAt || new Date(),
      updatedAt: new Date(),
    };
    await this.db.create('mastra_scores', toSave);
    return { score: toSave };
  }

  async getScoresByScorerId({
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
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    const { page = 1, perPage = 100 } = pagination;
    const offset = (page - 1) * perPage;

    let query = 'SELECT * FROM mastra_scores WHERE scorerId = $scorerId';
    const params: Record<string, any> = { scorerId, limit: perPage, offset };

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
      pagination: { page, perPage, total: scores.length, hasMore: scores.length === perPage },
      scores,
    };
  }

  async getScoresByRunId({
    runId,
    pagination,
  }: {
    runId: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    const { page = 1, perPage = 100 } = pagination;
    const offset = (page - 1) * perPage;

    const results = await this.db.query<[ScoreRowData[]]>(
      'SELECT * FROM mastra_scores WHERE runId = $runId ORDER BY createdAt DESC LIMIT $limit START $offset',
      { runId, limit: perPage, offset }
    );
    const scores = results[0] || [];

    return {
      pagination: { page, perPage, total: scores.length, hasMore: scores.length === perPage },
      scores,
    };
  }

  async getScoresByEntityId({
    entityId,
    entityType,
    pagination,
  }: {
    entityId: string;
    entityType: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    const { page = 1, perPage = 100 } = pagination;
    const offset = (page - 1) * perPage;

    const results = await this.db.query<[ScoreRowData[]]>(
      'SELECT * FROM mastra_scores WHERE entityId = $entityId AND entityType = $entityType ORDER BY createdAt DESC LIMIT $limit START $offset',
      { entityId, entityType, limit: perPage, offset }
    );
    const scores = results[0] || [];

    return {
      pagination: { page, perPage, total: scores.length, hasMore: scores.length === perPage },
      scores,
    };
  }
}

export default ScoresSurreal;
