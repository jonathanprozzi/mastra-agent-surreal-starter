/**
 * Workflows Domain for SurrealDB Storage
 *
 * Handles workflow snapshots and run tracking.
 * Extends WorkflowsStorage from @mastra/core for v1 compatibility.
 */

import type Surreal from 'surrealdb';
import { WorkflowsStorage } from '@mastra/core/storage/domains';
import type {
  WorkflowRun,
  WorkflowRuns,
  StorageListWorkflowRunsInput,
  UpdateWorkflowStateOptions,
} from '@mastra/core/storage';
import type { StepResult, WorkflowRunState } from '@mastra/core/workflows';

export class WorkflowsSurreal extends WorkflowsStorage {
  constructor(private db: Surreal) {
    super();
  }

  async dangerouslyClearAll(): Promise<void> {
    await this.db.query('DELETE FROM mastra_workflow_snapshot');
  }

  async updateWorkflowResults({
    workflowName,
    runId,
    stepId,
    result,
    requestContext,
  }: {
    workflowName: string;
    runId: string;
    stepId: string;
    result: StepResult<any, any, any, any>;
    requestContext: Record<string, any>;
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
    opts: UpdateWorkflowStateOptions;
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
    createdAt,
    updatedAt,
  }: {
    workflowName: string;
    runId: string;
    resourceId?: string;
    snapshot: WorkflowRunState;
    createdAt?: Date;
    updatedAt?: Date;
  }): Promise<void> {
    const now = new Date();
    await this.db.query(
      `INSERT INTO mastra_workflow_snapshot {
        workflowName: $workflowName,
        runId: $runId,
        resourceId: $resourceId,
        snapshot: $snapshot,
        status: $status,
        createdAt: $createdAt,
        updatedAt: $updatedAt
      } ON DUPLICATE KEY UPDATE
        snapshot = $snapshot,
        status = $status,
        updatedAt = time::now()`,
      {
        workflowName,
        runId,
        resourceId,
        snapshot,
        status: snapshot.status,
        createdAt: createdAt || now,
        updatedAt: updatedAt || now,
      }
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

  async listWorkflowRuns(args?: StorageListWorkflowRunsInput): Promise<WorkflowRuns> {
    const {
      workflowName,
      fromDate,
      toDate,
      perPage,
      page,
      resourceId,
      status,
    } = args || {};

    // If both page and perPage are defined, use pagination
    const usePagination = page !== undefined && perPage !== undefined;
    const limit = usePagination ? (perPage === false ? Number.MAX_SAFE_INTEGER : perPage) : 100;
    const offset = usePagination ? page! * (perPage === false ? 0 : perPage!) : 0;

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
    if (status) {
      query += ' AND status = $status';
      params.status = status;
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

  async deleteWorkflowRunById({
    runId,
    workflowName,
  }: {
    runId: string;
    workflowName: string;
  }): Promise<void> {
    await this.db.query(
      'DELETE FROM mastra_workflow_snapshot WHERE runId = $runId AND workflowName = $workflowName',
      { runId, workflowName }
    );
  }
}

export default WorkflowsSurreal;
