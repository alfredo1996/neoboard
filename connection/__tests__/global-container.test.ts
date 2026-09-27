import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { onFreePort } from "./utils/free-port";

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

// A port freePort() found can be taken before Docker binds it. The restart
// suite needs a fixed binding (a Docker-mapped port can change across the
// restart it exercises), so a taken port is answered by picking another.
describe("onFreePort (#1929)", () => {
  const taken = () =>
    Promise.reject(new Error("Bind for 0.0.0.0:1: port is already allocated"));

  it("picks another port when Docker says the first was taken", async () => {
    const start = jest
      .fn<Promise<string>, [number]>()
      .mockImplementationOnce(taken)
      .mockImplementationOnce(async (port) => `up on ${port}`);

    const { value, port } = await onFreePort(start);

    expect(start).toHaveBeenCalledTimes(2);
    expect(value).toBe(`up on ${port}`);
  });

  it("rethrows any other failure at once", async () => {
    const start = jest.fn(() => Promise.reject(new Error("image not found")));
    await expect(onFreePort(start)).rejects.toThrow("image not found");
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("gives up after three taken ports", async () => {
    const start = jest.fn(taken);
    await expect(onFreePort(start)).rejects.toThrow(/already allocated/);
    expect(start).toHaveBeenCalledTimes(3);
  });
});
