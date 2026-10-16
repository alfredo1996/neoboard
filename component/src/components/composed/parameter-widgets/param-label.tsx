import * as React from "react";
import { Label } from "@/components/ui/label";
import { humanizeParamName } from "@/lib/humanize-param-name";

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
