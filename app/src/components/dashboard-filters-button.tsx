import { Filter } from "lucide-react";
import { Button } from "@neoboard/components";

/** Shows or hides the filter line; the badge counts the active parameters. */
export function DashboardFiltersButton({
  hasParameters,
  parameterCount,
  showParameterBar,
  onToggleParameterBar,
}: Readonly<{
  hasParameters: boolean;
  parameterCount: number;
  showParameterBar: boolean;
  onToggleParameterBar: () => void;
}>) {
  return (
    <Button
      type="button"
      variant="outline"
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
  );
}
