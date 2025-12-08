import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Example tool - Get current timestamp
 * Replace with your own tools
 */
export const getTimestamp = createTool({
  id: 'get-timestamp',
  description: 'Get the current timestamp in ISO format',
  inputSchema: z.object({
    timezone: z.string().optional().describe('Optional timezone (default: UTC)'),
  }),
  outputSchema: z.object({
    timestamp: z.string(),
    unix: z.number(),
  }),
  execute: async ({ context }) => {
    const now = new Date();
    return {
      timestamp: now.toISOString(),
      unix: now.getTime(),
    };
  },
});

/**
 * Example tool - Echo input
 * Useful for testing
 */
export const echo = createTool({
  id: 'echo',
  description: 'Echo back the input message - useful for testing',
  inputSchema: z.object({
    message: z.string().describe('Message to echo back'),
  }),
  outputSchema: z.object({
    echoed: z.string(),
    length: z.number(),
  }),
  execute: async ({ context }) => {
    return {
      echoed: context.message,
      length: context.message.length,
    };
  },
});

export const tools = {
  getTimestamp,
  echo,
};
