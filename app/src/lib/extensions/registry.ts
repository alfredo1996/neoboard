/**
 * Generic extension point — typed registry where modules register handlers
 * that the core looks up at runtime. Used by the extension system to keep
 * enterprise features out of the open-source core.
 */

export interface ExtensionPoint<T> {
  /** Add a handler. Later registrations appear after earlier ones in getAll(). */
  register(handler: T): void;
  /** Return a snapshot of all registered handlers (safe to mutate). */
  getAll(): T[];
  /** Return the first registered handler, or undefined if empty. */
  getFirst(): T | undefined;
  /** Number of registered handlers. */
  size(): number;
  /** Remove all handlers — primarily for test isolation. */
  clear(): void;
}

export function createExtensionPoint<T>(): ExtensionPoint<T> {
  const handlers: T[] = [];
  return {
    register: (h) => {
      handlers.push(h);
    },
    getAll: () => [...handlers],
    getFirst: () => handlers[0],
    size: () => handlers.length,
    clear: () => {
      handlers.length = 0;
    },
  };
}
