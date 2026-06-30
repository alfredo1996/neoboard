import { QueryStatus } from '../src/generalized/interfaces';
import { determineQueryStatus } from '../src/generalized/utils';

describe('determineQueryStatus', () => {
  test('returns NO_DATA when rowCount is 0', () => {
    expect(determineQueryStatus(0, 100)).toBe(QueryStatus.NO_DATA);
  });

  test('returns COMPLETE when rowCount is within limit', () => {
    expect(determineQueryStatus(50, 100)).toBe(QueryStatus.COMPLETE);
  });

  test('returns COMPLETE_TRUNCATED when rowCount exceeds limit', () => {
    expect(determineQueryStatus(101, 100)).toBe(QueryStatus.COMPLETE_TRUNCATED);
  });

  test('returns COMPLETE when rowCount equals limit (at-limit edge case)', () => {
    expect(determineQueryStatus(100, 100)).toBe(QueryStatus.COMPLETE);
  });

  test('returns COMPLETE for single row with high limit', () => {
    expect(determineQueryStatus(1, 5000)).toBe(QueryStatus.COMPLETE);
  });
});
