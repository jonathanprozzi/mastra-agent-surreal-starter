/**
 * Agents Domain for SurrealDB Storage
 *
 * Handles agent configurations and persistence.
 * Follows Mastra's AgentsPG pattern for consistency.
 */

import type Surreal from 'surrealdb';
import { normalizeId, ensureDate } from '../shared/utils';

/**
 * Agent record stored in SurrealDB
 * Matches the structure from @mastra/core
 */
export interface StoredAgent {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  model?: string; // JSON serialized
  tools?: string; // JSON serialized
  defaultOptions?: string; // JSON serialized
  workflows?: string; // JSON serialized
  agents?: string; // JSON serialized
  inputProcessors?: string; // JSON serialized
  outputProcessors?: string; // JSON serialized
  memory?: string; // JSON serialized
  scorers?: string; // JSON serialized
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentInput {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  model?: Record<string, unknown>;
  tools?: Record<string, unknown>[];
  defaultOptions?: Record<string, unknown>;
  workflows?: Record<string, unknown>;
  agents?: Record<string, unknown>;
  inputProcessors?: unknown[];
  outputProcessors?: unknown[];
  memory?: Record<string, unknown>;
  scorers?: unknown[];
  metadata?: Record<string, unknown>;
}

export class AgentsSurreal {
  constructor(private db: Surreal) {}

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
  async getAgentById({ agentId }: { agentId: string }): Promise<StoredAgent | null> {
    const results = await this.db.query<[StoredAgent[]]>(
      'SELECT * FROM type::thing("mastra_agents", $agentId)',
      { agentId }
    );
    const agent = results[0]?.[0];
    if (!agent) return null;
    return this.normalizeAgent(agent);
  }

  /**
   * Create a new agent
   */
  async createAgent({ agent }: { agent: AgentInput }): Promise<StoredAgent> {
    const now = new Date();
    const toSave = this.serializeAgent(agent, now);

    const results = await this.db.query<[StoredAgent[]]>(
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
    agentId,
    updates,
  }: {
    agentId: string;
    updates: Partial<AgentInput>;
  }): Promise<StoredAgent> {
    const existing = await this.getAgentById({ agentId });
    if (!existing) throw new Error(`Agent not found: ${agentId}`);

    const now = new Date();
    const updateFields: string[] = ['updatedAt = $now'];
    const params: Record<string, unknown> = { agentId, now };

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
      params.model = JSON.stringify(updates.model);
    }
    if (updates.tools !== undefined) {
      updateFields.push('tools = $tools');
      params.tools = JSON.stringify(updates.tools);
    }
    if (updates.defaultOptions !== undefined) {
      updateFields.push('defaultOptions = $defaultOptions');
      params.defaultOptions = JSON.stringify(updates.defaultOptions);
    }
    if (updates.workflows !== undefined) {
      updateFields.push('workflows = $workflows');
      params.workflows = JSON.stringify(updates.workflows);
    }
    if (updates.agents !== undefined) {
      updateFields.push('agents = $agents');
      params.agents = JSON.stringify(updates.agents);
    }
    if (updates.inputProcessors !== undefined) {
      updateFields.push('inputProcessors = $inputProcessors');
      params.inputProcessors = JSON.stringify(updates.inputProcessors);
    }
    if (updates.outputProcessors !== undefined) {
      updateFields.push('outputProcessors = $outputProcessors');
      params.outputProcessors = JSON.stringify(updates.outputProcessors);
    }
    if (updates.memory !== undefined) {
      updateFields.push('memory = $memory');
      params.memory = JSON.stringify(updates.memory);
    }
    if (updates.scorers !== undefined) {
      updateFields.push('scorers = $scorers');
      params.scorers = JSON.stringify(updates.scorers);
    }
    if (updates.metadata !== undefined) {
      updateFields.push('metadata = $metadata');
      params.metadata = updates.metadata;
    }

    const results = await this.db.query<[StoredAgent[]]>(
      `UPDATE type::thing("mastra_agents", $agentId) SET ${updateFields.join(', ')}`,
      params
    );

    const updated = results[0]?.[0];
    if (!updated) throw new Error(`Failed to update agent: ${agentId}`);
    return this.normalizeAgent(updated);
  }

  /**
   * Delete an agent
   */
  async deleteAgent({ agentId }: { agentId: string }): Promise<void> {
    await this.db.query(
      'DELETE type::thing("mastra_agents", $agentId)',
      { agentId }
    );
  }

  /**
   * List agents with pagination
   */
  async listAgents(args?: {
    page?: number;
    perPage?: number;
    orderBy?: 'name' | 'createdAt' | 'updatedAt';
    sortDirection?: 'asc' | 'desc';
  }): Promise<{ agents: StoredAgent[]; total: number; hasMore: boolean }> {
    const {
      page = 1,
      perPage = 50,
      orderBy = 'createdAt',
      sortDirection = 'desc',
    } = args || {};

    const offset = (page - 1) * perPage;

    // Get total count
    const countResult = await this.db.query<[{ count: number }[]]>(
      'SELECT count() as count FROM mastra_agents GROUP ALL'
    );
    const total = countResult[0]?.[0]?.count || 0;

    // Get paginated results
    const results = await this.db.query<[StoredAgent[]]>(
      `SELECT * FROM mastra_agents
       ORDER BY ${orderBy} ${sortDirection.toUpperCase()}
       LIMIT $limit START $offset`,
      { limit: perPage, offset }
    );

    const agents = (results[0] || []).map((a) => this.normalizeAgent(a));
    const hasMore = offset + agents.length < total;

    return { agents, total, hasMore };
  }

  /**
   * Clear all agents (dangerous!)
   */
  async dangerouslyClearAll(): Promise<void> {
    await this.db.query('DELETE mastra_agents');
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private serializeAgent(
    agent: AgentInput,
    now: Date
  ): Record<string, unknown> {
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      instructions: agent.instructions,
      model: agent.model ? JSON.stringify(agent.model) : undefined,
      tools: agent.tools ? JSON.stringify(agent.tools) : undefined,
      defaultOptions: agent.defaultOptions
        ? JSON.stringify(agent.defaultOptions)
        : undefined,
      workflows: agent.workflows ? JSON.stringify(agent.workflows) : undefined,
      agents: agent.agents ? JSON.stringify(agent.agents) : undefined,
      inputProcessors: agent.inputProcessors
        ? JSON.stringify(agent.inputProcessors)
        : undefined,
      outputProcessors: agent.outputProcessors
        ? JSON.stringify(agent.outputProcessors)
        : undefined,
      memory: agent.memory ? JSON.stringify(agent.memory) : undefined,
      scorers: agent.scorers ? JSON.stringify(agent.scorers) : undefined,
      metadata: agent.metadata,
      createdAt: now,
      updatedAt: now,
    };
  }

  private normalizeAgent(agent: StoredAgent): StoredAgent {
    return {
      ...agent,
      id: normalizeId(agent.id),
      createdAt: ensureDate(agent.createdAt) || new Date(),
      updatedAt: ensureDate(agent.updatedAt) || new Date(),
    };
  }
}
