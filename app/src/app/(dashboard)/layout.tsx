"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Database,
  Users,
  LogOut,
  FlaskConical,
  Moon,
  Sun,
  Monitor,
  Settings,
  User,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import type { ThemePreference } from "@/hooks/use-theme";
import {
  AppShell,
  Sidebar,
  SidebarItem,
  SidebarSectionLabel,
  Wordmark,
  Badge,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@neoboard/components";

const themeOptions = [
  { value: "light" as const, icon: Sun, label: "Light" },
  { value: "dark" as const, icon: Moon, label: "Dark" },
  { value: "system" as const, icon: Monitor, label: "System" },
];

function getPreferenceIcon(preference: ThemePreference) {
  const option = themeOptions.find((o) => o.value === preference);
  const Icon = option?.icon ?? Monitor;
  return <Icon className="h-4 w-4" />;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { preference, setTheme } = useTheme();
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });
  const userName = session?.user?.name ?? "";
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? "";

  // Don't render anything until we know the user is authenticated
  if (status === "loading") {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <AppShell
      sidebar={
        <Sidebar
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          header={<Wordmark collapsed={collapsed} />}
          footer={
            <>
              {userName && (
                <button
                  type="button"
                  onClick={() => router.push("/settings/profile")}
                  aria-label="Account menu"
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${collapsed ? "justify-center" : ""}`}
                >
                  <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {!collapsed && (
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="truncate">{userName}</span>
                      {userRole && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1 py-0 capitalize"
                        >
                          {userRole}
                        </Badge>
                      )}
                    </span>
                  )}
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  {/*
                    No wrapping <button> — SidebarItem's root is already a
                    button, and it forwards rest props (aria-haspopup, onClick,
                    etc.) so Radix's asChild trigger plumbing flows through
                    cleanly. A wrapping <button> would produce invalid nested
                    button HTML and a React hydration warning.
                  */}
                  <SidebarItem
                    icon={getPreferenceIcon(preference)}
                    label="Theme"
                    collapsed={collapsed}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end">
                  <DropdownMenuLabel>Theme</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={preference}
                    onValueChange={(v) => setTheme(v as ThemePreference)}
                  >
                    {themeOptions.map(({ value, icon: Icon, label }) => (
                      <DropdownMenuRadioItem key={value} value={value}>
                        <Icon className="mr-2 h-4 w-4" />
                        {label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <SidebarItem
                icon={<LogOut className="h-4 w-4" />}
                label="Sign out"
                collapsed={collapsed}
                // Explicit logout lands on a CLEAN /login — no callbackUrl.
                // Otherwise the next user to sign in on this machine inherits
                // the previous user's last location (#1037). The proxy still
                // adds callbackUrl on mid-task session expiry, which is the
                // case that param is for.
                onClick={() => signOut({ callbackUrl: "/login" })}
              />
            </>
          }
        >
          <SidebarSectionLabel label="Workspace" collapsed={collapsed} />
          <SidebarItem
            icon={<LayoutDashboard className="h-4 w-4" />}
            label="Dashboards"
            active={pathname === "/"}
            collapsed={collapsed}
            onClick={() => router.push("/")}
          />
          <SidebarItem
            icon={<Database className="h-4 w-4" />}
            label="Connections"
            active={pathname === "/connections"}
            collapsed={collapsed}
            onClick={() => router.push("/connections")}
          />
          <SidebarItem
            icon={<FlaskConical className="h-4 w-4" />}
            label="Widget Lab"
            active={pathname === "/widget-lab"}
            collapsed={collapsed}
            onClick={() => router.push("/widget-lab")}
          />
          <SidebarItem
            icon={<Settings className="h-4 w-4" />}
            label="Settings"
            active={pathname.startsWith("/settings")}
            collapsed={collapsed}
            onClick={() => router.push("/settings/profile")}
          />
          {userRole === "admin" && (
            <>
              <SidebarSectionLabel label="Admin" collapsed={collapsed} />
              <SidebarItem
                icon={<Users className="h-4 w-4" />}
                label="Users"
                active={pathname === "/users"}
                collapsed={collapsed}
                onClick={() => router.push("/users")}
              />
            </>
          )}
        </Sidebar>
      }
    >
      {children}
    </AppShell>
  );
}
