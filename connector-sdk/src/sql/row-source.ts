import { on, type EventEmitter } from "node:events";

export interface RowSourceOptions {
  /** EventEmitter only: the event that carries one row. Default `"row"`. */
  rowEvent?: string;
  /** EventEmitter only: the events that end the rows. Default `["end", "done"]`. */
  endEvents?: string[];
  /**
   * EventEmitter only: pause the emitter once this many rows wait unread, and
   * resume it as they are consumed. The emitter needs `pause()` and `resume()`.
   */
  highWaterMark?: number;
  /**
   * Called when iteration stops before the source ends — an early return or an
   * error — to cancel the request or free the connection.
   */
  release?: () => void;
}

/**
 * Adapts a driver's row source to the `AsyncIterable` that `collectUpToLimit`
 * and `drainRetainingUpTo` consume.
 *
 * A Node `Readable` is already async-iterable and is used as it is: its own
 * buffer bounds how far it reads ahead, and returning early destroys it. An
 * `EventEmitter` is read through `events.on`, which rejects on `error`. Its
 * listeners attach on this call rather than on the first pull, so a row
 * emitted in between is not lost.
 */
export function iterateRows<T>(
  source: AsyncIterable<T> | EventEmitter,
  options: RowSourceOptions = {},
): AsyncIterable<T> {
  const {
    rowEvent = "row",
    endEvents = ["end", "done"],
    highWaterMark,
    release,
  } = options;
  const rows =
    Symbol.asyncIterator in source
      ? source
      : firstArguments<T>(
          on(source, rowEvent, { close: endEvents, highWaterMark }),
        );
  return releasedIfUnfinished(rows, release);
}

async function* firstArguments<T>(
  events: AsyncIterable<unknown[]>,
): AsyncGenerator<T> {
  for await (const [row] of events) yield row as T;
}

async function* releasedIfUnfinished<T>(
  rows: AsyncIterable<T>,
  release?: () => void,
): AsyncGenerator<T> {
  let ended = false;
  try {
    yield* rows;
    ended = true;
  } finally {
    if (!ended) release?.();
  }
}
