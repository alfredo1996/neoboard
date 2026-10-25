import * as React from "react";
import { Label } from "@/components/ui/label";
import { humanizeParamName } from "@/lib/humanize-param-name";

/**
 * A widget card that already shows the selector's title names the parameter
 * (#2232): inside this scope a single select is named after that title (an
 * aria-label, no label line of its own) and its placeholder asks for it
 * ("Pick region…"). `parentLabel` is the parent parameter's name on the page,
 * for the cascading hints; the app resolves it, this library only shows it.
 */
const ParamLabelContext = React.createContext<{
  label?: string;
  parentLabel?: string;
}>({});

export function ParamLabelScope({
  label,
  parentLabel,
  children,
}: Readonly<{
  label?: string;
  parentLabel?: string;
  children: React.ReactNode;
}>) {
  const value = React.useMemo(
    () => ({ label, parentLabel }),
    [label, parentLabel],
  );
  return (
    <ParamLabelContext.Provider value={value}>
      {children}
    </ParamLabelContext.Provider>
  );
}

/** The scope's label, or `undefined` outside one. */
export function useParamLabelScope(): string | undefined {
  return React.useContext(ParamLabelContext).label;
}

/** The parent parameter's name on the page, or `undefined` outside a scope. */
export function useParentLabelScope(): string | undefined {
  return React.useContext(ParamLabelContext).parentLabel;
}

/**
 * The label every parameter widget draws for itself (#2213): the parameter
 * key as words in sentence case, never the raw key in capitals.
 */
export function ParamLabel({
  parameterName,
  ...props
}: Readonly<
  { parameterName: string } & Pick<
    React.ComponentProps<typeof Label>,
    "id" | "htmlFor"
  >
>) {
  return (
    <Label {...props} className="text-xs font-medium text-muted-foreground">
      {humanizeParamName(parameterName)}
    </Label>
  );
}
