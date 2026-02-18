import { Database, MoreVertical, Pencil, Trash2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConnectionStatus } from "./connection-status";
import type { ConnectionState } from "./connection-status";
import { cn } from "@/lib/utils";

export interface ConnectionCardProps {
  name: string;
  host: string;
  database?: string;
  status: ConnectionState;
  statusText?: string;
  active?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onTest?: () => void;
  onClick?: () => void;
  className?: string;
}

function ConnectionCard({
  name,
  host,
  database,
  status,
  statusText,
  active = false,
  onEdit,
  onDelete,
  onTest,
  onClick,
  className,
}: ConnectionCardProps) {
  return (
    <Card
      className={cn(
        "transition-colors",
        active && "border-primary",
        onClick && "cursor-pointer hover:bg-accent/50",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
          <Database className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{name}</p>
            <ConnectionStatus status={status} />
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {host}
            {database && ` / ${database}`}
          </p>
          {status === "error" && statusText && (
            <p className="text-xs text-destructive truncate" title={statusText}>
              {statusText}
            </p>
          )}
        </div>
        {(onEdit || onDelete || onTest) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Connection actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onTest && (
                <DropdownMenuItem onClick={onTest}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Test Connection
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardContent>
    </Card>
  );
}

export { ConnectionCard };
