import { getNeo4jAuth } from '../../utils/setup';
import { Neo4jConnectionModule } from '../../../src/neo4j/Neo4jConnectionModule';
import { DEFAULT_CONNECTION_CONFIG, QueryCallback, QueryParams } from '../../../src/generalized/interfaces';

describe('Neo4jRecordParser - Temporal Parsing', () => {
  test('should correctly parse a Neo4j Date value to YYYY-MM-DD string', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'RETURN date() AS currentDate',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        const currentDate = parsed[0]['currentDate'];
        expect(currentDate).toBeDefined();
        expect(typeof currentDate).toBe('string');
        // Expect YYYY-MM-DD format
        expect(currentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      },
      onFail: (error) => {
        console.error('Error during query execution:', error);
        throw error;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);
  });

  test('should correctly parse a Neo4j DateTime value to formatted string', async () => {
    const config = getNeo4jAuth();

    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'RETURN datetime() AS currentDateTime',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        const currentDateTime = parsed[0]['currentDateTime'];
        expect(currentDateTime).toBeDefined();
        expect(typeof currentDateTime).toBe('string');
        // Expect YYYY-MM-DD HH:mm:ss format
        expect(currentDateTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      },
      onFail: (error) => {
        console.error('Error during query execution:', error);
        throw error;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);
  });

  test('should correctly parse a Neo4j LocalDateTime value', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'RETURN localdatetime() AS currentLocalDateTime',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        const currentLocalDateTime = parsed[0]['currentLocalDateTime'];
        expect(currentLocalDateTime).toBeDefined();

        // Check if the parsed value is a valid JS Date object
        expect(currentLocalDateTime instanceof Date).toBe(true);
        expect(!isNaN(currentLocalDateTime.getTime())).toBe(true); // Ensure valid timestamp
      },
      onFail: (error) => {
        console.error('Error during query execution:', error);
        throw error;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);
  });

  test('should correctly parse a Neo4j Duration value', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'RETURN duration({months: 5, days: 10, seconds: 60, nanoseconds: 500}) AS period',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        const period = parsed[0]['period'];
        expect(period).toBeDefined();

        expect(period).toMatchObject({
          months: 5,
          days: 10,
          seconds: expect.any(Number),
          nanoseconds: expect.any(Number),
        });
      },
      onFail: (error) => {
        console.error('Error during query execution:', error);
        throw error;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);
  });

  test('should correctly parse a Neo4j LocalTime value', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'RETURN localtime() AS currentTime',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        const currentTime = parsed[0]['currentTime'];
        expect(currentTime).toBeDefined();

        expect(typeof currentTime).toBe('string');

        const timeFormatRegex = /^\d{1,2}:\d{1,2}:\d{1,2}\.\d{1,9}$/;
        expect(timeFormatRegex.test(currentTime)).toBe(true);
      },
      onFail: (error) => {
        console.error('Error during query execution:', error);
        throw error;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);
  });

  test('should correctly parse a Neo4j Time value with offset', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'RETURN time() AS currentTimeWithOffset',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        const currentTimeWithOffset = parsed[0]['currentTimeWithOffset'];
        expect(currentTimeWithOffset).toBeDefined();

        expect(typeof currentTimeWithOffset).toBe('string');

        const timeWithOffsetRegex = /^\d{1,2}:\d{1,2}:\d{1,2}\.\d{1,9}[+-]\d{2}:\d{2}$/;
        expect(timeWithOffsetRegex.test(currentTimeWithOffset)).toBe(true);
      },
      onFail: (error) => {
        console.error('Error during query execution:', error);
        throw error;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);
  });
});
