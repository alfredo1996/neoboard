import * as React from "react";
import { Label } from "@/components/ui/label";
import { humanizeParamName } from "@/lib/humanize-param-name";

/**
 * A widget card that already shows the selector's title names the parameter
 * (#2232): inside this scope a single select is named after that title (an
 * aria-label, no label line of its own) and its placeholder asks for it
 * ("Pick a region…").
 */
const ParamLabelContext = React.createContext<string | undefined>(undefined);

export function ParamLabelScope({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <ParamLabelContext.Provider value={label}>
      {children}
    </ParamLabelContext.Provider>
  );
}

/** The scope's label, or `undefined` outside one. */
export function useParamLabelScope(): string | undefined {
  return React.useContext(ParamLabelContext);
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
