"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, LayoutDashboard } from "lucide-react";
import { useDashboard } from "@/hooks/use-dashboards";
import { DashboardContainer } from "@/components/dashboard-container";
import { PageTabs } from "@/components/page-tabs";
import { migrateLayout } from "@/lib/migrate-layout";
import {
  Button,
  Badge,
  Skeleton,
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
  const { data: dashboard, isLoading } = useDashboard(id);
  const [activePageIndex, setActivePageIndex] = useState(0);

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

  const layout = migrateLayout(dashboard.layoutJson);
  const safeIndex = Math.min(activePageIndex, layout.pages.length - 1);
  const activePage = layout.pages[safeIndex];
  const canEdit = dashboard.role === "owner" || dashboard.role === "editor";

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
            <Button
              size="sm"
              onClick={() => router.push(`/${id}/edit`)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </ToolbarSection>
      </Toolbar>

      {layout.pages.length > 1 && (
        <PageTabs
          pages={layout.pages}
          activeIndex={safeIndex}
          editable={false}
          onSelect={setActivePageIndex}
        />
      )}

      <div className="flex-1 p-6">
        {activePage.widgets.length === 0 ? (
          <EmptyState
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
        ) : (
          <DashboardContainer page={activePage} />
        )}
      </div>
    </div>
  );
}
