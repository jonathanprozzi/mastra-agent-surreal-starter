import { anthropic } from '@ai-sdk/anthropic';
import { Agent } from '@mastra/core/agent';
import { tools } from '../tools';

/**
 * Example agent - Assistant
 * Replace with your own agent configuration
 */
export const exampleAgent = new Agent({
  name: 'Example Agent',
  instructions: `You are a helpful assistant powered by Mastra with SurrealDB storage.

You have access to tools that can help you:
- Get the current timestamp
- Echo messages back

Be concise and helpful in your responses.`,
  model: anthropic('claude-sonnet-4-20250514'),
  tools: {
    getTimestamp: tools.getTimestamp,
    echo: tools.echo,
  },
});

export const agents = {
  exampleAgent,
};
