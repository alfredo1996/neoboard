"use client";

import { useRouter, usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Database,
  Users,
  Library,
  Settings,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import type { ThemePreference } from "@/hooks/use-theme";
import { AppShell, Sidebar } from "@neoboard/components";
import {
  NavigationGuardProvider,
  useNavigationGuard,
} from "@/components/navigation-guard";

const themeOptions = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <NavigationGuardProvider>
      <DashboardShell>{children}</DashboardShell>
    </NavigationGuardProvider>
  );
}

function DashboardShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const requestNavigation = useNavigationGuard();
  const pathname = usePathname();
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

  // Every way out asks first while the editor is dirty (#2325).
  const go = (href: string) => () => {
    if (requestNavigation(href)) router.push(href);
  };
  const logout = () => signOut({ callbackUrl: "/login" });

  return (
    <AppShell
      sidebar={
        <Sidebar
          groups={[
            {
              label: "Workspace",
              items: [
                {
                  id: "dashboards",
                  label: "Dashboards",
                  icon: <LayoutDashboard className="h-4 w-4" />,
                  active: pathname === "/",
                  onSelect: go("/"),
                },
                {
                  id: "connections",
                  label: "Connections",
                  icon: <Database className="h-4 w-4" />,
                  active: pathname === "/connections",
                  onSelect: go("/connections"),
                },
                {
                  id: "widget-library",
                  label: "Widget Library",
                  icon: <Library className="h-4 w-4" />,
                  active: pathname === "/widget-library",
                  onSelect: go("/widget-library"),
                },
                {
                  id: "settings",
                  label: "Settings",
                  icon: <Settings className="h-4 w-4" />,
                  active: pathname.startsWith("/settings"),
                  onSelect: go("/settings/profile"),
                },
              ],
            },
            ...(userRole === "admin"
              ? [
                  {
                    label: "Admin",
                    showLabel: true,
                    items: [
                      {
                        id: "users",
                        label: "Users",
                        icon: <Users className="h-4 w-4" />,
                        active: pathname === "/users",
                        onSelect: go("/users"),
                      },
                    ],
                  },
                ]
              : []),
          ]}
          // Always present: Sign out and Theme live in this menu, so a session
          // without a name still has them.
          account={{
            name: userName || "Account",
            detail: userRole,
            onProfile: go("/settings/profile"),
            // Explicit logout lands on a CLEAN /login — no callbackUrl.
            // Otherwise the next user to sign in on this machine inherits
            // the previous user's last location (#1037). The proxy still
            // adds callbackUrl on mid-task session expiry, which is the
            // case that param is for.
            onSignOut: () => {
              if (requestNavigation("/login", logout)) return logout();
            },
            theme: {
              value: preference,
              options: themeOptions,
              onChange: (v) => setTheme(v as ThemePreference),
            },
          }}
        />
      }
    >
      {children}
    </AppShell>
  );
}
