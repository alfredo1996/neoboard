import * as React from "react";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

export interface SettingsSectionProps {
  title: string;
  /** One line saying what the section is for. */
  description?: string;
  /** The fields. */
  children: React.ReactNode;
  /** Buttons under the fields, right-aligned. */
  footer?: React.ReactNode;
  className?: string;
}

/** A card with a label column (title and one line) and the fields beside it. */
function SettingsSection({
  title,
  description,
  children,
  footer,
  className,
}: Readonly<SettingsSectionProps>) {
  const id = React.useId();
  return (
    <Panel
      role="region"
      aria-labelledby={id}
      className={cn(
        "grid gap-6 px-[22px] py-5 text-smhover:border-card-edge focus-within:border-card-edge md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]",
        className,
      )}
    >
      <div>
        <h3 id={id} className="m-0 text-[15px] font-semibold">
          {title}
        </h3>
        {description && (
          <p className="mt-1 max-w-[34ch] text-[13px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="flex max-w-[440px] flex-col gap-3.5">
        {children}
        {footer && <div className="flex justify-end gap-2">{footer}</div>}
      </div>
    </Panel>
  );
}

export { SettingsSection };
