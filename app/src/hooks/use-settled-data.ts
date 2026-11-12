import { useState } from "react";

/**
 * The data of the last settled run of a mutation. A re-run starts a fresh
 * mutation whose `data` is undefined until it settles; anything derived from
 * it (the editor's column pickers) would unmount mid-run. A reset or an error
 * settles with no data, so those still clear.
 *
 * A Stop (#2445) also settles with no data, but when the stopped run asked the
 * same question as the run that produced the last data (same query text,
 * connection and database), that data is kept: the columns are still the right
 * ones. A stop of anything else clears, as an error does.
 */
type RunVariables = {
  query: string;
  connectionId?: string;
  database?: string;
};

const identity = (v?: RunVariables) =>
  v && JSON.stringify([v.query, v.connectionId, v.database]);

export function useSettledData<T>(mutation: {
  isPending: boolean;
  data: T | undefined;
  isStopped?: boolean;
  variables?: RunVariables;
}): T | undefined {
  const [settled, setSettled] = useState({
    data: mutation.data,
    run: identity(mutation.variables),
  });
  if (mutation.isPending || mutation.data === settled.data) {
    return settled.data;
  }
  if (mutation.isStopped && identity(mutation.variables) === settled.run) {
    return settled.data;
  }
  // Adjusting state during render — React re-renders before committing.
  setSettled({ data: mutation.data, run: identity(mutation.variables) });
  return mutation.data;
}
