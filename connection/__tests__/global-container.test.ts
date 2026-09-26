import { readFileSync } from "node:fs";
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
