/**
 * Workflows Domain for SurrealDB Storage
 *
 * Handles workflow snapshots and run tracking.
 */

import type Surreal from 'surrealdb';
import type { WorkflowRun, WorkflowRuns } from '@mastra/core/storage';
import type { StepResult, WorkflowRunState } from '@mastra/core/workflows';

export class WorkflowsSurreal {
  constructor(private db: Surreal) {}

  async updateWorkflowResults({
    workflowName,
    runId,
    stepId,
    result,
    runtimeContext,
  }: {
    workflowName: string;
    runId: string;
    stepId: string;
    result: StepResult<any, any, any, any>;
    runtimeContext: Record<string, any>;
  }): Promise<Record<string, StepResult<any, any, any, any>>> {
    // Load existing snapshot and update the step result
    const snapshot = await this.loadWorkflowSnapshot({ workflowName, runId });
    const stepResults: Record<string, StepResult<any, any, any, any>> = {};
    stepResults[stepId] = result;

    // Update snapshot with the new step result
    await this.db.query(
      `UPDATE mastra_workflow_snapshot SET result = $result, updatedAt = time::now() WHERE workflowName = $workflowName AND runId = $runId`,
      { workflowName, runId, result: stepResults }
    );

    return stepResults;
  }

  async updateWorkflowState({
    workflowName,
    runId,
    opts,
  }: {
    workflowName: string;
    runId: string;
    opts: {
      status: string;
      result?: StepResult<any, any, any, any>;
      error?: string;
      suspendedPaths?: Record<string, number[]>;
      waitingPaths?: Record<string, number[]>;
    };
  }): Promise<WorkflowRunState | undefined> {
    const results = await this.db.query<[WorkflowRunState[]]>(
      `UPDATE mastra_workflow_snapshot SET
        status = $status,
        error = $error,
        suspendedPaths = $suspendedPaths,
        waitingPaths = $waitingPaths,
        updatedAt = time::now()
      WHERE workflowName = $workflowName AND runId = $runId RETURN AFTER`,
      { workflowName, runId, ...opts }
    );
    return results[0]?.[0];
  }

  async persistWorkflowSnapshot({
    workflowName,
    runId,
    resourceId,
    snapshot,
  }: {
    workflowName: string;
    runId: string;
    resourceId?: string;
    snapshot: WorkflowRunState;
  }): Promise<void> {
    const now = new Date();
    await this.db.query(
      `INSERT INTO mastra_workflow_snapshot {
        workflowName: $workflowName,
        runId: $runId,
        resourceId: $resourceId,
        snapshot: $snapshot,
        status: $status,
        createdAt: $now,
        updatedAt: $now
      } ON DUPLICATE KEY UPDATE
        snapshot = $snapshot,
        status = $status,
        updatedAt = time::now()`,
      { workflowName, runId, resourceId, snapshot, status: snapshot.status, now }
    );
  }

  async loadWorkflowSnapshot({
    workflowName,
    runId,
  }: {
    workflowName: string;
    runId: string;
  }): Promise<WorkflowRunState | null> {
    const results = await this.db.query<[{ snapshot: WorkflowRunState }[]]>(
      'SELECT snapshot FROM mastra_workflow_snapshot WHERE workflowName = $workflowName AND runId = $runId LIMIT 1',
      { workflowName, runId }
    );
    return results[0]?.[0]?.snapshot || null;
  }

  async getWorkflowRuns(args?: {
    workflowName?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
    resourceId?: string;
  }): Promise<WorkflowRuns> {
    const { workflowName, fromDate, toDate, limit = 100, offset = 0, resourceId } = args || {};

    let query = 'SELECT * FROM mastra_workflow_snapshot WHERE 1=1';
    const params: Record<string, any> = { limit, offset };

    if (workflowName) {
      query += ' AND workflowName = $workflowName';
      params.workflowName = workflowName;
    }
    if (resourceId) {
      query += ' AND resourceId = $resourceId';
      params.resourceId = resourceId;
    }
    if (fromDate) {
      query += ' AND createdAt >= $fromDate';
      params.fromDate = fromDate;
    }
    if (toDate) {
      query += ' AND createdAt <= $toDate';
      params.toDate = toDate;
    }

    query += ' ORDER BY createdAt DESC LIMIT $limit START $offset';

    const results = await this.db.query<[WorkflowRun[]]>(query, params);
    const runs = results[0] || [];
    return { runs, total: runs.length };
  }

  async getWorkflowRunById({
    runId,
    workflowName,
  }: {
    runId: string;
    workflowName?: string;
  }): Promise<WorkflowRun | null> {
    let query = 'SELECT * FROM mastra_workflow_snapshot WHERE runId = $runId';
    const params: Record<string, any> = { runId };

    if (workflowName) {
      query += ' AND workflowName = $workflowName';
      params.workflowName = workflowName;
    }
    query += ' LIMIT 1';

    const results = await this.db.query<[WorkflowRun[]]>(query, params);
    return results[0]?.[0] || null;
  }
}

export default WorkflowsSurreal;
