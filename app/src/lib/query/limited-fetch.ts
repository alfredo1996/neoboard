/**
 * One limiter for every browser request to /api/query (#2443).
 *
 * `next start` serves HTTP/1.1 and the browser opens six connections per
 * origin. A dashboard of slow cards used to own all six, and the navigation's
 * own request queued behind them. Requests now wait here, below that pool, so
 * a navigation always finds a free connection.
 *
 * ponytail: four in flight per tab; over HTTP/2 the browser pool is no longer
 * the limit and this can rise.
 */
export const QUERY_FETCH_LIMIT = 4;

let inFlight = 0;
const waiting: (() => void)[] = [];

function release() {
  inFlight--;
  waiting.shift()?.();
}

function abortError(signal: AbortSignal): unknown {
  return (
    signal.reason ??
    new DOMException("The operation was aborted.", "AbortError")
  );
}

function acquire(signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
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
      const i = waiting.indexOf(start);
      if (i >= 0) waiting.splice(i, 1);
      reject(abortError(signal!));
    };
    waiting.push(start);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** `fetch`, but at most QUERY_FETCH_LIMIT calls run at once. */
export async function limitedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  await acquire(init?.signal);
  try {
    return await fetch(input, init);
  } finally {
    release();
  }
}
