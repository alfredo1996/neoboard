import * as React from "react";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

export interface StatProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

/** A small card: a label over one number. */
function Stat({ label, value, className }: Readonly<StatProps>) {
  return (
    <Panel
      className={cn(
        "px-4 py-3.5 hover:border-card-edge focus-within:border-card-edge",
        className,
      )}
    >
      <dl className="m-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="m-0 mt-1 text-2xl font-semibold tabular-nums">
          {value}
        </dd>
      </dl>
    </Panel>
  );
}

export { Stat };
