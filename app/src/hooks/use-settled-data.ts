import { useState } from "react";

/**
 * The data of the last settled run of a mutation. A re-run starts a fresh
 * mutation whose `data` is undefined until it settles; anything derived from
 * it (the editor's column pickers) would unmount mid-run. A reset or an error
 * settles with no data, so those still clear.
 *
 * A Stop (#2445) also settles with no data, but when the stopped query's text
 * is the text that produced the last data, that data is kept: the columns are
 * still the right ones. A stop of a changed text clears, as an error does.
 */
export function useSettledData<T>(mutation: {
  isPending: boolean;
  data: T | undefined;
  isStopped?: boolean;
  variables?: { query: string };
}): T | undefined {
  const [settled, setSettled] = useState({
    data: mutation.data,
    query: mutation.variables?.query,
  });
  if (mutation.isPending || mutation.data === settled.data) {
    return settled.data;
  }
  if (mutation.isStopped && mutation.variables?.query === settled.query) {
    return settled.data;
  }
  // Adjusting state during render — React re-renders before committing.
  setSettled({ data: mutation.data, query: mutation.variables?.query });
  return mutation.data;
}
