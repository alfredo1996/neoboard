"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { LayoutDashboard, Database, Users, LogOut, FlaskConical, Moon, Sun, Monitor, Settings } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import type { ThemePreference } from "@/hooks/use-theme";
import {
  AppShell,
  Sidebar,
  SidebarItem,
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
  const { status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

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
          header={
            !collapsed ? (
              <span className="text-lg font-bold">NeoBoard</span>
            ) : (
              <span className="text-lg font-bold">N</span>
            )
          }
          footer={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div>
                    <SidebarItem
                      icon={getPreferenceIcon(preference)}
                      label="Theme"
                      collapsed={collapsed}
                    />
                  </div>
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
                onClick={() => signOut()}
              />
            </>
          }
        >
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
            icon={<Users className="h-4 w-4" />}
            label="Users"
            active={pathname === "/users"}
            collapsed={collapsed}
            onClick={() => router.push("/users")}
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
            onClick={() => router.push("/settings/api-keys")}
          />
        </Sidebar>
      }
    >
      {children}
    </AppShell>
  );
}
