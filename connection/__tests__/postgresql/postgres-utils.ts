import {
  errorHasMessage,
  extractTableSchemaFromFields,
  isTimeoutError,
  isAuthenticationError,
} from '../../src/postgresql/utils';
import type { FieldDef } from 'pg';

describe('PostgreSQL Utils', () => {
  describe('errorHasMessage', () => {
    test('should return true for error with message', () => {
      const error = { message: 'Test error' };
      expect(errorHasMessage(error)).toBe(true);
    });

    test('should return true for Error instance', () => {
      const error = new Error('Test error');
      expect(errorHasMessage(error)).toBe(true);
    });

    test('should return false for non-error objects', () => {
      expect(errorHasMessage({})).toBe(false);
      expect(errorHasMessage({ msg: 'test' })).toBe(false);
      expect(errorHasMessage(null)).toBe(false);
      expect(errorHasMessage(undefined)).toBe(false);
      expect(errorHasMessage('string')).toBe(false);
      expect(errorHasMessage(123)).toBe(false);
    });

    test('should return false for error with non-string message', () => {
      const error = { message: 123 };
      expect(errorHasMessage(error)).toBe(false);
    });
  });

  describe('extractTableSchemaFromFields', () => {
    test('should extract schema from field metadata', () => {
      const fields = [
        { name: 'id', dataTypeID: 23 },
        { name: 'name', dataTypeID: 25 },
        { name: 'email', dataTypeID: 25 },
      ] as unknown as FieldDef[];

      const schema = extractTableSchemaFromFields(fields);

      expect(Array.isArray(schema)).toBe(true);
      expect(schema.length).toBeGreaterThan(0);
      expect(schema[0].length).toBeGreaterThan(1);
      expect(schema[0]).toContain('id');
      expect(schema[0]).toContain('name');
      expect(schema[0]).toContain('email');
    });

    test('should return empty array for empty fields', () => {
      const schema = extractTableSchemaFromFields([]);
      expect(schema).toEqual([]);
    });

    test('should handle multiple fields', () => {
      const fields = [
        { name: 'field1', dataTypeID: 23 },
        { name: 'field2', dataTypeID: 25 },
        { name: 'field3', dataTypeID: 16 },
        { name: 'field4', dataTypeID: 700 },
      ] as unknown as FieldDef[];

      const schema = extractTableSchemaFromFields(fields);

      expect(schema.length).toBeGreaterThan(0);
      expect(schema[0]).toContain('field1');
      expect(schema[0]).toContain('field2');
      expect(schema[0]).toContain('field3');
      expect(schema[0]).toContain('field4');
    });
  });

  describe('isTimeoutError', () => {
    test('should detect query_canceled error code', () => {
      const error = { code: '57014', message: 'query canceled' };
      expect(isTimeoutError(error)).toBe(true);
    });

    test('should detect admin_shutdown error code', () => {
      const error = { code: '57P01', message: 'admin shutdown' };
      expect(isTimeoutError(error)).toBe(true);
    });

    test('should detect timeout in message', () => {
      const error = { message: 'statement timeout exceeded' };
      expect(isTimeoutError(error)).toBe(true);
    });

    test('should detect canceling statement message', () => {
      const error = { message: 'canceling statement due to statement timeout' };
      expect(isTimeoutError(error)).toBe(true);
    });

    test('should detect terminating connection message', () => {
      const error = { message: 'terminating connection due to administrator command' };
      expect(isTimeoutError(error)).toBe(true);
    });

    test('should return false for non-timeout errors', () => {
      expect(isTimeoutError({ code: '23505', message: 'duplicate key' })).toBe(false);
      expect(isTimeoutError({ message: 'syntax error' })).toBe(false);
      expect(isTimeoutError({})).toBe(false);
      expect(isTimeoutError(null)).toBe(false);
      expect(isTimeoutError(undefined)).toBe(false);
    });
  });

  describe('isAuthenticationError', () => {
    test('should detect invalid_password error code', () => {
      const error = { code: '28P01' };
      expect(isAuthenticationError(error)).toBe(true);
    });

    test('should detect invalid_authorization_specification error code', () => {
      const error = { code: '28000' };
      expect(isAuthenticationError(error)).toBe(true);
    });

    test('should detect invalid_password GSSAPI error code', () => {
      const error = { code: '28001' };
      expect(isAuthenticationError(error)).toBe(true);
    });

    test('should detect invalid_catalog_name error code', () => {
      const error = { code: '3D000' };
      expect(isAuthenticationError(error)).toBe(true);
    });

    test('should return false for non-authentication errors', () => {
      expect(isAuthenticationError({ code: '57014' })).toBe(false);
      expect(isAuthenticationError({ code: '23505' })).toBe(false);
      expect(isAuthenticationError({})).toBe(false);
      expect(isAuthenticationError(null)).toBe(false);
      expect(isAuthenticationError(undefined)).toBe(false);
    });

    test('should return false for errors without code', () => {
      const error = { message: 'authentication failed' };
      expect(isAuthenticationError(error)).toBe(false);
    });
  });
});
