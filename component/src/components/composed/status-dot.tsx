import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusDotVariants = cva(
  "inline-block rounded-full",
  {
    variants: {
      variant: {
        default: "bg-gray-500",
        success: "bg-green-500",
        warning: "bg-yellow-500",
        error: "bg-red-500",
        info: "bg-blue-500",
      },
      size: {
        sm: "h-2 w-2",
        md: "h-2.5 w-2.5",
        lg: "h-3 w-3",
      },
      pulse: {
        true: "animate-pulse",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
      pulse: false,
    },
  }
);

export interface StatusDotProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusDotVariants> {
  label?: string;
}

function StatusDot({
  variant,
  size,
  pulse,
  label,
  className,
  ...props
}: StatusDotProps) {
  return (
    <span className="inline-flex items-center gap-2" {...props}>
      <span className={cn(statusDotVariants({ variant, size, pulse }), className)} />
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
}

export { StatusDot, statusDotVariants };
