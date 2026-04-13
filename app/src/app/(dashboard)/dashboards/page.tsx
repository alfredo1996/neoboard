import { redirect } from "next/navigation";

/**
 * Static route for /dashboards — redirects to / (the actual dashboard list).
 * Without this, the [id] dynamic segment captures "dashboards" as a dashboard ID,
 * resulting in a 404 from /api/dashboards/dashboards.
 */
export default function DashboardsRedirect() {
  redirect("/");
}
