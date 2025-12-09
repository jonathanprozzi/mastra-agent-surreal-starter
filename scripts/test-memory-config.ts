/**
 * Test Memory Configuration
 */

import { memory, surrealStore } from '../src/mastra/memory';

console.log('Storage supports:');
console.log('  selectByIncludeResourceScope:', surrealStore.supports.selectByIncludeResourceScope);
console.log('  resourceWorkingMemory:', surrealStore.supports.resourceWorkingMemory);

console.log('\nMemory internal properties:');
console.log('  Has vector:', !!memory['vector']);
console.log('  Has embedder:', !!memory['embedder']);
console.log('  Storage name:', memory['storage']?.name || 'N/A');
