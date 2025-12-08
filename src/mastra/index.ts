import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';

import { agents } from './agents';
import { tools } from './tools';
import { workflows } from './workflows';
import { SurrealDBStore } from './storage';

// Initialize SurrealDB storage
// Note: For now we're not using SurrealDB as Mastra's primary storage
// since Mastra expects a specific storage interface. Instead, SurrealDBStore
// is available for custom memory/state operations alongside Mastra.
//
// TODO: Implement full MastraStorage interface wrapper if needed

export const surrealStore = new SurrealDBStore();

export const mastra = new Mastra({
  agents,
  tools,
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
export { SurrealDBStore } from './storage';
