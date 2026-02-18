"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { LayoutDashboard, Database, Users, LogOut } from "lucide-react";
import {
  AppShell,
  Sidebar,
  SidebarItem,
} from "@neoboard/components";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
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
            <SidebarItem
              icon={<LogOut className="h-4 w-4" />}
              label="Sign out"
              collapsed={collapsed}
              onClick={() => signOut()}
            />
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
        </Sidebar>
      }
    >
      {children}
    </AppShell>
  );
}
