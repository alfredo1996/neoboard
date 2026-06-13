"use client";

import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@neoboard/components";
import type { UserRole } from "@/lib/db/schema";

const ROLE_VARIANTS: Record<
  UserRole,
  "default" | "secondary" | "destructive" | "outline"
> = {
  admin: "destructive",
  creator: "default",
  reader: "secondary",
};

export type RoleCellProps = Readonly<{
  role: UserRole;
  isSelf: boolean;
  isAdmin: boolean;
  /** Called with the new role when an admin changes another user's role. */
  onChange: (role: string) => void;
}>;

function RoleSelect({
  role,
  disabled,
  onChange,
}: Readonly<{
  role: UserRole;
  disabled?: boolean;
  onChange?: (role: string) => void;
}>) {
  return (
    <Select value={role} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger className="h-7 w-28 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">Admin</SelectItem>
        <SelectItem value="creator">Creator</SelectItem>
        <SelectItem value="reader">Reader</SelectItem>
      </SelectContent>
    </Select>
  );
}

/**
 * Role column cell for the users table.
 *
 * Non-admin viewers see a static Badge. Admins see a Select for every row —
 * including their own, which renders a *disabled* Select (not a Badge) so the
 * column reads as one consistent control rather than two components (#1038).
 */
export function RoleCell({ role, isSelf, isAdmin, onChange }: RoleCellProps) {
  if (!isAdmin) {
    return (
      <Badge variant={ROLE_VARIANTS[role]} className="capitalize">
        {role}
      </Badge>
    );
  }

  if (isSelf) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">
            <RoleSelect role={role} disabled />
          </span>
        </TooltipTrigger>
        <TooltipContent>You cannot change your own role</TooltipContent>
      </Tooltip>
    );
  }

  return <RoleSelect role={role} onChange={onChange} />;
}
