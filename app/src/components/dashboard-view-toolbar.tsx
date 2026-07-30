"use client";

import React, { useCallback, useState } from "react";
import { ArrowLeft, Filter, Pencil, RefreshCw } from "lucide-react";
import { ShortcutHint } from "@/components/shortcut-hint";
import { useCountdown } from "@/hooks/use-countdown";
import {
  Badge,
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
  TimeAgo,
  Toolbar,
  ToolbarSection,
  ToolbarSeparator,
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
  role?: string;
  updatedAt: string | Date;
  updatedByName?: string | null;
  canEdit: boolean;
  isFetching: boolean;
  /** Effective auto-refresh interval in ms, or false when off. */
  refetchInterval: number | false;
  onApplyInterval: (seconds: number | "off") => void;
  hasParameters: boolean;
  parameterCount: number;
  showParameterBar: boolean;
  onToggleParameterBar: () => void;
  isEnteringEdit: boolean;
  onBack: () => void;
  onEdit: () => void;
}

/**
 * View-mode chrome: title, auto-refresh menu, parameter toggle, Edit.
 *
 * The auto-refresh countdown lives here rather than in DashboardWorkspace so
 * its 1Hz tick re-renders the toolbar alone and never the widget tree.
 */
export function DashboardViewToolbar({
  name,
  role,
  updatedAt,
  updatedByName,
  canEdit,
  isFetching,
  refetchInterval,
  onApplyInterval,
  hasParameters,
  parameterCount,
  showParameterBar,
  onToggleParameterBar,
  isEnteringEdit,
  onBack,
  onEdit,
}: DashboardViewToolbarProps) {
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
    const s = parseInt(customSeconds, 10);
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
  // Toolbar button label: show interval + live countdown when active
  const buttonLabel =
    countdown !== null
      ? `${intervalLabel} · ${formatCountdown(countdown)}`
      : intervalLabel;

  return (
    <Toolbar>
      <ToolbarSection>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </ToolbarSection>
      <ToolbarSection className="flex-1">
        <h1 className="text-lg font-bold">{name}</h1>
        <Badge variant="secondary">{role}</Badge>
        <span className="text-xs text-muted-foreground">
          · updated <TimeAgo date={updatedAt} showTooltip={false} />
          {updatedByName ? <> by {updatedByName}</> : null}
        </span>
      </ToolbarSection>
      <ToolbarSection>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!hasParameters}
          onClick={onToggleParameterBar}
          aria-label={showParameterBar ? "Hide parameters" : "Show parameters"}
        >
          <Filter className="mr-2 h-4 w-4" />
          Filters
          {hasParameters && parameterCount > 0 && (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
              {parameterCount}
            </span>
          )}
        </Button>
        {canEdit && (
          <>
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
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
                  <DropdownMenuRadioItem value="off">Off</DropdownMenuRadioItem>
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
                        if (e.key === "Enter") handleCustomApply();
                      }}
                      className="h-7 text-xs"
                      data-testid="custom-interval-input"
                    />
                    <Button
                      size="sm"
                      variant="outline"
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
            <ToolbarSeparator />
            <LoadingButton
              size="sm"
              loading={isEnteringEdit}
              loadingText="Opening editor..."
              title="Edit dashboard (Cmd+E)"
              onClick={onEdit}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
              <ShortcutHint combo="Cmd+E" />
            </LoadingButton>
          </>
        )}
      </ToolbarSection>
    </Toolbar>
  );
}
