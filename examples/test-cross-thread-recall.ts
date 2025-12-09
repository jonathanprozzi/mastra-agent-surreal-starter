/**
 * Test Cross-Thread Semantic Recall
 *
 * This specifically tests that the agent can recall information from
 * a different thread using scope: 'resource' semantic recall.
 */

import { mastra } from '../src/mastra';
import { memory, surrealVector } from '../src/mastra/memory';

const RESOURCE_ID = 'cross-thread-test-user';
const THREAD_1 = 'cross-thread-1-cooking';
const THREAD_2 = 'cross-thread-2-programming';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🧪 Testing Cross-Thread Semantic Recall\n');

  const agent = mastra.getAgent('exampleAgent');

  try {
    // Clean up
    console.log('0️⃣ Cleaning up previous test data...');
    try {
      await memory.deleteThread(THREAD_1);
      await memory.deleteThread(THREAD_2);
    } catch (e) {}
    console.log('   ✅ Cleanup done\n');

    // Thread 1: Establish cooking memory
    console.log('1️⃣ Creating cooking conversation in Thread 1...');
    const response1 = await agent.generate(
      'My favorite recipe is homemade lasagna with fresh pasta sheets, bechamel sauce, and a rich meat ragu. I make it every Sunday!',
      {
        resourceId: RESOURCE_ID,
        threadId: THREAD_1,
      }
    );
    console.log('   Agent:', response1.text.substring(0, 100) + '...');
    await sleep(2000); // Ensure embedding is saved

    // Thread 2: Ask about cooking (should recall from Thread 1)
    console.log('\n2️⃣ In Thread 2, asking about cooking (cross-thread recall test)...');
    const response2 = await agent.generate(
      'What was that Italian dish I told you about recently? The one I make on Sundays?',
      {
        resourceId: RESOURCE_ID,
        threadId: THREAD_2,
      }
    );
    console.log('   Agent:', response2.text);

    // Verify: Check if agent mentioned lasagna
    const mentionsLasagna = response2.text.toLowerCase().includes('lasagna');
    const mentionsSunday = response2.text.toLowerCase().includes('sunday');
    const mentionsRecipe = response2.text.toLowerCase().includes('recipe') || response2.text.toLowerCase().includes('cook');

    console.log('\n3️⃣ Verification:');
    console.log(`   Mentions lasagna: ${mentionsLasagna ? '✅ YES' : '❌ NO'}`);
    console.log(`   Mentions Sunday: ${mentionsSunday ? '✅ YES' : '❌ NO'}`);
    console.log(`   Mentions recipe/cooking: ${mentionsRecipe ? '✅ YES' : '❌ NO'}`);

    // Check vector stats
    const stats = await surrealVector.describeIndex({ indexName: 'memory_messages' });
    console.log('\n4️⃣ Vector index stats:');
    console.log(`   Total vectors: ${stats.count}`);

    if (mentionsLasagna) {
      console.log('\n✅ Cross-thread semantic recall is WORKING!');
      console.log('   The agent successfully recalled lasagna from Thread 1 while in Thread 2.');
    } else {
      console.log('\n⚠️ Cross-thread recall may not be working as expected.');
      console.log('   The agent did not mention lasagna from the previous conversation.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();
