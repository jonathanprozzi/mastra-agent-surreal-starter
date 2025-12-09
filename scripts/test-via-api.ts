/**
 * Test Cross-Thread Recall via API
 * Tests the actual /generate endpoint
 */

const API_BASE = 'http://localhost:4111/api';
const RESOURCE_ID = 'api-test-user-' + Date.now();
const THREAD_1 = 'api-thread-1-' + Date.now();
const THREAD_2 = 'api-thread-2-' + Date.now();

async function generate(threadId: string, message: string) {
  const response = await fetch(`${API_BASE}/agents/exampleAgent/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: message }],
      resourceId: RESOURCE_ID,
      threadId: threadId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${error}`);
  }

  return response.json();
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('Testing Cross-Thread Recall via API\n');
  console.log('Resource ID:', RESOURCE_ID);
  console.log('Thread 1:', THREAD_1);
  console.log('Thread 2:', THREAD_2);

  // Step 1: Establish memory in Thread 1
  console.log('\n1. Establishing memory in Thread 1...');
  const response1 = await generate(THREAD_1,
    'My favorite programming language is Rust because it has amazing memory safety without garbage collection.'
  );
  console.log('   Response:', response1.text?.substring(0, 100) + '...');

  // Wait for embedding to be saved
  console.log('\n   Waiting 3 seconds for embedding to be saved...');
  await sleep(3000);

  // Step 2: Try to recall from Thread 2
  console.log('\n2. Asking about programming from Thread 2 (different thread)...');
  const response2 = await generate(THREAD_2,
    'What programming language did I say I liked? Do you remember?'
  );
  console.log('   Response:', response2.text);

  // Verify
  const mentionsRust = response2.text?.toLowerCase().includes('rust');
  const mentionsMemorySafety = response2.text?.toLowerCase().includes('memory safety') ||
                               response2.text?.toLowerCase().includes('memory-safe');

  console.log('\n3. Verification:');
  console.log('   Mentions Rust:', mentionsRust ? 'YES' : 'NO');
  console.log('   Mentions memory safety:', mentionsMemorySafety ? 'YES' : 'NO');

  if (mentionsRust) {
    console.log('\n   SUCCESS! Cross-thread semantic recall is working!');
  } else {
    console.log('\n   Cross-thread recall may not be working as expected.');
  }
}

main().catch(console.error);
