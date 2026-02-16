import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface DataGridRowAction {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface DataGridRowActionsProps {
  actions: DataGridRowAction[];
  className?: string;
}

function DataGridRowActions({ actions, className }: DataGridRowActionsProps) {
  if (!actions.length) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn("flex h-8 w-8 p-0 data-[state=open]:bg-muted", className)}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]">
        {actions.map((action, index) => (
          <div key={action.label}>
            {action.destructive && index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={action.onClick}
              disabled={action.disabled}
              className={cn(
                action.destructive && "text-destructive focus:text-destructive"
              )}
            >
              {action.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { DataGridRowActions };
export type { DataGridRowActionsProps };
