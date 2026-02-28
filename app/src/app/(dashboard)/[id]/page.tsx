"use client";

import React, { use, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, LayoutDashboard } from "lucide-react";
import { useDashboard } from "@/hooks/use-dashboards";
import { useParameterStore } from "@/stores/parameter-store";
import { DashboardContainer } from "@/components/dashboard-container";
import { PageTabs } from "@/components/page-tabs";
import { migrateLayout } from "@/lib/migrate-layout";
import {
  Button,
  Badge,
  Skeleton,
  LoadingButton,
} from "@neoboard/components";
import {
  EmptyState,
  Toolbar,
  ToolbarSection,
} from "@neoboard/components";

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

  const { data: dashboard, isLoading } = useDashboard(id);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [visitedPages, setVisitedPages] = useState<Set<number>>(
    () => new Set([0])
  );

  function handleSelectPage(index: number) {
    setVisitedPages((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    setActivePageIndex(index);
  }
  const [isPending, startTransition] = useTransition();
  const layout = useMemo(
    () => (dashboard ? migrateLayout(dashboard.layoutJson) : null),
    [dashboard]
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
        </ToolbarSection>
        <ToolbarSection>
          {canEdit && (
            <LoadingButton
              size="sm"
              loading={isPending}
              loadingText="Opening editor..."
              onClick={() => startTransition(() => router.push(`/${id}/edit?page=${safeIndex}`))}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </LoadingButton>
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
              <DashboardContainer page={page} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
