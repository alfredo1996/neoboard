import { useRouter } from "next/navigation";
import { crumbClick } from "@/lib/crumb-click";

/** The "Settings" crumb: a client-side hop to the first tab, not a reload. */
export function useSettingsCrumb() {
  const router = useRouter();
  const href = "/settings/profile";
  return {
    label: "Settings",
    href,
    onClick: crumbClick(() => router.push(href)),
  };
}
