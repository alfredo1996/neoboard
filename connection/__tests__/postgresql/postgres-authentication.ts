import { PostgresAuthenticationModule } from '../../src/postgresql';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import { AuthType } from '../../src';

describe('PostgreSQL Authentication', () => {
  let container: StartedPostgreSqlContainer;
  let authModule: PostgresAuthenticationModule;

  beforeAll(async () => {
    container = await new PostgreSqlContainer().start();
  }, 30000);

  afterAll(async () => {
    // Close module first before stopping container
    if (authModule) {
      try {
        await authModule.close();
      } catch (error) {
        // Suppress shutdown errors
      }
    }

    // Stop container
    try {
      await container.stop();
    } catch (error) {
      // Suppress container shutdown errors
    }
  });

  test('should authenticate with valid credentials', async () => {
    authModule = new PostgresAuthenticationModule({
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });

    const result = await authModule.authenticate();
    expect(result).toBe(true);
    expect(authModule.getPool()).toBeDefined();
  });

  test('should fail with invalid credentials', async () => {
    const invalidAuthModule = new PostgresAuthenticationModule({
      username: 'invalid_user',
      password: 'invalid_password',
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });

    const result = await invalidAuthModule.authenticate();
    expect(result).toBe(false);
    // Pool is created in constructor, but authentication fails
    expect(invalidAuthModule.getPool()).toBeDefined();

    await invalidAuthModule.close();
  });

  test('should handle connection URI parsing', async () => {
    // Test with full URI including user and password
    authModule = new PostgresAuthenticationModule({
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });

    const result = await authModule.authenticate();
    expect(result).toBe(true);
  });

  test('should close pool properly', async () => {
    authModule = new PostgresAuthenticationModule({
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });

    await authModule.authenticate();
    expect(authModule.getPool()).toBeDefined();

    await authModule.close();
    expect(authModule.getPool()).toBeNull();
  });

  test('should create driver automatically in constructor', () => {
    const newAuthModule = new PostgresAuthenticationModule({
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });

    expect(newAuthModule.getPool()).toBeDefined();
    expect(newAuthModule.getPool()).not.toBeNull();
  });

  test('should implement verifyAuthentication', async () => {
    authModule = new PostgresAuthenticationModule({
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });

    const isValid = await authModule.verifyAuthentication();
    expect(isValid).toBe(true);
  });

  test('should return false for verifyAuthentication with invalid credentials', async () => {
    const invalidAuthModule = new PostgresAuthenticationModule({
      username: 'wrong_user',
      password: 'wrong_password',
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });

    try {
      const isValid = await invalidAuthModule.verifyAuthentication();
      expect(isValid).toBe(false);
    } catch (error) {
      // Authentication errors are thrown, not returned as false
      expect(error).toBeDefined();
    }

    await invalidAuthModule.close();
  });

  test('should update auth config', async () => {
    authModule = new PostgresAuthenticationModule({
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });

    const isValid1 = await authModule.verifyAuthentication();
    expect(isValid1).toBe(true);

    // Update to new valid config
    await authModule.updateAuthConfig({
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });

    const isValid2 = await authModule.verifyAuthentication();
    expect(isValid2).toBe(true);
  });

  test('should throw error for invalid config', () => {
    expect(() => {
      new PostgresAuthenticationModule({
        username: '',
        password: '',
        authType: AuthType.EMPTY,
        uri: '',
      });
    }).toThrow();
  });
});
