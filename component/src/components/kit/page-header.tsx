import * as React from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export interface PageHeaderCrumb {
  label: string;
  /** Every item but the last should have one; the last is the current page. */
  href?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}

export interface PageHeaderProps {
  breadcrumb?: readonly PageHeaderCrumb[];
  title: string;
  /** One line under the title: who changed it, how many, who it is shared with. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** Optional tabs row, sitting on the header's bottom rule. */
  tabs?: React.ReactNode;
  className?: string;
  /** The h1 takes focus by script (never a tab stop), as the old header did (#2086). */
  titleRef?: React.Ref<HTMLHeadingElement>;
}

/** Page header on the shell surface: breadcrumb, sans title, meta, actions, tabs. */
function PageHeader({
  breadcrumb,
  title,
  meta,
  actions,
  tabs,
  className,
  titleRef,
}: Readonly<PageHeaderProps>) {
  return (
    <header
      className={cn(
        "border-b border-rule bg-background px-4 pb-3 pt-3.5 md:px-7",
        className,
      )}
    >
      {breadcrumb && breadcrumb.length > 0 && (
        <Breadcrumb className="mb-1.5">
          <BreadcrumbList className="gap-1.5 text-xs text-muted-foreground sm:gap-1.5">
            {breadcrumb.map((crumb, i) => {
              const last = i === breadcrumb.length - 1;
              return (
                <React.Fragment key={`${i}-${crumb.label}`}>
                  <BreadcrumbItem>
                    {last ? (
                      <BreadcrumbPage className="text-muted-foreground">
                        {crumb.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink href={crumb.href} onClick={crumb.onClick}>
                        {crumb.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!last && <BreadcrumbSeparator>/</BreadcrumbSeparator>}
                </React.Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1 basis-48">
          <h1
            ref={titleRef}
            tabIndex={-1}
            title={title}
            className="m-0 truncate text-2xl font-semibold leading-tight tracking-[-0.01em] outline-none"
          >
            {title}
          </h1>
          {meta && (
            <p className="mt-1 truncate text-caption text-muted-foreground">
              {meta}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap gap-2 sm:shrink-0 sm:flex-nowrap">
            {actions}
          </div>
        )}
      </div>
      {tabs && (
        // Full-bleed, so the row scrolls edge to edge; its inset is the gutter.
        <div className="-mx-4 -mb-3 mt-3 [--tabs-gutter:1rem] md:-mx-7 md:[--tabs-gutter:1.75rem]">
          {tabs}
        </div>
      )}
    </header>
  );
}

export { PageHeader };
