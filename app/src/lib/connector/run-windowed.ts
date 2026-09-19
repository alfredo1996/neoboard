/**
 * Run `worker` over `items`, at most `limit` at a time (#1426).
 *
 * A sliding window, not strict batches: a slot refills the moment it frees,
 * so one item that hangs holds one slot and never a whole batch. `onSettled`
 * fires per item as it finishes, whether the worker resolved or threw — a
 * failure is the worker's to report, and never stops the run. Resolves once
 * every item has settled.
 */
export async function runWindowed<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<unknown>,
  onSettled?: (item: T, done: number) => void,
): Promise<void> {
  let next = 0;
  let done = 0;
  const lane = async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item).catch(() => undefined);
      onSettled?.(item, ++done);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, lane),
  );
}
