/**
 * Test SurrealDB JS SDK vector operations
 */
import Surreal from 'surrealdb';

async function main() {
  const db = new Surreal();

  try {
    console.log('Connecting...');
    await db.connect('http://localhost:8000');
    await db.signin({ username: 'root', password: 'root' });
    await db.use({ namespace: 'test', database: 'sdk_test' });
    console.log('Connected!');

    // Create table and index
    console.log('Creating table and index...');
    await db.query(`
      DEFINE TABLE sdk_vectors SCHEMALESS;
      DEFINE FIELD embedding ON sdk_vectors TYPE array<float>;
      DEFINE INDEX hnsw_sdk ON sdk_vectors FIELDS embedding HNSW DIMENSION 8 DIST COSINE TYPE F32;
    `);

    // Test insert with parameterized query
    console.log('Inserting vectors...');
    const vec1 = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    const vec2 = [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];

    await db.query(
      `INSERT INTO sdk_vectors { id: $id, embedding: $embedding }`,
      { id: 'vec1', embedding: vec1 }
    );
    await db.query(
      `INSERT INTO sdk_vectors { id: $id, embedding: $embedding }`,
      { id: 'vec2', embedding: vec2 }
    );
    console.log('Inserted!');

    // Verify data
    console.log('Verifying data...');
    const data = await db.query(`SELECT id, array::len(embedding) as dim FROM sdk_vectors`);
    console.log('Data:', JSON.stringify(data, null, 2));

    // Test similarity search
    console.log('Testing similarity search...');
    const queryVec = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    const results = await db.query(
      `SELECT id, vector::similarity::cosine(embedding, $queryVec) as sim FROM sdk_vectors ORDER BY sim DESC`,
      { queryVec }
    );
    console.log('Results:', JSON.stringify(results, null, 2));

    // Test HNSW KNN query
    console.log('Testing HNSW KNN...');
    const knnResults = await db.query(
      `SELECT id, vector::distance::knn() as dist FROM sdk_vectors WHERE embedding <|2|> $queryVec`,
      { queryVec }
    );
    console.log('KNN Results:', JSON.stringify(knnResults, null, 2));

    console.log('\n✅ All SDK vector tests passed!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.close();
  }
}

main();
