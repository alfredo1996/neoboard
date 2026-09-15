"use client";

import {
  Badge,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@neoboard/components";
import type { UserRole } from "@/lib/db/schema";

export type CanWriteCellProps = Readonly<{
  id: string;
  role: UserRole;
  canWrite: boolean;
  isSelf: boolean;
  isAdmin: boolean;
  onToggle: (id: string, checked: boolean) => void;
}>;

export function CanWriteCell({
  id,
  role,
  canWrite,
  isSelf,
  isAdmin,
  onToggle,
}: CanWriteCellProps) {
  // Admins always write; readers never write; others use DB value
  const effectiveCanWrite = role === "admin" || (role !== "reader" && canWrite);
  if (!isAdmin) {
    return (
      <Badge variant={effectiveCanWrite ? "default" : "secondary"}>
        {effectiveCanWrite ? "Yes" : "No"}
      </Badge>
    );
  }

  // Disable toggle for self, admins (always on), and readers (always off)
  const disabled = isSelf || role !== "creator";
  const toggle = (
    <Switch
      checked={effectiveCanWrite}
      disabled={disabled}
      onCheckedChange={(checked) => onToggle(id, checked)}
    />
  );

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed opacity-60">
            {toggle}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {isSelf
            ? "You cannot change your own write permission"
            : "Readers cannot run their own write queries, but they can still submit forms"}
        </TooltipContent>
      </Tooltip>
    );
  }

  return toggle;
}
