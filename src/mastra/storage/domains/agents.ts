/**
 * Agents Domain for SurrealDB Storage
 *
 * Handles agent configurations and persistence.
 * Extends AgentsStorage from @mastra/core for v1 compatibility.
 */

import type Surreal from 'surrealdb';
import { AgentsStorage } from '@mastra/core/storage/domains';
import type {
  StorageAgentType,
  StorageCreateAgentInput,
  StorageUpdateAgentInput,
  StorageListAgentsInput,
  StorageListAgentsOutput,
} from '@mastra/core/storage';
import { normalizeId, ensureDate } from '../shared/utils';

export class AgentsSurreal extends AgentsStorage {
  constructor(private db: Surreal) {
    super();
  }

  async dangerouslyClearAll(): Promise<void> {
    await this.db.query('DELETE FROM mastra_agents');
  }

  /**
   * Initialize the agents table (called during store init)
   */
  async init(): Promise<void> {
    // Table is created via schema.surql, but we can ensure it exists
    await this.db.query(`
      DEFINE TABLE IF NOT EXISTS mastra_agents SCHEMALESS PERMISSIONS FULL;
      DEFINE INDEX IF NOT EXISTS idx_agents_id ON mastra_agents FIELDS id UNIQUE;
      DEFINE INDEX IF NOT EXISTS idx_agents_name ON mastra_agents FIELDS name;
    `);
  }

  /**
   * Get an agent by ID
   */
  async getAgentById({ id }: { id: string }): Promise<StorageAgentType | null> {
    const results = await this.db.query<[any[]]>(
      'SELECT * FROM type::thing("mastra_agents", $id)',
      { id }
    );
    const agent = results[0]?.[0];
    if (!agent) return null;
    return this.normalizeAgent(agent);
  }

  /**
   * Create a new agent
   */
  async createAgent({ agent }: { agent: StorageCreateAgentInput }): Promise<StorageAgentType> {
    const now = new Date();
    const toSave = {
      ...agent,
      createdAt: now,
      updatedAt: now,
    };

    const results = await this.db.query<[any[]]>(
      `INSERT INTO mastra_agents $agent`,
      { agent: toSave }
    );

    const saved = results[0]?.[0];
    if (!saved) throw new Error('Failed to create agent');
    return this.normalizeAgent(saved);
  }

  /**
   * Update an existing agent
   */
  async updateAgent({
    id,
    ...updates
  }: StorageUpdateAgentInput): Promise<StorageAgentType> {
    const existing = await this.getAgentById({ id });
    if (!existing) throw new Error(`Agent not found: ${id}`);

    const now = new Date();
    const updateFields: string[] = ['updatedAt = $now'];
    const params: Record<string, unknown> = { id, now };

    // Build dynamic update query
    if (updates.name !== undefined) {
      updateFields.push('name = $name');
      params.name = updates.name;
    }
    if (updates.description !== undefined) {
      updateFields.push('description = $description');
      params.description = updates.description;
    }
    if (updates.instructions !== undefined) {
      updateFields.push('instructions = $instructions');
      params.instructions = updates.instructions;
    }
    if (updates.model !== undefined) {
      updateFields.push('model = $model');
      params.model = updates.model;
    }
    if (updates.tools !== undefined) {
      updateFields.push('tools = $tools');
      params.tools = updates.tools;
    }
    if (updates.defaultOptions !== undefined) {
      updateFields.push('defaultOptions = $defaultOptions');
      params.defaultOptions = updates.defaultOptions;
    }
    if (updates.workflows !== undefined) {
      updateFields.push('workflows = $workflows');
      params.workflows = updates.workflows;
    }
    if (updates.agents !== undefined) {
      updateFields.push('agents = $agents');
      params.agents = updates.agents;
    }
    if (updates.inputProcessors !== undefined) {
      updateFields.push('inputProcessors = $inputProcessors');
      params.inputProcessors = updates.inputProcessors;
    }
    if (updates.outputProcessors !== undefined) {
      updateFields.push('outputProcessors = $outputProcessors');
      params.outputProcessors = updates.outputProcessors;
    }
    if (updates.memory !== undefined) {
      updateFields.push('memory = $memory');
      params.memory = updates.memory;
    }
    if (updates.scorers !== undefined) {
      updateFields.push('scorers = $scorers');
      params.scorers = updates.scorers;
    }
    if (updates.metadata !== undefined) {
      updateFields.push('metadata = $metadata');
      params.metadata = updates.metadata;
    }

    const results = await this.db.query<[any[]]>(
      `UPDATE type::thing("mastra_agents", $id) SET ${updateFields.join(', ')}`,
      params
    );

    const updated = results[0]?.[0];
    if (!updated) throw new Error(`Failed to update agent: ${id}`);
    return this.normalizeAgent(updated);
  }

  /**
   * Delete an agent
   */
  async deleteAgent({ id }: { id: string }): Promise<void> {
    await this.db.query(
      'DELETE type::thing("mastra_agents", $id)',
      { id }
    );
  }

  /**
   * List agents with pagination
   */
  async listAgents(args?: StorageListAgentsInput): Promise<StorageListAgentsOutput> {
    const {
      page = 0,
      perPage = 100,
      orderBy,
    } = args || {};

    const { field, direction } = this.parseOrderBy(orderBy);
    const limit = perPage === false ? Number.MAX_SAFE_INTEGER : perPage;
    const offset = page * (perPage === false ? 0 : perPage);

    // Get total count
    const countResult = await this.db.query<[{ count: number }[]]>(
      'SELECT count() as count FROM mastra_agents GROUP ALL'
    );
    const total = countResult[0]?.[0]?.count || 0;

    // Get paginated results
    const results = await this.db.query<[any[]]>(
      `SELECT * FROM mastra_agents
       ORDER BY ${field} ${direction.toUpperCase()}
       LIMIT $limit START $offset`,
      { limit, offset }
    );

    const agents = (results[0] || []).map((a) => this.normalizeAgent(a));

    return {
      agents,
      page,
      perPage: perPage === false ? false : perPage,
      total,
      hasMore: perPage !== false && offset + agents.length < total,
    };
  }

  private normalizeAgent(agent: any): StorageAgentType {
    return {
      ...agent,
      id: normalizeId(agent.id),
      createdAt: ensureDate(agent.createdAt) || new Date(),
      updatedAt: ensureDate(agent.updatedAt) || new Date(),
    };
  }
}

export default AgentsSurreal;
