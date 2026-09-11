/**
 * Toast for a finished dashboard delete. A 404 settles as `alreadyDeleted`
 * (someone removed it elsewhere), which is still a success, not a failure
 * (#1750). Name-free on purpose: the name would linger after the card goes.
 */
export function deleteDashboardToast(alreadyDeleted: boolean): {
  title: string;
  description: string;
} {
  return alreadyDeleted
    ? {
        title: "Dashboard already deleted",
        description: "It had been removed elsewhere.",
      }
    : {
        title: "Dashboard deleted",
        description: "The dashboard has been removed.",
      };
}
