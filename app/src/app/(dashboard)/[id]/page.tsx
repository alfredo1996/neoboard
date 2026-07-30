/**
 * Dashboard view mode.
 *
 * The UI is rendered by `[id]/layout.tsx`, which stays mounted across the
 * /[id] ↔ /[id]/edit navigation. This segment exists only to make the URL
 * routable — anything rendered here would be torn down on every ⌘E (#1370).
 */
export default function DashboardViewerPage() {
  return null;
}
