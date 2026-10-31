import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Database, FileText, Palette, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { OPTION_GROUPS } from "./chart-options-schema";
import type { OptionGroup, OptionSection } from "./chart-options-schema";

/**
 * One group of rows in the editor (#2388). `render` gets what the search box
 * holds (always "" outside Style) and returns the rows, or null when nothing in
 * the group matches, so the group has no heading and no jump link. Groups with
 * the same name join under one heading, in the order they were given.
 */
export interface SettingsGroup {
  readonly name: OptionGroup;
  readonly render: (search: string) => React.ReactNode;
  /**
   * The group is one block, not option rows: a Style search matches it by its
   * name alone, so a miss hides it and the panel can say there is nothing.
   */
  readonly named?: boolean;
}

export interface ChartSettingsPanelProps {
  readonly groups: readonly SettingsGroup[];
  /** The section on show. A section that has nothing in it falls back to the first. */
  readonly section: string;
  readonly onSectionChange: (section: OptionSection) => void;
  /** Show the search box at the top of Style. */
  readonly searchable?: boolean;
  readonly className?: string;
}

const SECTIONS: readonly {
  id: OptionSection;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "content", label: "Content", icon: FileText },
  { id: "data", label: "Data", icon: Database },
  { id: "style", label: "Style", icon: Palette },
  { id: "behavior", label: "Behavior", icon: Zap },
];

const GROUP_ORDER = Object.keys(OPTION_GROUPS);

const slug = (name: string) => name.toLowerCase().replaceAll(/\s+/g, "-");

/** The heading and rows of one group. Hairline above every group but the first. */
function SettingsGroupBlock({
  name,
  children,
}: Readonly<{ name: string; children: React.ReactNode }>) {
  return (
    <section
      id={`group-${slug(name)}`}
      data-group={name}
      className="grid gap-3 border-t border-rule py-6 first-of-type:border-t-0"
    >
      <h3 className="mb-1 text-section">{name}</h3>
      {children}
    </section>
  );
}

function renderSection(
  groups: readonly SettingsGroup[],
  section: OptionSection,
  search: string,
) {
  const byName = new Map<OptionGroup, React.ReactNode[]>();
  for (const g of groups) {
    if (OPTION_GROUPS[g.name] !== section) continue;
    if (g.named && !g.name.toLowerCase().includes(search)) continue;
    const node = g.render(search);
    if (node === null || node === undefined || node === false) continue;
    // Keyed, so the nodes of one name can sit side by side as an array child.
    const joined = byName.get(g.name) ?? [];
    byName.set(g.name, [
      ...joined,
      <React.Fragment key={joined.length}>{node}</React.Fragment>,
    ]);
  }
  return [...byName.entries()].sort(
    ([a], [b]) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b),
  );
}

/**
 * The widget editor's options (#2388): a side nav of up to four sections that
 * never moves, the active section's groups as jump links beneath it, and one
 * scroller for the rows. Under 1024px the nav is an icon rail and the jump
 * links hide. It renders the nav and the pane as two grid cells, so the parent
 * lays out the preview beside them.
 */
function ChartSettingsPanel({
  groups,
  section,
  onSectionChange,
  searchable = false,
  className,
}: ChartSettingsPanelProps) {
  const [search, setSearch] = React.useState("");
  const [current, setCurrent] = React.useState("");
  const paneRef = React.useRef<HTMLDivElement>(null);
  const lock = React.useRef(0);

  const sections = SECTIONS.filter(
    (s) => renderSection(groups, s.id, "").length > 0,
  );
  const active =
    sections.find((s) => s.id === section)?.id ?? sections[0]?.id ?? "data";
  const needle = active === "style" ? search.trim().toLowerCase() : "";
  const shown = renderSection(groups, active, needle);
  const names = shown.map(([name]) => name);
  const jumps = names.length > 1 ? names : [];
  const shownCurrent = jumps.includes(current as OptionGroup)
    ? current
    : jumps[0];
  const stickyHeight = active === "style" && searchable ? 68 : 0;

  function spy() {
    const pane = paneRef.current;
    if (!pane || Date.now() < lock.current || jumps.length === 0) return;
    const top = pane.getBoundingClientRect().top + stickyHeight + 22;
    let at: string = jumps[0];
    for (const el of pane.querySelectorAll<HTMLElement>("[data-group]")) {
      if (el.getBoundingClientRect().top <= top) at = el.dataset.group ?? at;
    }
    if (pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 4) {
      at = jumps.at(-1) ?? at;
    }
    setCurrent(at);
  }

  function jump(name: string) {
    const pane = paneRef.current;
    const el = pane?.querySelector<HTMLElement>(`#group-${slug(name)}`);
    if (!pane || !el) return;
    // Hold the scroll spy while the smooth scroll runs, so the link just
    // clicked keeps its mark.
    lock.current = Date.now() + 800;
    setCurrent(name);
    pane.scrollTo({ top: el.offsetTop - stickyHeight, behavior: "smooth" });
  }

  return (
    <TooltipProvider delayDuration={0}>
      <Tabs
        orientation="vertical"
        value={active}
        onValueChange={(v) => {
          onSectionChange(v as OptionSection);
          setSearch("");
          setCurrent("");
          paneRef.current?.scrollTo({ top: 0 });
        }}
        className={cn("contents", className)}
      >
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto border-r border-rule bg-side px-2.5 py-3">
          <TabsPrimitive.List
            aria-label="Editor sections"
            className="grid gap-0.5"
          >
            {sections.map((s) => (
              // The app sidebar's NavButton classes; under 1024px it is its rail,
              // and the tooltip names the icon (it hides when the label shows).
              <Tooltip key={s.id}>
                <TooltipTrigger asChild>
                  <TabsPrimitive.Trigger
                    value={s.id}
                    className="flex w-full items-center gap-2.5 whitespace-nowrap rounded-sm px-2.5 py-[7px] text-sm font-medium text-foreground-2 transition-colors hover:bg-active hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-active data-[state=active]:text-foreground"
                  >
                    <s.icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="sr-only lg:not-sr-only">{s.label}</span>
                  </TabsPrimitive.Trigger>
                </TooltipTrigger>
                <TooltipContent side="right" className="lg:hidden">
                  {s.label}
                </TooltipContent>
              </Tooltip>
            ))}
          </TabsPrimitive.List>
          {jumps.length > 0 && (
            <nav
              aria-label="Jump to a group"
              className="hidden gap-px border-t border-rule pt-2 lg:grid"
            >
              {jumps.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-current={name === shownCurrent}
                  onClick={() => jump(name)}
                  className={cn(
                    "rounded-sm px-2.5 py-[5px] text-left text-caption text-muted-foreground transition-colors hover:bg-active hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    name === shownCurrent && "font-medium text-foreground",
                  )}
                >
                  {name}
                </button>
              ))}
            </nav>
          )}
        </div>

        <div
          ref={paneRef}
          onScroll={spy}
          data-testid="editor-pane"
          className="relative min-h-0 min-w-0 overflow-y-auto px-6 pb-7"
        >
          {sections.map((s) => (
            <TabsContent
              key={s.id}
              value={s.id}
              className={cn("mt-0", s.id === "content" && "pt-5")}
            >
              {s.id === "style" && searchable && (
                <div className="sticky top-0 z-10 border-b border-rule bg-background pb-3 pt-4">
                  <Input
                    aria-label="Search options"
                    placeholder="Search options"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              )}
              {s.id === active &&
                shown.map(([name, nodes]) => (
                  <SettingsGroupBlock key={name} name={name}>
                    {nodes}
                  </SettingsGroupBlock>
                ))}
              {s.id === "style" && needle !== "" && shown.length === 0 && (
                <p className="pt-6 text-sm text-muted-foreground">
                  Nothing in Style matches. The rest is in Behavior.
                </p>
              )}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </TooltipProvider>
  );
}

export { ChartSettingsPanel, SettingsGroupBlock, renderSection };
