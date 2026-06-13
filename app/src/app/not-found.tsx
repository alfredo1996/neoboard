import Link from "next/link";

/**
 * App-wide branded 404. Catches unmatched routes (e.g. /dashboards/<bad-id>)
 * that previously fell through to Next's unstyled default page (#1047).
 *
 * Private dashboards intentionally 404 rather than reveal their existence, so
 * this same page covers "doesn't exist" and "you don't have access" — it never
 * distinguishes the two.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-md">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h2 className="text-2xl font-semibold">Page not found</h2>
        <p className="text-muted-foreground">
          This page doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
        <div className="flex justify-center">
          <Link
            href="/dashboards"
            className="px-4 py-2 border rounded-md text-sm hover:bg-accent"
          >
            Go to dashboards
          </Link>
        </div>
      </div>
    </div>
  );
}
