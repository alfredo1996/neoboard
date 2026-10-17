import * as React from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Wordmark } from "./wordmark";

/** localStorage key of the manual collapse (per browser). */
export const SIDEBAR_COLLAPSED_KEY = "neoboard-sidebar-collapsed";

const NARROW = "(max-width: 1023.98px)";

function subscribeNarrow(onChange: () => void) {
  const mq = globalThis.matchMedia?.(NARROW);
  mq?.addEventListener("change", onChange);
  return () => mq?.removeEventListener("change", onChange);
}
const narrowNow = () => globalThis.matchMedia?.(NARROW).matches ?? false;

export interface SidebarItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onSelect: () => void;
}

export interface SidebarGroup {
  /** Names the group's nav landmark; shown as a heading only with `showLabel`. */
  label: string;
  showLabel?: boolean;
  items: readonly SidebarItem[];
}

export interface SidebarAccount {
  name: string;
  /** Under the name, e.g. the role. */
  detail?: string;
  onProfile: () => void;
  onSignOut: () => void;
  theme?: {
    value: string;
    options: readonly { value: string; label: string }[];
    onChange: (value: string) => void;
  };
}

export interface SidebarProps {
  groups: readonly SidebarGroup[];
  account?: SidebarAccount;
  /** Starting state; when set, it wins over the remembered choice (stories, tests). */
  defaultCollapsed?: boolean;
  className?: string;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

function NavButton({
  item,
  railed,
}: Readonly<{ item: SidebarItem; railed: boolean }>) {
  const button = (
    <button
      type="button"
      onClick={item.onSelect}
      aria-current={item.active ? "page" : undefined}
      // The rail hides the label; it stays the button's name.
      aria-label={railed ? item.label : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-[7px] text-sm font-medium text-foreground-2 transition-colors hover:bg-active hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        item.active && "bg-active text-foreground",
        railed && "justify-center p-[9px]",
      )}
    >
      <span className="shrink-0" aria-hidden>
        {item.icon}
      </span>
      {!railed && <span className="truncate">{item.label}</span>}
    </button>
  );
  if (!railed) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function AccountMenu({
  account,
  railed,
}: Readonly<{ account: SidebarAccount; railed: boolean }>) {
  const { theme } = account;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account: ${account.name}`}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-active",
            railed && "justify-center p-2",
          )}
        >
          <span
            aria-hidden
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-card-edge text-[11px] font-semibold"
          >
            {initials(account.name)}
          </span>
          {!railed && (
            <span className="flex min-w-0 flex-col leading-tight">
              <b className="truncate text-sm font-medium">{account.name}</b>
              {account.detail && (
                <small className="truncate text-xs capitalize text-foreground-2">
                  {account.detail}
                </small>
              )}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={railed ? "right" : "top"}
        align={railed ? "end" : "start"}
        className="w-52"
      >
        {theme && (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                Theme
                <span className="ml-auto text-foreground-2">
                  {theme.options.find((o) => o.value === theme.value)?.label}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={theme.value}
                  onValueChange={theme.onChange}
                >
                  {theme.options.map((o) => (
                    <DropdownMenuRadioItem key={o.value} value={o.value}>
                      {o.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={account.onProfile}>
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={account.onSignOut}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The app sidebar. Under 1024 px it is a 56 px icon rail; on a wide screen a
 * toggle collapses it by hand, and the choice is remembered in this browser.
 */
function Sidebar({
  groups,
  account,
  defaultCollapsed,
  className,
}: Readonly<SidebarProps>) {
  const narrow = React.useSyncExternalStore(
    subscribeNarrow,
    narrowNow,
    () => false,
  );
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed ?? false);
  // A remembered collapse must not animate 240 -> 56 px on load.
  const [animate, setAnimate] = React.useState(false);
  React.useEffect(() => {
    if (defaultCollapsed !== undefined) return;
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true") {
        // Read after mount so server and first client render agree.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCollapsed(true);
      }
    } catch {
      // Storage blocked: the sidebar just starts expanded.
    }
  }, [defaultCollapsed]);
  const toggle = () => {
    const next = !collapsed;
    setAnimate(true);
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    } catch {
      // Not remembered, still collapsed for this visit.
    }
  };
  const railed = narrow || collapsed;

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        aria-label="Sidebar"
        className={cn(
          "flex h-full shrink-0 flex-col gap-[18px] border-r border-rule bg-side px-2.5 py-3.5",
          animate &&
            "transition-[width] duration-200 motion-reduce:transition-none",
          railed ? "w-14 items-center px-2" : "w-60",
          className,
        )}
      >
        <div className={cn("px-2 py-1", railed && "px-1")}>
          <Wordmark collapsed={railed} />
        </div>
        {groups.map((g) => (
          <div key={g.label} className="w-full">
            {g.showLabel && !railed && (
              <p className="mb-1 ml-2.5 text-xs text-muted-foreground">
                {g.label}
              </p>
            )}
            <nav aria-label={g.label} className="flex flex-col gap-0.5">
              {g.items.map((item) => (
                <NavButton key={item.id} item={item} railed={railed} />
              ))}
            </nav>
          </div>
        ))}
        <div className="mt-auto flex w-full flex-col gap-1">
          {account && <AccountMenu account={account} railed={railed} />}
          {!narrow && (
            <button
              type="button"
              onClick={toggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex h-8 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-active hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {collapsed ? (
                <ChevronsRight className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronsLeft className="h-4 w-4" aria-hidden />
              )}
            </button>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

export { Sidebar };
