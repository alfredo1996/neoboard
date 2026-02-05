import { getNeo4jAuth } from '../utils/setup';
import { Neo4jConnectionModule } from '../../src/neo4j/Neo4jConnectionModule';
import { DEFAULT_CONNECTION_CONFIG, QueryCallback, QueryParams } from '../../src/generalized/interfaces';
import { Neo4jError, toNumber } from 'neo4j-driver-core';
import { NeodashRecord } from '../../src/generalized/NeodashRecord';

describe('Advanced Query to Neo4j', () => {
  let connection: Neo4jConnectionModule;

  afterAll(async () => {
    // Close driver connection to prevent worker process hanging
    if (connection) {
      await connection.getDriver().close();
    }
  });

  test('should create a Person named "Neo4jTest" born in 2025 and verify it', async () => {
    const config = getNeo4jAuth();
    connection = new Neo4jConnectionModule(config);

    // STEP 1: Create the node
    const createQueryParams: QueryParams = {
      query: 'CREATE (p:Person {name: $name, born: $born}) RETURN p',
      params: {
        name: 'Neo4jTest',
        born: 2025,
      },
    };

    const createCallback: QueryCallback<any> = {
      onSuccess: (createRes: NeodashRecord[]) => {
        const created = createRes[0]['p'];
        expect(created).toBeDefined();
        expect(created.properties.name).toBe('Neo4jTest');
        expect(created.properties.born).toBe(2025);
      },
      onFail: (err) => {
        console.error('Error creating person:', err);
        throw err;
      },
    };

    const writeConfig = {
      ...DEFAULT_CONNECTION_CONFIG,
      accessMode: 'WRITE',
      connectionTimeout: 30 * 1000, // ms
    };

    await connection.runQuery(createQueryParams, createCallback, writeConfig);

    // STEP 2: Verify the node exists
    const matchQueryParams: QueryParams = {
      query: 'MATCH (p:Person {name: $name}) RETURN p LIMIT 1',
      params: { name: 'Neo4jTest' },
    };

    const matchCallback: QueryCallback<any> = {
      onSuccess: (createRes: NeodashRecord[]) => {
        const person = createRes[0]['p'];
        expect(person).toBeDefined();
        expect(person.properties.name).toBe('Neo4jTest');
        expect(person.properties.born).toBe(2025);
      },
      onFail: (err) => {
        console.error('Error verifying created person:', err);
        throw err;
      },
    };

    await connection.runQuery(matchQueryParams, matchCallback, DEFAULT_CONNECTION_CONFIG);
  });

  test('should fail to create a Person named "Neo4jTest" because of READ accessMode', async () => {
    const config = getNeo4jAuth();
    connection = new Neo4jConnectionModule(config);

    // STEP 1: Create the node
    const createQueryParams: QueryParams = {
      query: 'CREATE (p:Person {name: $name, born: $born}) RETURN p',
      params: {
        name: 'Neo4jTest',
        born: 2025,
      },
    };

    const createCallback: QueryCallback<any> = {
      onSuccess: () => {
        throw Error('SHOULD FAIL');
      },
      onFail: (err) => {
        expect(err).toBeInstanceOf(Neo4jError);
        expect(err.message).toMatch(/^Writing in read access mode not allowed/);
      },
    };
    await connection.runQuery(createQueryParams, createCallback, DEFAULT_CONNECTION_CONFIG);
  });
});


test('should create, delete, and verify the deletion of the Person "Nodename"', async () => {
  const config = getNeo4jAuth();
  const connection = new Neo4jConnectionModule(config);

  try {

  const Nodename = `Neo4jTest_${Date.now()}`;

  // STEP 1: Create the node
  const createQueryParams: QueryParams = {
    query: 'CREATE (p:Person {name: $name, born: $born}) RETURN p',
    params: {
      name: Nodename,
      born: 2025,
    },
  };

  const createCallback: QueryCallback<any> = {
    onSuccess: (parsedCreate) => {
      const created = parsedCreate[0]['p'];
      expect(created).toBeDefined();
      expect(created.properties.name).toBe(Nodename);
      expect(created.properties.born).toBe(2025);
    },
    onFail: (err) => {
      console.error('Error creating person:', err);
      throw err;
    },
  };

  const writeConfig = {
    ...DEFAULT_CONNECTION_CONFIG,
    accessMode: 'WRITE',
    connectionTimeout: 30 * 1000, // ms
  };

  await connection.runQuery(createQueryParams, createCallback, writeConfig);

  // STEP 2: Delete the node in write mode
  const deleteQueryParams: QueryParams = {
    query: 'MATCH (p:Person {name: $name}) DELETE p',
    params: { name: Nodename },
  };

  const deleteCallback: QueryCallback<any> = {
    onSuccess: () => {},
    onFail: (err) => {
      console.error('Error deleting node:', err);
      throw err;
    },
  };

  await connection.runQuery(deleteQueryParams, deleteCallback, writeConfig);

  // STEP 3: Verify the node has been deleted (in read mode)
  const verifyDeletionQueryParams: QueryParams = {
    query: 'MATCH (p:Person {name: $name}) RETURN p LIMIT 1',
    params: { name: Nodename },
  };

  const verifyDeletionCallback: QueryCallback<any> = {
    onSuccess: (res) => {
      expect(res.length).toBe(0); // The node should be deleted, so the result should be empty
    },
    onFail: (err) => {
      console.error('Error verifying deleted node:', err);
      throw err;
    },
  };

  await connection.runQuery(verifyDeletionQueryParams, verifyDeletionCallback, writeConfig);
  } finally {
    await connection.getDriver().close();
  }
}, 30000);

test('should update born and nationality properties for a Person', async () => {
  const config = getNeo4jAuth();
  const connection = new Neo4jConnectionModule(config);

  try {

  const personData = {
    name: 'Keanu Reeves',
    born: 1964,
  };

  // STEP 0: CREATE initial node
  const createQuery: QueryParams = {
    query: 'MERGE (p:Person {name: $name}) SET p.born = $born RETURN p',
    params: personData,
  };

  const createCallback: QueryCallback<any> = {
    onSuccess: () => {},
    onFail: (err) => {
      throw err;
    },
  };

  const writeConfig = {
    ...DEFAULT_CONNECTION_CONFIG,
    accessMode: 'WRITE',
    connectionTimeout: 30 * 1000, // ms
  };

  await connection.runQuery(createQuery, createCallback, writeConfig);

  // STEP 1: UPDATE born property
  const updateBorn: QueryParams = {
    query: 'MATCH (p:Person {name: $name}) SET p.born = 1965 RETURN p',
    params: { name: personData.name },
  };

  const updateCallback: QueryCallback<any> = {
    onSuccess: (res) => {
      const [record] = res;
      expect(toNumber(record['p'].properties.born)).toBe(1965);
    },
    onFail: (err) => {
      throw err;
    },
  };

  await connection.runQuery(updateBorn, updateCallback, writeConfig);

  // STEP 2: ADD nationality
  const addNationality: QueryParams = {
    query: 'MATCH (p:Person {name: $name}) SET p.nationality = "Canadian" RETURN p',
    params: { name: personData.name },
  };

  const addNationalityCallback: QueryCallback<any> = {
    onSuccess: (res) => {
      const [record] = res;
      expect(record['p'].properties.nationality).toBe('Canadian');
    },
    onFail: (err) => {
      throw err;
    },
  };

  await connection.runQuery(addNationality, addNationalityCallback, writeConfig);

  // STEP 3: Verify both updates
  const verifyQuery: QueryParams = {
    query: 'MATCH (p:Person {name: $name}) RETURN p',
    params: { name: personData.name },
  };

  const verifyCallback: QueryCallback<any> = {
    onSuccess: (res) => {
      const [record] = res;
      expect(record['p'].properties.name).toBe('Keanu Reeves');
      expect(record['p'].properties.nationality).toBe('Canadian');
      expect(toNumber(record['p'].properties.born)).toBe(1965);
    },
    onFail: (err) => {
      throw err;
    },
  };

  await connection.runQuery(verifyQuery, verifyCallback, DEFAULT_CONNECTION_CONFIG);
  } finally {
    await connection.getDriver().close();
  }
});

test('should delete a Person node and verify it is no longer present', async () => {
  const config = getNeo4jAuth();
  const connection = new Neo4jConnectionModule(config);

  try {

  const writeConfig = {
    ...DEFAULT_CONNECTION_CONFIG,
    accessMode: 'WRITE',
    connectionTimeout: 30 * 1000, // ms
  };

  const personData = {
    name: 'Keanu Reeves',
    born: 1964,
  };

  // STEP 0: Create the node that will later be deleted
  const createQuery: QueryParams = {
    query: 'MERGE (p:Person {name: $name}) SET p.born = $born RETURN p',
    params: personData,
  };

  const createCallback: QueryCallback<any> = {
    onSuccess: () => {},
    onFail: (err) => {
      throw err;
    },
  };

  await connection.runQuery(createQuery, createCallback, writeConfig);

  // STEP 1: Delete the node using DETACH DELETE
  const deleteQuery: QueryParams = {
    query: 'MATCH (p:Person {name: $name}) DETACH DELETE p',
    params: { name: personData.name },
  };

  const deleteCallback: QueryCallback<any> = {
    onSuccess: () => {
      // No assertion here — verification happens in the next step
    },
    onFail: (err) => {
      throw err;
    },
  };

  await connection.runQuery(deleteQuery, deleteCallback, writeConfig);

  // STEP 2: Verify that the node no longer exists
  const verifyQuery: QueryParams = {
    query: 'MATCH (p:Person {name: $name}) RETURN p',
    params: { name: personData.name },
  };

  const verifyCallback: QueryCallback<any> = {
    onSuccess: (parsed) => {
      expect(parsed.length).toBe(0); // Node was successfully deleted
    },
    onFail: (err) => {
      throw err;
    },
  };

  await connection.runQuery(verifyQuery, verifyCallback, DEFAULT_CONNECTION_CONFIG);
  } finally {
    await connection.getDriver().close();
  }
});
