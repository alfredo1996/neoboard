/**
 * One limiter for every browser request to /api/query (#2443).
 *
 * `next start` serves HTTP/1.1 and the browser opens six connections per
 * origin. A dashboard of slow cards used to own all six, and the navigation's
 * own request queued behind them. Requests now wait here, below that pool, so
 * a navigation always finds a free connection.
 *
 * ponytail: four in flight per tab; over HTTP/2 the browser pool is no longer
 * the limit and this can rise. The slot frees when headers arrive, not when
 * the caller has read the JSON body, so a result near the row cap can briefly
 * overshoot the four.
 */
export const QUERY_FETCH_LIMIT = 4;

let inFlight = 0;
const waiting: (() => void)[] = [];
// Bumped by the test reset, so a request that settles after it frees nothing.
let epoch = 0;

function release() {
  inFlight--;
  waiting.shift()?.();
}

function acquire(signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (inFlight < QUERY_FETCH_LIMIT) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const start = () => {
      signal?.removeEventListener("abort", onAbort);
      inFlight++;
      resolve();
    };
    const onAbort = () => {
      // start() removes this listener, so a waiter that fires is still queued.
      waiting.splice(waiting.indexOf(start), 1);
      reject(signal?.reason);
    };
    waiting.push(start);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Test-only: drop every taken slot and queued waiter. Production never calls
 * it; the vitest setup does after each test so one test's never-settling
 * request cannot starve the next one's.
 */
export function __resetLimitedFetchForTests(): void {
  epoch++;
  inFlight = 0;
  waiting.length = 0;
}

/** `fetch`, but at most QUERY_FETCH_LIMIT calls run at once. */
export async function limitedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  await acquire(init?.signal);
  const mine = epoch;
  try {
    return await fetch(input, init);
  } finally {
    if (mine === epoch) release();
  }
}
