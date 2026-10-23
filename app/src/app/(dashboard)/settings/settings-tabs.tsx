"use client";

import { useRouter, usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { cn, tabRowClass, tabTriggerClass } from "@neoboard/components";
import { useFeature, type FeatureId } from "@/hooks/use-features";

interface Tab {
  href: string;
  label: string;
  /** When set, the tab is only rendered if this feature is enabled. */
  requiresFeature?: FeatureId;
  /** Opens in a new tab via an anchor (e.g. the Swagger UI HTML route). */
  external?: boolean;
}

const tabs: Tab[] = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/api-keys", label: "API keys" },
  // Swagger UI lives at an API route, not a settings page — link out so the
  // OpenAPI docs are discoverable from the app (#1056).
  { href: "/api/docs", label: "API docs", external: true },
  {
    href: "/settings/authentication",
    label: "Authentication",
    requiresFeature: "sso",
  },
];

export function SettingsTabs() {
  const router = useRouter();
  const pathname = usePathname();
  // Subscribe to features once; useFeature returns undefined during the
  // initial load — we hide gated tabs in that window to avoid a flicker of
  // enterprise UI on community installs.
  const ssoEnabled = useFeature("sso");

  const visibleTabs = tabs.filter((t) => {
    if (!t.requiresFeature) return true;
    if (t.requiresFeature === "sso") return ssoEnabled === true;
    // Unknown feature gate: hide by default (safer than leak).
    return false;
  });

  return (
    // The library tab look (#2221): centred, no icons. Still a nav of buttons;
    // making them links is #2268.
    <nav
      aria-label="Settings"
      className={cn(tabRowClass, "border-b-0 px-[var(--tabs-gutter,12px)]")}
    >
      {visibleTabs.map(({ href, label, external }) => {
        const active = !external && pathname === href;
        const state = active ? "active" : "inactive";
        if (external) {
          return (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${label} (opens in a new tab)`}
              data-state={state}
              className={tabTriggerClass}
            >
              {label}
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            </a>
          );
        }
        return (
          <button
            key={href}
            type="button"
            aria-current={active ? "page" : undefined}
            data-state={state}
            onClick={() => router.push(href)}
            className={tabTriggerClass}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}
