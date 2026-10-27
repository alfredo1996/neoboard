"use client";

import React, { useCallback, useState } from "react";
import { Pencil, RefreshCw } from "lucide-react";
import { DashboardShareSheet } from "@/components/dashboard-share-sheet";
import { crumbClick } from "@/lib/crumb-click";
import { DashboardMeta } from "@/components/dashboard-meta";
import { ShortcutHint } from "@/components/shortcut-hint";
import { useCountdown } from "@/hooks/use-countdown";
import { PageHeader } from "@neoboard/components/kit";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  LoadingButton,
} from "@neoboard/components";

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function formatCountdown(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface DashboardViewToolbarProps {
  name: string;
  updatedAt: string | Date;
  updatedByName?: string | null;
  widgetCount: number;
  isPublic: boolean;
  /** The page tabs, under the title. */
  tabs?: React.ReactNode;
  /** The Filters button; first in the actions, absent on a dashboard with no filters (#2297). */
  filters?: React.ReactNode;
  dashboardId: string;
  /** Admins get the sharing sheet. */
  isAdmin: boolean;
  onTogglePublic: (value: boolean) => void;
  canEdit: boolean;
  isFetching: boolean;
  /** Effective auto-refresh interval in ms, or false when off. */
  refetchInterval: number | false;
  onApplyInterval: (seconds: number | "off") => void;
  isEnteringEdit: boolean;
  /** The "Dashboards" crumb. */
  onDashboards: () => void;
  onEdit: () => void;
}

/**
 * View-mode page header: breadcrumb, title, meta, auto-refresh menu, Edit.
 *
 * The auto-refresh countdown lives here rather than in DashboardWorkspace so
 * its 1Hz tick re-renders the header alone and never the widget tree.
 */
export function DashboardViewToolbar({
  name,
  updatedAt,
  updatedByName,
  widgetCount,
  isPublic,
  tabs,
  filters,
  dashboardId,
  isAdmin,
  onTogglePublic,
  canEdit,
  isFetching,
  refetchInterval,
  onApplyInterval,
  isEnteringEdit,
  onDashboards,
  onEdit,
}: Readonly<DashboardViewToolbarProps>) {
  const countdown = useCountdown(refetchInterval);
  const [customSeconds, setCustomSeconds] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleIntervalChange = useCallback(
    (value: string) => {
      onApplyInterval(value === "off" ? "off" : Number(value));
    },
    [onApplyInterval],
  );

  const handleCustomApply = useCallback(() => {
    const s = Number.parseInt(customSeconds, 10);
    if (!Number.isFinite(s) || s < 5) return; // minimum 5s
    onApplyInterval(s);
    setCustomSeconds("");
    setDropdownOpen(false);
  }, [customSeconds, onApplyInterval]);

  // Derive display values from the effective (normalized) interval
  const effectiveSeconds =
    typeof refetchInterval === "number" ? refetchInterval / 1000 : null;
  const intervalLabel =
    effectiveSeconds !== null
      ? formatInterval(effectiveSeconds)
      : "Auto-refresh";
  const dropdownValue =
    effectiveSeconds !== null ? String(effectiveSeconds) : "off";
  // Header button label: show interval + live countdown when active
  const buttonLabel =
    countdown !== null
      ? `${intervalLabel} · ${formatCountdown(countdown)}`
      : intervalLabel;

  return (
    <PageHeader
      breadcrumb={[
        {
          label: "Dashboards",
          href: "/",
          onClick: crumbClick(onDashboards),
        },
        { label: name },
      ]}
      title={name}
      meta={
        <DashboardMeta
          updatedAt={updatedAt}
          updatedByName={updatedByName}
          widgetCount={widgetCount}
          isPublic={isPublic}
        />
      }
      tabs={tabs}
      actions={
        <>
          {filters}
          {isAdmin && (
            <DashboardShareSheet
              dashboardId={dashboardId}
              isPublic={isPublic}
              onTogglePublic={onTogglePublic}
              label="Share"
            />
          )}
          {canEdit && (
            <>
              <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid="auto-refresh-trigger"
                  >
                    <RefreshCw
                      className={`mr-2 h-4 w-4${isFetching ? " animate-spin" : ""}`}
                    />
                    {buttonLabel}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>Auto-refresh</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={dropdownValue}
                    onValueChange={handleIntervalChange}
                  >
                    <DropdownMenuRadioItem value="off">
                      Off
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="30">
                      30 seconds
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="60">
                      1 minute
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="300">
                      5 minutes
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="600">
                      10 minutes
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                      Custom (seconds)
                    </p>
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        min={5}
                        placeholder="e.g. 5"
                        value={customSeconds}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setCustomSeconds(e.target.value)
                        }
                        onKeyDown={(e: React.KeyboardEvent) => {
                          // Radix menu typeahead would steal focus on character keys.
                          if (e.key.length === 1) e.stopPropagation();
                          if (e.key === "Enter") handleCustomApply();
                        }}
                        className="h-7 text-xs"
                        data-testid="custom-interval-input"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-xs"
                        onClick={handleCustomApply}
                        data-testid="custom-interval-apply"
                      >
                        Set
                      </Button>
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              <LoadingButton
                size="sm"
                loading={isEnteringEdit}
                loadingText="Opening editor..."
                title="Edit dashboard (Cmd+E)"
                onClick={onEdit}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
                {/* The hint is for wide headers: at tablet width the actions must not wrap it taller. */}
                <span className="hidden lg:contents">
                  <ShortcutHint combo="Cmd+E" />
                </span>
              </LoadingButton>
            </>
          )}
        </>
      }
    />
  );
}
