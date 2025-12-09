/**
 * Test SurrealStore directly
 */
import { SurrealStore } from '../src/mastra/storage';

async function main() {
  const store = new SurrealStore();

  try {
    console.log('Testing SurrealStore...\n');

    // Test thread creation
    console.log('1. Creating thread...');
    const thread = await store.saveThread({
      thread: {
        id: 'test-thread-1',
        resourceId: 'test-user',
        title: 'Test Thread',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });
    console.log('Thread created:', thread.id);

    // Test get thread
    console.log('\n2. Getting thread...');
    const fetched = await store.getThreadById({ threadId: 'test-thread-1' });
    console.log('Fetched:', fetched);

    // Test save message
    console.log('\n3. Saving message...');
    const messages = await store.saveMessages({
      messages: [{
        id: 'test-msg-1',
        threadId: 'test-thread-1',
        role: 'user' as const,
        content: 'Hello, this is a test message!',
        createdAt: new Date(),
        type: 'text' as const,
        resourceId: 'test-user',
      }],
      format: 'v1',
    });
    console.log('Messages saved:', messages.length);

    // Test get messages
    console.log('\n4. Getting messages...');
    const fetchedMsgs = await store.getMessages({
      threadId: 'test-thread-1',
      format: 'v1'
    });
    console.log('Messages:', fetchedMsgs);

    console.log('\n✅ SurrealStore tests passed!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await store.close();
  }
}

main();
