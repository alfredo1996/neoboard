"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, LayoutDashboard } from "lucide-react";
import { useDashboard } from "@/hooks/use-dashboards";
import { DashboardContainer } from "@/components/dashboard-container";
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

  const layout = dashboard.layoutJson ?? { widgets: [], gridLayout: [] };

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
          {(dashboard.role === "owner" || dashboard.role === "editor") && (
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

      <div className="flex-1 p-6">
        {layout.widgets.length === 0 ? (
          <EmptyState
            icon={<LayoutDashboard className="h-12 w-12" />}
            title="No widgets yet"
            description="This dashboard has no widgets."
            action={
              (dashboard.role === "owner" || dashboard.role === "editor") ? (
                <Button onClick={() => router.push(`/${id}/edit`)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Add widgets in the editor
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DashboardContainer layout={layout} />
        )}
      </div>
    </div>
  );
}
