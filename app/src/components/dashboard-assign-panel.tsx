"use client";

import { useState } from "react";
import { UserPlus, Trash2 } from "lucide-react";
import {
  useDashboardShares,
  useAssignDashboard,
  useRemoveDashboardShare,
} from "@/hooks/use-dashboards";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Alert,
  AlertDescription,
} from "@neoboard/components";
import { LoadingButton } from "@neoboard/components";

interface DashboardAssignPanelProps {
  dashboardId: string;
}

export function DashboardAssignPanel({ dashboardId }: DashboardAssignPanelProps) {
  const { data: shares, isLoading } = useDashboardShares(dashboardId);
  const assign = useAssignDashboard(dashboardId);
  const removeShare = useRemoveDashboardShare(dashboardId);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [error, setError] = useState<string | null>(null);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await assign.mutateAsync({ email, role });
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign user");
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">User Assignments</h3>

      <form onSubmit={handleAssign} className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="assign-email" className="text-xs">
            Email
          </Label>
          <Input
            id="assign-email"
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-8 text-sm"
          />
        </div>
        <div className="w-28 space-y-1">
          <Label htmlFor="assign-role" className="text-xs">
            Role
          </Label>
          <Select
            value={role}
            onValueChange={(v) => setRole(v as "viewer" | "editor")}
          >
            <SelectTrigger id="assign-role" className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <LoadingButton
          type="submit"
          size="sm"
          loading={assign.isPending}
          loadingText="Assigning..."
          className="h-8"
        >
          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
          Assign
        </LoadingButton>
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        {isLoading && (
          <p className="text-xs text-muted-foreground">Loading assignments…</p>
        )}
        {!isLoading && (!shares || shares.length === 0) && (
          <p className="text-xs text-muted-foreground">
            No users assigned yet.
          </p>
        )}
        {shares?.map((share) => (
          <div
            key={share.id}
            className="flex items-center justify-between rounded border px-3 py-2 text-sm"
          >
            <div>
              <span className="font-medium">
                {share.userName ?? share.userEmail}
              </span>
              {share.userName && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({share.userEmail})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs capitalize text-muted-foreground">
                {share.role}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => removeShare.mutate(share.id)}
                aria-label={`Remove ${share.userEmail}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
