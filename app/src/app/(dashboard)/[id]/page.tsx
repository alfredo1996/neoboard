"use client";

import React, { use, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Filter, Pencil, LayoutDashboard, RefreshCw } from "lucide-react";
import { useDashboard, useUpdateDashboard } from "@/hooks/use-dashboards";
import { useParameterStore } from "@/stores/parameter-store";
import { filterParentParams } from "@/lib/format-parameter-value";
import { DashboardContainer } from "@/components/dashboard-container";
import { PageTabs } from "@/components/page-tabs";
import { migrateLayout } from "@/lib/migrate-layout";
import { getRefetchInterval } from "@/lib/dashboard-settings";
import { useCountdown } from "@/hooks/use-countdown";
import type { DashboardSettings } from "@/lib/db/schema";
import {
  Button,
  Badge,
  Skeleton,
  Input,
  LoadingButton,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@neoboard/components";
import {
  EmptyState,
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

export default function DashboardViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const saveToDashboard = useParameterStore((s) => s.saveToDashboard);
  const restoreFromDashboard = useParameterStore((s) => s.restoreFromDashboard);
  const prevDashboardId = useRef<string | null>(null);

  useEffect(() => {
    if (prevDashboardId.current && prevDashboardId.current !== id) {
      saveToDashboard(prevDashboardId.current);
    }
    prevDashboardId.current = id;
    restoreFromDashboard(id);
    return () => {
      saveToDashboard(id);
    };
  }, [id, saveToDashboard, restoreFromDashboard]);

  const { data: dashboard, isLoading, isFetching } = useDashboard(id);
  const updateDashboard = useUpdateDashboard();
  const parameters = useParameterStore((s) => s.parameters);
  const parameterCount = useMemo(
    () => filterParentParams(Object.entries(parameters)).length,
    [parameters],
  );
  const hasParameters = parameterCount > 0;
  const [showParameterBar, setShowParameterBar] = useState(true);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [visitedPages, setVisitedPages] = useState<Set<number>>(
    () => new Set([0])
  );

  function markVisited(index: number) {
    setVisitedPages((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }

  function handleSelectPage(index: number) {
    markVisited(index);
    setActivePageIndex(index);
  }
  const [isPending, startTransition] = useTransition();
  const layout = useMemo(
    () => (dashboard ? migrateLayout(dashboard.layoutJson) : null),
    [dashboard]
  );

  // Auto-refresh: local override (null = use persisted settings from layout).
  // Keyed by dashboard id so navigating to a different dashboard resets the override.
  const [localSettings, setLocalSettings] = useState<{ dashboardId: string; settings: DashboardSettings } | null>(null);
  const activeLocalSettings = localSettings?.dashboardId === id ? localSettings.settings : null;
  const autoRefreshSettings = activeLocalSettings ?? layout?.settings ?? {};
  const refetchInterval = getRefetchInterval(autoRefreshSettings);

  // Countdown to the next auto-refresh tick
  const countdown = useCountdown(refetchInterval);

  // Custom interval input state (seconds as string — validated on apply)
  const [customSeconds, setCustomSeconds] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Promise queue to serialize persist writes and prevent out-of-order saves
  const persistQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const applyInterval = useCallback(
    (seconds: number | "off") => {
      const newSettings: DashboardSettings =
        seconds === "off"
          ? { autoRefresh: false }
          : { autoRefresh: true, refreshIntervalSeconds: seconds };
      setLocalSettings({ dashboardId: id, settings: newSettings });
      if (layout) {
        const payload = { id, layoutJson: { ...layout, settings: newSettings } };
        persistQueueRef.current = persistQueueRef.current
          .catch(() => undefined)
          .then(() => updateDashboard.mutateAsync(payload))
          .catch((err: unknown) => {
            console.error("[auto-save] Failed to persist dashboard settings:", err);
          });
      }
    },
    [id, layout, updateDashboard],
  );

  const handleIntervalChange = useCallback(
    (value: string) => {
      applyInterval(value === "off" ? "off" : Number(value));
    },
    [applyInterval],
  );

  const handleCustomApply = useCallback(() => {
    const s = parseInt(customSeconds, 10);
    if (!Number.isFinite(s) || s < 5) return; // minimum 5s
    applyInterval(s);
    setCustomSeconds("");
    setDropdownOpen(false);
  }, [customSeconds, applyInterval]);

  // Derive display values from the effective (normalized) interval
  const effectiveSeconds = typeof refetchInterval === "number" ? refetchInterval / 1000 : null;
  const intervalLabel = effectiveSeconds !== null
    ? formatInterval(effectiveSeconds)
    : "Auto-refresh";
  const dropdownValue = effectiveSeconds !== null ? String(effectiveSeconds) : "off";
  // Toolbar button label: show interval + live countdown when active
  const buttonLabel = countdown !== null
    ? `${intervalLabel} · ${formatCountdown(countdown)}`
    : intervalLabel;

  const handleNavigateToPage = useCallback(
    (pageId: string) => {
      if (!layout) return;
      const index = layout.pages.findIndex((p) => p.id === pageId);
      if (index >= 0) {
        markVisited(index);
        setActivePageIndex(index);
      }
    },
    [layout]
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-6">
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[200px]" />
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<LayoutDashboard className="h-12 w-12" />}
          title="Dashboard not found"
          description="The dashboard you're looking for doesn't exist or you don't have access."
          action={
            <Button onClick={() => router.push("/")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboards
            </Button>
          }
        />
      </div>
    );
  }

  // layout is non-null here because dashboard is defined (guarded above)
  const resolvedLayout = layout!;
  const safeIndex = Math.min(activePageIndex, resolvedLayout.pages.length - 1);
  const canEdit = dashboard.role === "owner" || dashboard.role === "editor" || dashboard.role === "admin";

  return (
    <div className="flex flex-col h-full">
      <Toolbar>
        <ToolbarSection>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </ToolbarSection>
        <ToolbarSection className="flex-1">
          <h1 className="text-lg font-bold">{dashboard.name}</h1>
          <Badge variant="secondary">{dashboard.role}</Badge>
          <span className="text-xs text-muted-foreground">
            · updated <TimeAgo date={dashboard.updatedAt} showTooltip={false} />
            {dashboard.updatedByName ? <> by {dashboard.updatedByName}</> : null}
          </span>
        </ToolbarSection>
        <ToolbarSection>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!hasParameters}
            onClick={() => setShowParameterBar((prev) => !prev)}
            aria-label={showParameterBar ? "Hide parameters" : "Show parameters"}
          >
            <Filter className="mr-2 h-4 w-4" />
            {!hasParameters || showParameterBar ? "Filters" : `Filters (${parameterCount})`}
          </Button>
          {canEdit && (
            <>
              <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" data-testid="auto-refresh-trigger">
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
                    <DropdownMenuRadioItem value="30">30 seconds</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="60">1 minute</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="300">5 minutes</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="600">10 minutes</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 space-y-1.5">
                    <p className="text-xs text-muted-foreground">Custom (seconds)</p>
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        min={5}
                        placeholder="e.g. 5"
                        value={customSeconds}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomSeconds(e.target.value)}
                        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") handleCustomApply(); }}
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
                loading={isPending}
                loadingText="Opening editor..."
                onClick={() => startTransition(() => router.push(`/${id}/edit?page=${safeIndex}`))}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </LoadingButton>
            </>
          )}
        </ToolbarSection>
      </Toolbar>

      {resolvedLayout.pages.length > 1 && (
        <PageTabs
          pages={resolvedLayout.pages}
          activeIndex={safeIndex}
          editable={false}
          onSelect={handleSelectPage}
        />
      )}

      <div className="flex-1 p-6 relative max-w-[1600px] mx-auto w-full">
        {resolvedLayout.pages.map((page, index) => {
          const isActive = index === safeIndex;
          if (page.widgets.length === 0 && isActive) {
            return (
              <EmptyState
                key={page.id}
                icon={<LayoutDashboard className="h-12 w-12" />}
                title="No widgets yet"
                description="This page has no widgets."
                action={
                  canEdit ? (
                    <Button onClick={() => router.push(`/${id}/edit`)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Add widgets in the editor
                    </Button>
                  ) : undefined
                }
              />
            );
          }
          if (page.widgets.length === 0) return null;
          if (!visitedPages.has(index)) return null;
          return (
            <div
              key={page.id}
              className={isActive ? undefined : "hidden"}
              aria-hidden={!isActive}
            >
              <DashboardContainer page={page} refetchInterval={refetchInterval} onNavigateToPage={handleNavigateToPage} showParameterBar={showParameterBar} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
