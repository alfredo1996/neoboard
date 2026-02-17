/**
 * Type guard that checks whether a given value is an object
 * containing a `message` property of type string.
 *
 * This is typically used to safely handle and inspect thrown errors.
 *
 * @param {unknown} err - The value to check.
 * @returns {boolean} True if the value is an object with a string `message` property.
 */
export function errorHasMessage(err: unknown): err is { message: string } {
  return typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string';
}
