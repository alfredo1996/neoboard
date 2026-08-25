"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LayoutDashboard, Pencil, Plus } from "lucide-react";
import { useDashboard, useUpdateDashboard } from "@/hooks/use-dashboards";
import { useConnections } from "@/hooks/use-connections";
import { useWidgetTemplates } from "@/hooks/use-widget-templates";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useParameterStore } from "@/stores/parameter-store";
import type { ParameterEntry } from "@/stores/parameter-store";
import { useDashboardStore } from "@/stores/dashboard-store";
import { filterParentParams } from "@/lib/parameter/format-parameter-value";
import { buildParameterSourceMap } from "@/lib/parameter/collect-parameter-names";
import { scrollToWidgetWhenReady } from "@/lib/widget/scroll-to-widget";
import {
  parseUrlParams,
  buildParamsUrl,
  extractSyncParams,
} from "@/lib/shared/url-params";
import {
  extractParamDefaults,
  expandParamDefaults,
} from "@/lib/parameter/apply-param-defaults";
import { migrateLayout } from "@/lib/dashboard/migrate-layout";
import { getRefetchInterval } from "@/lib/dashboard/dashboard-settings";
import { classifySaveError } from "@/lib/dashboard/save-error";
import { DashboardContainer } from "@/components/dashboard-container";
import { DashboardErrorBoundary } from "@/components/dashboard-error-boundary";
import { DashboardViewToolbar } from "@/components/dashboard-view-toolbar";
import { DashboardEditToolbar } from "@/components/dashboard-edit-toolbar";
import { PageTabs } from "@/components/page-tabs";
import { WidgetEditorModal } from "@/components/widget-editor-modal";
import { SaveTemplateDialog } from "@/components/save-template-dialog";
import type { ConnectorType } from "@/lib/connector/connector-types";
import type {
  DashboardSettings,
  DashboardWidget,
  GridLayoutItem,
  WidgetTemplate,
} from "@/lib/db/schema";
import {
  Alert,
  AlertDescription,
  Button,
  ConfirmDialog,
  EmptyState,
  Skeleton,
  useToast,
} from "@neoboard/components";

interface DashboardWorkspaceProps {
  id: string;
  /** Driven by the URL segment: /[id] is view, /[id]/edit is edit. */
  editMode: boolean;
  children?: React.ReactNode;
}

/**
 * The whole dashboard UI — both modes — rendered from `[id]/layout.tsx`.
 *
 * View and edit stay two URLs, but they are no longer two page trees. Next
 * preserves a layout across navigation into a child segment, and `edit` is a
 * child of `[id]`, so ⌘E re-renders only the (empty) page slot: the same DOM
 * nodes, chart instances and in-flight queries survive. Nothing unmounts, so
 * the document never collapses and the browser never clamps the scroll offset
 * (#1370), and the active page index — owned by `dashboard-store` — is not
 * re-initialised on the way back out (#1371).
 *
 * `editable` is a plain prop all the way down to `card-container`, so flipping
 * the mode re-renders but never remounts or re-queries.
 */
export function DashboardWorkspace({
  id,
  editMode,
  children,
}: DashboardWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Parameter store lifecycle ───────────────────────────────────────
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

  // URL parameter deep-linking: read URL params on mount (takes precedence)
  const initialUrlParamsApplied = useRef(false);
  useEffect(() => {
    if (initialUrlParamsApplied.current) return;
    initialUrlParamsApplied.current = true;
    const urlParams = parseUrlParams(searchParams);
    const store = useParameterStore.getState();
    for (const [name, value] of Object.entries(urlParams)) {
      store.setParameter(name, value, value, "", "text", "url", "");
    }
  }, [searchParams]);

  // `?page=` is honoured once, on first load, so existing /[id]/edit?page=N
  // links keep working. After that the store owns the index — this rebuild
  // drops `page` from the query string, so re-reading it would reset the page.
  const [initialPage] = useState(() => {
    const raw = searchParams.get("page");
    const parsed = raw === null ? 0 : parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });

  // ── Data ────────────────────────────────────────────────────────────
  const { data: dashboard, isLoading, isFetching } = useDashboard(id);
  const updateDashboard = useUpdateDashboard();
  // The editor's data is dead weight in view mode (#913).
  const { data: connections } = useConnections({ enabled: editMode });
  const { data: allTemplates } = useWidgetTemplates(undefined, {
    enabled: editMode,
  });
  const { data: session } = useSession();
  const systemRole = session?.user?.role ?? "creator";
  const isAdmin = systemRole === "admin";

  const layout = useDashboardStore((s) => s.layout);
  const activePageIndex = useDashboardStore((s) => s.activePageIndex);
  const setLayout = useDashboardStore((s) => s.setLayout);
  const setActivePage = useDashboardStore((s) => s.setActivePage);
  const addPage = useDashboardStore((s) => s.addPage);
  const removePage = useDashboardStore((s) => s.removePage);
  const renamePage = useDashboardStore((s) => s.renamePage);
  const reorderPages = useDashboardStore((s) => s.reorderPages);
  const addWidget = useDashboardStore((s) => s.addWidget);
  const removeWidget = useDashboardStore((s) => s.removeWidget);
  const updateWidget = useDashboardStore((s) => s.updateWidget);
  const updateGridLayout = useDashboardStore((s) => s.updateGridLayout);
  const duplicateWidget = useDashboardStore((s) => s.duplicateWidget);
  const markSaved = useDashboardStore((s) => s.markSaved);
  const { toast, dismiss } = useToast();

  // Load the server layout into the store. Keyed on id:version, NOT on the
  // `dashboard` object identity: useUpdateDashboard invalidates
  // ["dashboards", id] after every save, and re-running this on the resulting
  // refetch is what threw you back to page 1 and clobbered savedLayout/_dirty.
  const loadedStampRef = useRef<string | null>(null);
  useEffect(() => {
    if (!dashboard?.layoutJson) return;
    const stamp = `${dashboard.id}:${dashboard.version}`;
    if (loadedStampRef.current === stamp) return;
    const first = loadedStampRef.current === null;
    // A dirty store holds edits that were never saved — another user's version
    // bump must not silently discard them.
    if (!first && useDashboardStore.getState().hasUnsavedChanges()) return;
    loadedStampRef.current = stamp;
    setLayout(
      migrateLayout(dashboard.layoutJson),
      first ? initialPage : useDashboardStore.getState().activePageIndex,
    );
  }, [dashboard, setLayout, initialPage]);

  // View mode renders the server's layout, edit mode the store's working copy.
  // While the store is clean these are the same object (migrateLayout returns a
  // v2 layout verbatim), so switching source across the toggle remounts
  // nothing; when it is dirty, unsaved edits stay confined to edit mode.
  const serverLayout = useMemo(
    () => (dashboard ? migrateLayout(dashboard.layoutJson) : null),
    [dashboard],
  );

  // Parameters whose widget opted in to URL sync — the only ones allowed in
  // the address bar. `null` until the layout loads, because we can't tell yet.
  const syncParams = useMemo(
    () => (serverLayout ? extractSyncParams(serverLayout) : null),
    [serverLayout],
  );

  // Widget "Default value" settings, applied once per dashboard (#1421).
  //
  // `extractParamDefaults` was written, tested, and never called — so the
  // editor's Default value field wrote into the saved layout and was read only
  // by its own unit test. The seeded Chart Playground carries 21 defaults and
  // showed "Waiting for parameters…" on every chart until each knob was set by
  // hand.
  //
  // Only fills parameters that are not already set, which is what gives the
  // precedence `URL > restored session > default` without any ordering
  // machinery: the restore and URL effects above both run before the layout has
  // loaded, so whatever they put in the store is already there by the time this
  // can run. The ref guard is what stops a cleared parameter snapping back —
  // without it, clearing a knob would be impossible.
  const defaultsAppliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!serverLayout || defaultsAppliedFor.current === id) return;
    defaultsAppliedFor.current = id;

    const defaults = extractParamDefaults(serverLayout);
    const store = useParameterStore.getState();

    // `field` is the parameter name and `source` a human label, matching what
    // `useParamActions` writes when the user picks a value. Passing the value
    // as `source` and "" as `field` — as this did until #1517 — rendered the
    // parameter chip as "= VALUE" with no name, and its tooltip as "Set by
    // <the value>". The widget id is what makes the chip link back.
    //
    // The expansion itself (number-range companions, per-type coercion) lives
    // in `expandParamDefaults` so it is unit testable — this body is not.
    for (const seed of expandParamDefaults(defaults)) {
      if (store.parameters[seed.name] !== undefined) continue;
      store.setParameter(
        seed.name,
        seed.value,
        "Default value",
        seed.name,
        seed.type,
        "default",
        seed.widgetId,
      );
    }
  }, [id, serverLayout]);

  // Seeded from the URL we arrived on, so the first sync is a no-op unless it
  // actually has something to strip.
  const lastSyncedUrlRef = useRef<string | null>(null);
  if (lastSyncedUrlRef.current === null) {
    lastSyncedUrlRef.current = `${pathname}${typeof window === "undefined" ? "" : window.location.search}`;
  }

  // Sync parameter store changes → URL (shallow replace, no navigation).
  // Lives here rather than beside the inbound-param effect because it needs
  // `dashboard`, which is fetched below that point (#1370 moved this body out
  // of [id]/page.tsx).
  useEffect(() => {
    if (!syncParams) return;
    const syncUrl = (state: { parameters: Record<string, ParameterEntry> }) => {
      const next = buildParamsUrl(pathname, state.parameters, syncParams);
      // Only navigate when the URL actually changes. Compared against what we
      // last wrote, NOT window.location: a mocked router never updates the
      // location, so reading it would make "clearing every parameter drops the
      // query string" silently untestable. Without the guard at all, the
      // initial strip replaces the URL we are already on — indistinguishable
      // from a redirect, which made the reader test unfalsifiable.
      if (next === lastSyncedUrlRef.current) return;
      lastSyncedUrlRef.current = next;
      router.replace(next, { scroll: false });
    };
    // Run once up front so a param that never opted in is stripped from an
    // inbound URL, not merely omitted from later updates.
    syncUrl(useParameterStore.getState());
    return useParameterStore.subscribe(syncUrl);
  }, [pathname, router, syncParams]);
  const activeLayout = editMode ? layout : (serverLayout ?? layout);
  const safeIndex = Math.max(
    0,
    Math.min(activePageIndex, activeLayout.pages.length - 1),
  );

  // ── Parameters ──────────────────────────────────────────────────────
  const parameters = useParameterStore((s) => s.parameters);
  const parameterCount = useMemo(
    () => filterParentParams(Object.entries(parameters)).length,
    [parameters],
  );
  // The button stays enabled whenever the dashboard has parameter widgets,
  // even before the store has populated their values (e.g. on initial load).
  const hasParameterWidgets = useMemo(
    () =>
      activeLayout.pages.some((p) =>
        p.widgets.some((w) => w.chartType === "parameter-select"),
      ),
    [activeLayout],
  );
  const hasParameters = hasParameterWidgets || parameterCount > 0;
  // null = auto mode (show when params exist), boolean = user override
  const [barOverride, setBarOverride] = useState<boolean | null>(null);
  const effectiveShowBar = barOverride !== null ? barOverride : hasParameters;
  const toggleParameterBar = useCallback(
    () => setBarOverride((prev) => !(prev ?? effectiveShowBar)),
    [effectiveShowBar],
  );

  const parameterSourceMap = useMemo(
    () => buildParameterSourceMap(activeLayout),
    [activeLayout],
  );

  // ── Pages ───────────────────────────────────────────────────────────
  const [visitedPages, setVisitedPages] = useState<Set<number>>(
    () => new Set([Math.max(0, initialPage)]),
  );

  const markVisited = useCallback((index: number) => {
    setVisitedPages((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const handleSelectPage = useCallback(
    (index: number) => {
      markVisited(index);
      setActivePage(index);
    },
    [markVisited, setActivePage],
  );

  // After reorderPages the store adjusts activePageIndex. Mark the new index
  // as visited so the page stays in the DOM when switching away.
  const handleReorderPages = useCallback(
    (fromIndex: number, toIndex: number) => {
      reorderPages(fromIndex, toIndex);
      markVisited(useDashboardStore.getState().activePageIndex);
    },
    [reorderPages, markVisited],
  );

  const handleNavigateToPage = useCallback(
    (pageId: string, scrollToWidgetId?: string) => {
      const index = activeLayout.pages.findIndex((p) => p.id === pageId);
      if (index >= 0) {
        markVisited(index);
        setActivePage(index);
        if (scrollToWidgetId) {
          scrollToWidgetWhenReady(scrollToWidgetId);
        }
      }
    },
    [activeLayout, markVisited, setActivePage],
  );

  // ── Auto-refresh (view mode) ────────────────────────────────────────
  // Local override, keyed by dashboard id so navigating elsewhere resets it.
  const [localSettings, setLocalSettings] = useState<{
    dashboardId: string;
    settings: DashboardSettings;
  } | null>(null);
  const activeLocalSettings =
    localSettings?.dashboardId === id ? localSettings.settings : null;
  const autoRefreshSettings =
    activeLocalSettings ?? serverLayout?.settings ?? {};
  const viewRefetchInterval = getRefetchInterval(autoRefreshSettings);

  // Promise queue to serialize persist writes and prevent out-of-order saves
  const persistQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  // Track the in-flight save-failure toast so we can dismiss it on next success
  const saveErrorToastIdRef = useRef<string | null>(null);

  const applyInterval = useCallback(
    (seconds: number | "off") => {
      const newSettings: DashboardSettings =
        seconds === "off"
          ? { autoRefresh: false }
          : { autoRefresh: true, refreshIntervalSeconds: seconds };
      setLocalSettings({ dashboardId: id, settings: newSettings });
      if (serverLayout) {
        const payload = {
          id,
          layoutJson: { ...serverLayout, settings: newSettings },
        };
        persistQueueRef.current = persistQueueRef.current
          .catch(() => undefined)
          .then(async () => {
            await updateDashboard.mutateAsync(payload);
            if (saveErrorToastIdRef.current) {
              dismiss(saveErrorToastIdRef.current);
              saveErrorToastIdRef.current = null;
            }
          })
          .catch((err: unknown) => {
            console.error(
              "[auto-save] Failed to persist dashboard settings:",
              err,
            );
            const t = toast({
              ...classifySaveError(err),
              variant: "destructive",
              duration: Infinity,
            });
            saveErrorToastIdRef.current = t.id;
          });
      }
    },
    [id, serverLayout, updateDashboard, toast, dismiss],
  );

  // ── Another user saved while we're viewing ──────────────────────────
  const [versionBumpMsg, setVersionBumpMsg] = useState<string | null>(null);
  const dashboardVersion = dashboard?.version;
  const dashboardUpdatedBy = dashboard?.updatedByName;

  /* eslint-disable react-hooks/set-state-in-effect -- intentional: reacts to external version bump */
  useEffect(() => {
    // Edit mode has the optimistic lock for this; a banner announcing our own
    // save would just be noise.
    if (editMode || dashboardVersion === undefined) return;
    const key = `__nb_dash_ver_${id}`;
    const stored = sessionStorage.getItem(key);
    if (stored === null) {
      sessionStorage.setItem(key, String(dashboardVersion));
    } else if (dashboardVersion > Number(stored)) {
      sessionStorage.setItem(key, String(dashboardVersion));
      const who = dashboardUpdatedBy ?? "someone";
      setVersionBumpMsg(`Dashboard updated by ${who}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only fire on version change
  }, [dashboardVersion, editMode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Editor (edit mode) ──────────────────────────────────────────────
  const queryClient = useQueryClient();
  const templateIdParam = searchParams.get("templateId") ?? undefined;
  const [editorOpen, setEditorOpen] = useState(!!templateIdParam);
  const [editorMode, setEditorMode] = useState<"add" | "edit">("add");
  const [editingWidget, setEditingWidget] = useState<
    DashboardWidget | undefined
  >();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [templateWidget, setTemplateWidget] = useState<
    DashboardWidget | undefined
  >();
  const [pendingTemplateId, setPendingTemplateId] = useState<
    string | undefined
  >(templateIdParam);
  const [cachedPreviewData, setCachedPreviewData] = useState<
    { data: unknown; resultId: string } | undefined
  >();

  const templateMap = useMemo<Record<string, WidgetTemplate>>(
    () => Object.fromEntries((allTemplates ?? []).map((t) => [t.id, t])),
    [allTemplates],
  );

  const handleSyncWidget = useCallback(
    (widget: DashboardWidget) => {
      const tmpl = widget.templateId
        ? templateMap[widget.templateId]
        : undefined;
      if (!tmpl) return; // template deleted — "Detach" will clean up
      updateWidget(widget.id, {
        ...widget,
        chartType: tmpl.chartType,
        query: tmpl.query ?? "",
        settings: {
          ...widget.settings,
          ...(tmpl.settings ?? undefined),
          // Never overwrite the widget's connection
          connectionId: widget.settings?.connectionId,
        },
        templateSyncedAt:
          tmpl.updatedAt?.toISOString() ?? new Date().toISOString(),
      });
    },
    [templateMap, updateWidget],
  );

  const handleDetachWidget = useCallback(
    (widgetId: string) => {
      const page = layout.pages.find((p) =>
        p.widgets.some((w) => w.id === widgetId),
      );
      const widget = page?.widgets.find((w) => w.id === widgetId);
      if (!widget) return;
      updateWidget(widgetId, {
        ...widget,
        templateId: undefined,
        templateSyncedAt: undefined,
      });
    },
    [layout.pages, updateWidget],
  );

  const openAddWidget = useCallback(() => {
    setEditorMode("add");
    setEditingWidget(undefined);
    setEditorOpen(true);
  }, []);

  const openEditWidget = useCallback(
    (widget: DashboardWidget) => {
      // Grab cached query data so the editor preview shows instantly.
      // Use getQueriesData with a partial key — params vary with store values.
      const cachedEntries = queryClient.getQueriesData<{
        data: unknown;
        resultId: string;
      }>({ queryKey: ["widget-query", widget.connectionId, widget.query] });
      const cached = cachedEntries.length > 0 ? cachedEntries[0][1] : undefined;
      setCachedPreviewData(cached ?? undefined);
      setEditorMode("edit");
      setEditingWidget(widget);
      setEditorOpen(true);
    },
    [queryClient],
  );

  const handleSave = useCallback(async () => {
    setSaveError(null);
    try {
      // Sanitize: replace any y: Infinity from pending widget additions.
      // react-grid-layout compacts these asynchronously, but if save fires
      // before compaction completes the Infinity value gets persisted and
      // all widgets collapse into a single vertical column on reload.
      const sanitizedLayout = {
        ...layout,
        pages: layout.pages.map((page) => {
          const hasInfinity = page.gridLayout.some(
            (g) => !Number.isFinite(g.y),
          );
          if (!hasInfinity) return page;
          const maxY = page.gridLayout.reduce(
            (m, g) => (Number.isFinite(g.y) ? Math.max(m, g.y + g.h) : m),
            0,
          );
          let nextY = maxY;
          return {
            ...page,
            gridLayout: page.gridLayout.map((g) => {
              if (Number.isFinite(g.y)) return g;
              const placed = { ...g, y: nextY };
              nextY += g.h;
              return placed;
            }),
          };
        }),
      };
      await updateDashboard.mutateAsync({
        id,
        layoutJson: sanitizedLayout,
        expectedVersion: dashboard?.version,
      });
      markSaved();
      // Explicit Save (button / Cmd+S) gets explicit confirmation (#1046);
      // the failure path already has its own sticky error toast (#836).
      toast({ title: "Dashboard saved" });
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Failed to save dashboard",
      );
    }
  }, [id, layout, updateDashboard, markSaved, dashboard, toast]);

  const handleEditorSave = useCallback(
    (widget: DashboardWidget) => {
      if (editorMode === "add") {
        const activePage = layout.pages[safeIndex] ?? layout.pages[0];
        const gridItem: GridLayoutItem = {
          i: widget.id,
          x: (activePage.gridLayout.length * 4) % 12,
          y: Infinity,
          w: 4,
          h: 3,
        };
        addWidget(widget, gridItem);
      } else {
        updateWidget(widget.id, widget);
      }
      queryClient.invalidateQueries({
        queryKey: ["widget-query", widget.connectionId, widget.query],
      });
    },
    [editorMode, layout, safeIndex, addWidget, updateWidget, queryClient],
  );

  // ── Navigation ──────────────────────────────────────────────────────
  const {
    showNavWarning,
    setShowNavWarning,
    confirmNavigation,
    cancelNavigation,
    requestNavigation,
  } = useUnsavedChangesWarning();

  const [isPending, startTransition] = useTransition();

  const canEdit =
    dashboard?.role === "owner" ||
    dashboard?.role === "editor" ||
    dashboard?.role === "admin";

  const leaveEditMode = useCallback(() => {
    // Route through the unsaved-changes guard (same as the Back button).
    // Deliberately no `?page=`: the store carries the active page across the
    // toggle now (#1371), and appending it would change the view URL that
    // ~8 E2E specs match with /\/[\w-]+$/.
    if (requestNavigation(`/${id}`)) router.push(`/${id}`, { scroll: false });
  }, [id, requestNavigation, router]);

  const enterEditMode = useCallback(() => {
    router.push(`/${id}/edit?page=${safeIndex}`, { scroll: false });
  }, [id, safeIndex, router]);

  // Redirect Readers away from edit mode
  useEffect(() => {
    if (editMode && systemRole === "reader") {
      router.replace(`/${id}`, { scroll: false });
    }
  }, [editMode, systemRole, id, router]);

  useKeyboardShortcuts([
    {
      shortcut: "Cmd+E",
      handler: () => {
        if (editMode) leaveEditMode();
        else if (dashboard) enterEditMode();
      },
      disabled: !editMode && !canEdit,
    },
    {
      shortcut: "Cmd+S",
      handler: () => {
        handleSave();
      },
      disabled: !editMode,
    },
    {
      shortcut: "Cmd+Shift+N",
      handler: openAddWidget,
      disabled: !editMode || editorOpen,
    },
    {
      shortcut: "Escape",
      handler: () => setEditorOpen(false),
      disabled: !editorOpen,
    },
  ]);

  // ── Render ──────────────────────────────────────────────────────────
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

  return (
    <div className="flex flex-col h-full">
      {editMode ? (
        <DashboardEditToolbar
          dashboardId={id}
          name={dashboard.name}
          isAdmin={isAdmin}
          isPublic={dashboard.isPublic ?? false}
          onTogglePublic={(value) =>
            updateDashboard.mutate({ id, isPublic: value })
          }
          hasParameters={hasParameters}
          parameterCount={parameterCount}
          showParameterBar={effectiveShowBar}
          onToggleParameterBar={toggleParameterBar}
          isSaving={updateDashboard.isPending}
          onAddWidget={openAddWidget}
          onSave={handleSave}
          onBack={leaveEditMode}
        />
      ) : (
        <DashboardViewToolbar
          name={dashboard.name}
          role={dashboard.role}
          updatedAt={dashboard.updatedAt}
          updatedByName={dashboard.updatedByName}
          canEdit={canEdit}
          isFetching={isFetching}
          refetchInterval={viewRefetchInterval}
          onApplyInterval={applyInterval}
          hasParameters={hasParameters}
          parameterCount={parameterCount}
          showParameterBar={effectiveShowBar}
          onToggleParameterBar={toggleParameterBar}
          isEnteringEdit={isPending}
          onBack={() => router.push("/")}
          onEdit={() => startTransition(enterEditMode)}
        />
      )}

      {!editMode && versionBumpMsg && (
        <div className="bg-blue-50 dark:bg-blue-950 border-b border-blue-200 dark:border-blue-800 px-4 py-2 text-sm text-blue-700 dark:text-blue-300 flex items-center justify-between">
          <span>{versionBumpMsg}</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-blue-700 dark:text-blue-300"
            onClick={() => {
              setVersionBumpMsg(null);
              if (dashboardVersion !== undefined) {
                sessionStorage.setItem(
                  `__nb_dash_ver_${id}`,
                  String(dashboardVersion),
                );
              }
              router.refresh();
            }}
          >
            Refresh
          </Button>
        </div>
      )}

      {editMode && saveError && (
        <div className="px-6 pt-2">
          <Alert variant="destructive">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        </div>
      )}

      {(editMode || activeLayout.pages.length > 1) && (
        <PageTabs
          pages={activeLayout.pages}
          activeIndex={safeIndex}
          editable={editMode}
          onSelect={handleSelectPage}
          onAdd={editMode ? addPage : undefined}
          onRemove={editMode ? removePage : undefined}
          onRename={editMode ? renamePage : undefined}
          onReorder={editMode ? handleReorderPages : undefined}
        />
      )}

      {editMode && (
        <>
          <WidgetEditorModal
            open={editorOpen}
            onOpenChange={(open) => {
              setEditorOpen(open);
              if (!open && pendingTemplateId) {
                setPendingTemplateId(undefined);
                // Clean up the templateId search param from the URL
                router.replace(`/${id}/edit`, { scroll: false });
              }
            }}
            mode={editorMode}
            widget={editingWidget}
            connections={connections ?? []}
            onSave={handleEditorSave}
            layout={layout}
            initialTemplate={
              pendingTemplateId ? templateMap[pendingTemplateId] : undefined
            }
            initialPreviewData={
              editorMode === "edit" ? cachedPreviewData : undefined
            }
            canWrite={session?.user?.canWrite !== false}
            // #913: opens SaveTemplateDialog from the modal footer.
            onSaveAsTemplate={(w) => setTemplateWidget(w)}
          />

          {templateWidget &&
            (() => {
              const conn = (connections ?? []).find(
                (c) => c.id === templateWidget.connectionId,
              );
              // Content-only widgets (markdown, iframe) have no connection;
              // default to "postgresql" so the template dialog still opens.
              const connectorType: ConnectorType = conn
                ? conn.type
                : "postgresql";
              return (
                <SaveTemplateDialog
                  open={true}
                  onOpenChange={(open) => {
                    if (!open) setTemplateWidget(undefined);
                  }}
                  widget={templateWidget}
                  connectorType={connectorType}
                />
              );
            })()}
        </>
      )}

      <DashboardErrorBoundary>
        <div className="flex-1 p-6 relative max-w-[1600px] mx-auto w-full">
          {activeLayout.pages.map((page, index) => {
            const isActive = index === safeIndex;
            if (page.widgets.length === 0 && isActive) {
              return (
                <EmptyState
                  key={page.id}
                  icon={<LayoutDashboard className="h-12 w-12" />}
                  title="No widgets yet"
                  description={
                    editMode
                      ? 'Click "Add Widget" to get started.'
                      : "This page has no widgets."
                  }
                  action={
                    editMode ? (
                      <Button onClick={openAddWidget}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Widget
                      </Button>
                    ) : canEdit ? (
                      <Button onClick={enterEditMode}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Add widgets in the editor
                      </Button>
                    ) : undefined
                  }
                />
              );
            }
            if (page.widgets.length === 0) return null;
            if (!isActive && !visitedPages.has(index)) return null;
            return (
              <div
                key={page.id}
                className={isActive ? undefined : "hidden"}
                aria-hidden={!isActive}
              >
                <DashboardContainer
                  page={page}
                  editable={editMode}
                  // Only the visible page polls. Visited pages stay mounted so
                  // tab switches are instant and don't re-query — but keeping
                  // them *polling* made query load scale with browsing history
                  // instead of with what is on screen: 4.81x the /api/query
                  // volume for the same 18 visible widgets after touring six
                  // pages, all of it refresh-tier work against the customer's
                  // database for nobody's benefit (#1419).
                  refetchInterval={
                    editMode || !isActive ? false : viewRefetchInterval
                  }
                  actions={
                    editMode
                      ? {
                          onRemoveWidget: removeWidget,
                          onEditWidget: openEditWidget,
                          onDuplicateWidget: duplicateWidget,
                          onLayoutChange: isActive
                            ? updateGridLayout
                            : undefined,
                          onWidgetSettingsChange: (widgetId, settings) => {
                            const target = page.widgets.find(
                              (w) => w.id === widgetId,
                            );
                            if (target)
                              updateWidget(widgetId, { ...target, settings });
                          },
                          onNavigateToPage: handleNavigateToPage,
                          onSyncWidget: handleSyncWidget,
                          onDetachWidget: handleDetachWidget,
                        }
                      : { onNavigateToPage: handleNavigateToPage }
                  }
                  templateMap={editMode ? templateMap : undefined}
                  showParameterBar={effectiveShowBar}
                  parameterSourceMap={parameterSourceMap}
                />
              </div>
            );
          })}
        </div>
      </DashboardErrorBoundary>

      <ConfirmDialog
        open={showNavWarning}
        onOpenChange={setShowNavWarning}
        title="Unsaved changes"
        description="You have unsaved changes. Are you sure you want to leave? Your changes will be lost."
        confirmText="Leave"
        cancelText="Stay"
        variant="destructive"
        onConfirm={confirmNavigation}
        onCancel={cancelNavigation}
      />

      {children}
    </div>
  );
}
