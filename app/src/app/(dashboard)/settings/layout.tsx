"use client";

import { useRouter, usePathname } from "next/navigation";
import { User, KeyRound } from "lucide-react";

const tabs = [
  { href: "/settings/profile", label: "Profile", icon: User },
  { href: "/settings/api-keys", label: "API Keys", icon: KeyRound },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex flex-col">
      <nav className="border-b px-6">
        <div className="flex gap-4">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <button
                key={href}
                onClick={() => router.push(href)}
                className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
      </nav>
      {children}
    </div>
  );
}
