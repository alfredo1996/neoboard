import Link from "next/link";
import { Button } from "@neoboard/components/ui";

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
    <main className="flex min-h-screen items-center justify-center bg-page-ground px-4 py-10">
      <div className="max-w-[420px] text-center">
        <p className="text-[13px] font-medium text-muted-foreground">404</p>
        <h1 className="mb-2 mt-1.5 text-2xl font-semibold">Page not found</h1>
        <p className="mb-[18px] text-muted-foreground">
          The page you were looking for isn&apos;t here, or you don&apos;t have
          access to it.
        </p>
        <Button asChild>
          <Link href="/">Back to dashboards</Link>
        </Button>
      </div>
    </main>
  );
}
