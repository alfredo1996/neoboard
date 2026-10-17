import * as React from "react";
import { cn } from "@/lib/utils";
import { PRODUCT_NAME } from "./product";

export interface WordmarkProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The rail mark: the citrine square alone. */
  collapsed?: boolean;
}

/** The citrine square beside the product name, in the sans face. */
function Wordmark({
  collapsed = false,
  className,
  ...rest
}: Readonly<WordmarkProps>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 text-wordmark",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden
        className="h-3 w-3 shrink-0 rounded-[3px] bg-[hsl(var(--brand))]"
      />
      <span className={collapsed ? "sr-only" : undefined}>{PRODUCT_NAME}</span>
    </span>
  );
}

export { Wordmark };
