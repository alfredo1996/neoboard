import { Neo4jSchemaManager } from '../../src/schema/neo4j-schema';
import { AuthType } from '../../src/generalized/interfaces';

// Module-level variable — safe to reference in hoisted mock factory
let _mockRun = jest.fn();

jest.mock('neo4j-driver', () => {
  const mockSession = {
    run: (...args: unknown[]) => _mockRun(...args),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const mockDriver = {
    session: jest.fn().mockReturnValue(mockSession),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return {
    __esModule: true,
    default: {
      driver: jest.fn().mockReturnValue(mockDriver),
      auth: { basic: jest.fn().mockReturnValue({}), none: jest.fn().mockReturnValue({}) },
      session: { READ: 'READ', WRITE: 'WRITE' },
      isInt: jest.fn().mockReturnValue(false),
    },
  };
});

jest.mock('../../src/neo4j/Neo4jConnectionModule', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const neo4j = require('neo4j-driver').default;
  const driver = neo4j.driver();
  return {
    Neo4jConnectionModule: jest.fn().mockImplementation(() => ({
      getDriver: () => driver,
    })),
  };
});

const authConfig = {
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'password',
  authType: AuthType.NATIVE,
};

/** Helper: produce an empty records response */
const emptyResult = { records: [] };

/** Helper: create a label record */
const labelRecord = (label: string) => ({ keys: ['label'], get: () => label });

/** Helper: create a relationshipType record */
const relTypeRecord = (rt: string) => ({ keys: ['relationshipType'], get: () => rt });

/** Helper: create a nodeTypeProperties record */
const nodePropRecord = (nodeType: string, propertyName: string, propertyTypes: string[]) => ({
  keys: ['nodeType', 'propertyName', 'propertyTypes'],
  get: (k: string) => ({ nodeType, propertyName, propertyTypes }[k]),
});

/** Helper: create a relTypeProperties record */
const relPropRecord = (relType: string, propertyName: string, propertyTypes: string[]) => ({
  keys: ['relType', 'propertyName', 'propertyTypes'],
  get: (k: string) => ({ relType, propertyName, propertyTypes }[k]),
});

/**
 * The schema manager runs 4 Cypher queries in parallel.
 * Call order (Promise.all): labels, relationshipTypes, nodeTypeProperties, relTypeProperties.
 */
function mockFourCalls(
  labels: object[],
  relTypes: object[],
  nodeProps: object[],
  relProps: object[],
) {
  _mockRun
    .mockResolvedValueOnce({ records: labels })
    .mockResolvedValueOnce({ records: relTypes })
    .mockResolvedValueOnce({ records: nodeProps })
    .mockResolvedValueOnce({ records: relProps });
}

describe('Neo4jSchemaManager', () => {
  beforeEach(() => {
    _mockRun = jest.fn();
  });

  it('returns labels from db.labels()', async () => {
    mockFourCalls(
      [labelRecord('Person'), labelRecord('Movie')],
      [],
      [],
      [],
    );

    const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);

    expect(schema.type).toBe('neo4j');
    expect(schema.labels).toEqual(['Person', 'Movie']);
  });

  it('returns relationship types from db.relationshipTypes()', async () => {
    mockFourCalls([], [relTypeRecord('ACTED_IN'), relTypeRecord('DIRECTED')], [], []);

    const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);

    expect(schema.relationshipTypes).toEqual(['ACTED_IN', 'DIRECTED']);
  });

  it('normalises nodeProperties from nodeType procedure', async () => {
    mockFourCalls(
      [],
      [],
      [nodePropRecord(':Person', 'name', ['String']), nodePropRecord(':Person', 'born', ['Long'])],
      [],
    );

    const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);

    expect(schema.nodeProperties?.Person).toHaveLength(2);
    expect(schema.nodeProperties?.Person?.[0]).toMatchObject({ name: 'name', type: 'String' });
    expect(schema.nodeProperties?.Person?.[1]).toMatchObject({ name: 'born', type: 'Long' });
  });

  it('strips leading colon from nodeType and relType', async () => {
    mockFourCalls(
      [],
      [],
      [nodePropRecord(':Movie', 'title', ['String'])],
      [relPropRecord(':ACTED_IN', 'roles', ['StringArray'])],
    );

    const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);

    expect(schema.nodeProperties?.Movie).toBeDefined();
    expect(schema.nodeProperties?.[':Movie']).toBeUndefined();
    expect(schema.relProperties?.ACTED_IN).toBeDefined();
    expect(schema.relProperties?.[':ACTED_IN']).toBeUndefined();
  });

  it('returns empty collections for empty databases', async () => {
    mockFourCalls([], [], [], []);

    const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);

    expect(schema.labels).toEqual([]);
    expect(schema.relationshipTypes).toEqual([]);
    expect(schema.nodeProperties).toEqual({});
    expect(schema.relProperties).toEqual({});
  });
});
