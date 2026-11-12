import { useEffect, useState } from "react";

/** A run may be stopped only after this long, so a click aimed at Run never lands on Stop (#2445). */
export const STOPPABLE_AFTER_MS = 500;

/**
 * True once the current run has been pending for STOPPABLE_AFTER_MS. Keyed on
 * the run (`submittedAt`), so a superseding run restarts the delay.
 */
export function useStoppable(isPending: boolean, submittedAt?: number) {
  const [stoppableRun, setStoppableRun] = useState<number | undefined>();
  useEffect(() => {
    if (!isPending) return;
    const id = setTimeout(
      () => setStoppableRun(submittedAt),
      STOPPABLE_AFTER_MS,
    );
    return () => clearTimeout(id);
  }, [isPending, submittedAt]);
  return isPending && stoppableRun === submittedAt;
}
