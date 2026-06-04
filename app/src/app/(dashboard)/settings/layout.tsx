"use client";

import { useRouter, usePathname } from "next/navigation";
import { User, KeyRound, Shield } from "lucide-react";
import { useFeature, type FeatureId } from "@/hooks/use-features";

interface Tab {
  href: string;
  label: string;
  icon: typeof User;
  /** When set, the tab is only rendered if this feature is enabled. */
  requiresFeature?: FeatureId;
}

const tabs: Tab[] = [
  { href: "/settings/profile", label: "Profile", icon: User },
  { href: "/settings/api-keys", label: "API Keys", icon: KeyRound },
  {
    href: "/settings/authentication",
    label: "Authentication",
    icon: Shield,
    requiresFeature: "sso",
  },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // Subscribe to features once at layout level; useFeature returns undefined
  // during the initial load — we hide gated tabs in that window to avoid a
  // flicker of enterprise UI on community installs.
  const ssoEnabled = useFeature("sso");

  const visibleTabs = tabs.filter((t) => {
    if (!t.requiresFeature) return true;
    if (t.requiresFeature === "sso") return ssoEnabled === true;
    // Unknown feature gate: hide by default (safer than leak).
    return false;
  });

  return (
    <div className="flex flex-col">
      <nav className="border-b px-6">
        <div className="flex gap-4">
          {visibleTabs.map(({ href, label, icon: Icon }) => {
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
