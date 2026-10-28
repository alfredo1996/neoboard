"use client";

import { createContext, useContext, useMemo } from "react";
import { ConfirmDialog } from "@neoboard/components";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";

type RequestNavigation = (url: string, onLeave?: () => void) => boolean;

// Outside a provider nothing is guarded: callers navigate as usual.
const NavigationGuardContext = createContext<RequestNavigation>(() => true);

/** Ask before leaving a dirty editor: the one gate for every way out (#2325). */
export function useNavigationGuard(): RequestNavigation {
  return useContext(NavigationGuardContext);
}

export function NavigationGuardProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const {
    showNavWarning,
    setShowNavWarning,
    returnFocusTo,
    confirmNavigation,
    cancelNavigation,
    requestNavigation,
  } = useUnsavedChangesWarning();
  const value = useMemo(() => requestNavigation, [requestNavigation]);

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={showNavWarning}
        onOpenChange={setShowNavWarning}
        action="Leave without saving"
        consequences="Your unsaved changes are lost."
        cancelText="Stay"
        onConfirm={confirmNavigation}
        onCancel={cancelNavigation}
        returnFocusTo={returnFocusTo}
      />
    </NavigationGuardContext.Provider>
  );
}
