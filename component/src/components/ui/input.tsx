import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Focus ring is now the solid citrine --ring (was --accent-soft at
          // 12% alpha — effectively invisible). On focus the border also warms
          // to citrine; subtle border-strong on hover for affordance. Motion
          // wired to the design-system tokens.
          "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-[color,border-color,box-shadow] [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-standard)] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-[hsl(var(--border-strong))] focus-visible:border-[hsl(var(--ring))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
