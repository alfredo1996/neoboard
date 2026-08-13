import type { ReactNode } from "react";
import {
  Database,
  MoreVertical,
  Pencil,
  Trash2,
  RefreshCw,
  Copy,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  /**
   * Optional connector-type icon (e.g. a Neo4j or PostgreSQL logo). Falls back
   * to a generic database glyph so every type is visually distinct (#1043).
   * Passed in by the app to keep this library free of app-specific assets.
   */
  icon?: ReactNode;
  database?: string;
  status: ConnectionState;
  statusText?: string;
  active?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onTest?: () => void;
  onDuplicate?: () => void;
  onClick?: () => void;
  /** Renders a "Shared" badge — the connection is workspace-visible. */
  shared?: boolean;
  /** Menu action to toggle sharing; label comes from toggleVisibilityLabel. */
  onToggleVisibility?: () => void;
  toggleVisibilityLabel?: string;
  className?: string;
}

function ConnectionCard({
  name,
  host,
  icon,
  database,
  status,
  statusText,
  active = false,
  onEdit,
  onDelete,
  onTest,
  onDuplicate,
  onClick,
  shared = false,
  onToggleVisibility,
  toggleVisibilityLabel = "Share with workspace",
  className,
}: ConnectionCardProps) {
  return (
    <Card
      className={cn(
        "transition-colors",
        active && "border-primary",
        onClick && "cursor-pointer hover:bg-accent/50",
        className,
      )}
    >
      <CardContent className="flex items-center gap-3 p-4">
        {/* #1283: the whole card used to be a click target on a bare <div>
            — no role, no tab stop, no key handler — so the error detail it
            reveals was unreachable for exactly the users who need it.

            Only the NAME AND HOST go inside the button. ConnectionStatus
            carries role="status" (a live region, #1059), and HTML-AAM makes
            button descendants presentational — nesting it would strip the
            live-region semantics and stop connection-state changes being
            announced. It and the Shared badge are siblings, like the actions
            menu below. */}
        {(() => {
          const label = (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                {icon ?? <Database className="h-5 w-5 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium truncate">{name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {host}
                  {database && ` / ${database}`}
                </p>
              </div>
            </>
          );
          return onClick ? (
            <button
              type="button"
              onClick={onClick}
              className="flex flex-1 items-center gap-3 min-w-0 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {label}
            </button>
          ) : (
            <div className="flex flex-1 items-center gap-3 min-w-0">
              {label}
            </div>
          );
        })()}
        <div className="flex shrink-0 items-center gap-2">
          <ConnectionStatus
            status={status}
            errorMessage={status === "error" ? statusText : undefined}
          />
          {shared && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Users className="h-3 w-3" />
              Shared
            </Badge>
          )}
        </div>
        {(onEdit ||
          onDelete ||
          onTest ||
          onDuplicate ||
          onToggleVisibility) && (
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
              {onDuplicate && (
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {onToggleVisibility && (
                <DropdownMenuItem onClick={onToggleVisibility}>
                  <Users className="mr-2 h-4 w-4" />
                  {toggleVisibilityLabel}
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
