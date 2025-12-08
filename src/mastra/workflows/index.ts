import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

/**
 * Example workflow step - Process input
 */
const processInput = createStep({
  id: 'process-input',
  inputSchema: z.object({
    text: z.string(),
  }),
  outputSchema: z.object({
    processed: z.string(),
    wordCount: z.number(),
  }),
  execute: async ({ inputData }) => {
    const text = inputData.text;
    return {
      processed: text.trim().toLowerCase(),
      wordCount: text.split(/\s+/).length,
    };
  },
});

/**
 * Example workflow step - Analyze result
 */
const analyzeResult = createStep({
  id: 'analyze-result',
  inputSchema: z.object({
    processed: z.string(),
    wordCount: z.number(),
  }),
  outputSchema: z.object({
    analysis: z.string(),
    isShort: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const { processed, wordCount } = inputData;
    return {
      analysis: `Processed text has ${wordCount} words`,
      isShort: wordCount < 10,
    };
  },
});

/**
 * Example workflow - Text Processing Pipeline
 */
export const textProcessingWorkflow = createWorkflow({
  id: 'text-processing',
  inputSchema: z.object({
    text: z.string(),
  }),
  outputSchema: z.object({
    analysis: z.string(),
    isShort: z.boolean(),
  }),
})
  .then(processInput)
  .then(analyzeResult)
  .commit();

export const workflows = {
  textProcessingWorkflow,
};
