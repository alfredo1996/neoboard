import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-4 text-4xl font-bold">NeoBoard Documentation</h1>
      <p className="mb-8 max-w-lg text-lg text-fd-muted-foreground">
        Open-source dashboarding for hybrid database architectures.
        Connect Neo4j and PostgreSQL, build interactive dashboards, and share
        insights.
      </p>
      <div className="flex gap-4">
        <Link
          href="/docs"
          className="rounded-lg bg-fd-primary px-6 py-3 font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
        >
          Get Started
        </Link>
        <Link
          href="/docs/developer"
          className="rounded-lg border border-fd-border px-6 py-3 font-medium transition-colors hover:bg-fd-accent"
        >
          Developer Docs
        </Link>
      </div>
    </main>
  );
}
