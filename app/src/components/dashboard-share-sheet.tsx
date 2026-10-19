import { Users } from "lucide-react";
import { DashboardAssignPanel } from "@/components/dashboard-assign-panel";
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@neoboard/components";

/** The sharing sheet, opened from the page header in view and edit mode. */
export function DashboardShareSheet({
  dashboardId,
  isPublic,
  onTogglePublic,
  label,
}: Readonly<{
  dashboardId: string;
  isPublic: boolean;
  onTogglePublic: (value: boolean) => void;
  label: string;
}>) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" size="sm">
          <Users className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Sharing</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <DashboardAssignPanel
            dashboardId={dashboardId}
            isPublic={isPublic}
            onTogglePublic={onTogglePublic}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
