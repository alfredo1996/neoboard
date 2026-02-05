import { Neo4jAuthenticationModule } from '../../src/neo4j/Neo4jAuthenticationModule';
import { AuthType } from '../../src/generalized/interfaces';
import { getNeo4jAuth } from '../utils/setup';

describe('Neo4jAuthenticationModule creation to check consistency', () => {
  test('creating an authenticationModule with nothing as config', () => {
    // Expect a raised exception
    expect(() => new Neo4jAuthenticationModule({})).toThrow('Authentication type is required');
  });
  test('creating an authenticationModule with an empty authType', () => {
    // Expect a raised exception
    expect(() => new Neo4jAuthenticationModule({ uri: 'test' })).toThrow('Authentication type is required');
  });
  test('creating an authenticationModule with an AuthType.Empty authType', () => {
    // Expect a raised exception
    expect(() => new Neo4jAuthenticationModule({ authType: AuthType.EMPTY })).toThrow(
      'Authentication type is Empty. Please provide a username and password'
    );
  });
  test('creating an authenticationModule with an empty URI', () => {
    // Expect a raised exception
    expect(() => new Neo4jAuthenticationModule({ authType: AuthType.NATIVE })).toThrow('URI is required');
  });
  test('creating an authenticationModule with undefined config', () => {
    // Expect a raised exception
    expect(() => new Neo4jAuthenticationModule(undefined)).toThrow('Connection config is required');
  });
  test('creating an authenticationModule with an undefined AuthType', () => {
    // Expect a raised exception
    expect(() => new Neo4jAuthenticationModule({ authType: undefined })).toThrow('Authentication type is required');
  });
});

describe('Neo4jAuthenticationModule with native auth', () => {
  test('creating an authenticationModule with native auth', async () => {
    const config = getNeo4jAuth();
    const authModule = new Neo4jAuthenticationModule(config);
    const isAuthenticated = await authModule.verifyAuthentication();
    expect(isAuthenticated).toBe(true);
  });

  test('creating an authenticationModule with native auth, but wrong password', async () => {
    const config = getNeo4jAuth();
    config.password = 'wrongpassword';
    const authModule = new Neo4jAuthenticationModule(config);
    const isAuthenticated = await authModule.verifyAuthentication();
    expect(isAuthenticated).toBe(false);
  });

  test('creating an authenticationModule with native auth, but wrong URI throws', async () => {
    const config = getNeo4jAuth();
    config.uri = 'bolt://localhosta:7687';
    const authModule = new Neo4jAuthenticationModule(config);
    await expect(authModule.verifyAuthentication()).rejects.toThrow();
  });

  test('creating an authenticationModule with wrong username', async () => {
    const config = getNeo4jAuth();
    config.username = 'wronguser';
    const authModule = new Neo4jAuthenticationModule(config);
    const isAuthenticated = await authModule.verifyAuthentication();
    expect(isAuthenticated).toBe(false);
  });

  test('creating an authenticationModule with wrong username and after fail connection Update authConfig', async () => {
    const wrongConfig = getNeo4jAuth();
    wrongConfig.username = 'wronguser';
    const authModule = new Neo4jAuthenticationModule(wrongConfig);
    const isNotAuthenticated = await authModule.verifyAuthentication();
    expect(isNotAuthenticated).toBe(false);
    const config = getNeo4jAuth();
    await authModule.updateAuthConfig(config);
    const isAuthenticated = await authModule.verifyAuthentication();
    expect(isAuthenticated).toBe(true);
  });
});
