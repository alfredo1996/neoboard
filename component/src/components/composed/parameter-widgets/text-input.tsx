"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TextInputParameterProps {
  parameterName: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Pure presentational text input for a parameter widget.
 * No business logic, no store access — all state managed by the parent.
 */
function TextInputParameter({
  parameterName,
  value,
  onChange,
  placeholder = "Enter a value…",
  className,
}: TextInputParameterProps) {
  const inputId = `param-text-${parameterName}`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={inputId} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {parameterName}
      </Label>
      <div className="relative flex items-center">
        <Input
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-8"
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => onChange("")}
            aria-label={`Clear ${parameterName}`}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

export { TextInputParameter };
