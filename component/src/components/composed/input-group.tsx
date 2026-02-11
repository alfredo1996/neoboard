import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface InputGroupProps extends Omit<React.ComponentProps<"input">, "prefix" | "suffix"> {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  prefixIcon?: React.ReactNode;
  suffixIcon?: React.ReactNode;
}

const InputGroup = React.forwardRef<HTMLInputElement, InputGroupProps>(
  ({ prefix, suffix, prefixIcon, suffixIcon, className, ...props }, ref) => {
    const hasLeft = prefix || prefixIcon;
    const hasRight = suffix || suffixIcon;

    if (!hasLeft && !hasRight) {
      return <Input ref={ref} className={className} {...props} />;
    }

    return (
      <div className={cn("flex items-center", className)}>
        {prefix && (
          <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground h-9">
            {prefix}
          </span>
        )}
        <div className="relative flex-1">
          {prefixIcon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
              {prefixIcon}
            </span>
          )}
          <Input
            ref={ref}
            className={cn(
              prefix && "rounded-l-none",
              suffix && "rounded-r-none",
              prefixIcon && "pl-9",
              suffixIcon && "pr-9"
            )}
            {...props}
          />
          {suffixIcon && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
              {suffixIcon}
            </span>
          )}
        </div>
        {suffix && (
          <span className="inline-flex items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground h-9">
            {suffix}
          </span>
        )}
      </div>
    );
  }
);
InputGroup.displayName = "InputGroup";

export { InputGroup };
