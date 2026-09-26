import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The global teardown removes the Neo4j container after every run, so
// `withReuse()` never reused one across runs. Its only effect was that two runs
// at once (two checkouts, two worktrees) attached to one container: the second
// run's seed died on "Node already exists", and the first run's teardown pulled
// the container out from under the second (#1929).
describe("the global Neo4j container (#1929)", () => {
  const read = (file: string) =>
    readFileSync(join(__dirname, "utils", file), "utf8");

  it("belongs to one run: the setup never asks Testcontainers to reuse it", () => {
    expect(read("setup.ts")).not.toMatch(/\.withReuse\(/);
  });

  it("is removed by the teardown after every run", () => {
    expect(read("teardown.ts")).toMatch(/docker rm -fv \$\{containerId\}/);
  });
});

// The same collision on a second shared resource: the restart-recovery suite
// bound a constant host port, so two runs at once failed "port is already
// allocated" in the quality pass (#1929).
describe("fixed host ports (#1929)", () => {
  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = join(dir, e.name);
      if (e.isDirectory()) return e.name === "dist" ? [] : sources(path);
      return e.name.endsWith(".ts") ? [path] : [];
    });
  }

  // The binding's key ({ container: 7687, host: … }), not "localhost:7687".
  it("no suite binds a host port that is a constant", () => {
    const fixed = sources(__dirname).flatMap((file) => {
      const src = readFileSync(file, "utf8");
      return [...src.matchAll(/[{,]\s*host:\s*([A-Za-z_]\w*|\d+)/g)]
        .map((m) => m[1])
        .filter(
          (v) =>
            /^\d+$/.test(v) ||
            new RegExp(`const ${v}\\s*=\\s*[\\d_]+\\s*;`).test(src),
        )
        .map((v) => `${file.slice(__dirname.length + 1)}: ${v}`);
    });
    expect(fixed).toEqual([]);
  });
});
