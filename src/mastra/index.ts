import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';

import { agents } from './agents';
import { workflows } from './workflows';
import { SurrealStore } from './storage';

// Initialize SurrealDB storage for Mastra
export const surrealStore = new SurrealStore();

export const mastra = new Mastra({
  agents,
  storage: surrealStore,
  workflows: {
    textProcessingWorkflow: workflows.textProcessingWorkflow,
  },
  logger: new PinoLogger({
    name: 'MastraSurreal',
    level: 'info',
  }),
});

// Re-export for convenience
export { agents } from './agents';
export { tools } from './tools';
export { workflows } from './workflows';
export { SurrealStore } from './storage';
