import { useState } from "react";

/**
 * The data of the last settled run of a mutation. A re-run starts a fresh
 * mutation whose `data` is undefined until it settles; anything derived from
 * it (the editor's column pickers) would unmount mid-run. A reset or an error
 * settles with no data, so those still clear.
 */
export function useSettledData<T>(mutation: {
  isPending: boolean;
  data: T | undefined;
}): T | undefined {
  const [settled, setSettled] = useState(mutation.data);
  if (!mutation.isPending && mutation.data !== settled) {
    // Adjusting state during render — React re-renders before committing.
    setSettled(mutation.data);
    return mutation.data;
  }
  return settled;
}
