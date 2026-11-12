import { describe, it, expect } from "vitest";
import { composeSets, resolve } from "./compose-config.mjs";

// After a Docker restart only services with a restart policy come back. A
// service that restarts while its dependency does not crash-loops (#2182).
const RESTARTS = new Set(["always", "unless-stopped"]);

describe("a restarting service never outlives its dependencies (#2182)", () => {
  it.each(composeSets)(
    "%s",
    (_label, files) => {
      const { services } = resolve(...files);
      const orphaned = Object.entries(services).flatMap(([name, svc]) =>
        RESTARTS.has(svc.restart)
          ? Object.keys(svc.depends_on ?? {})
              .filter((dep) => !RESTARTS.has(services[dep]?.restart))
              .map((dep) => `${name} -> ${dep}`)
          : [],
      );
      expect(orphaned).toEqual([]);
    },
    60_000,
  );
});
