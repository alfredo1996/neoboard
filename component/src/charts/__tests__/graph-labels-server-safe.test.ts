import { describe, expect, it } from "vitest";
import src from "../graph-labels.ts?raw";

// #2059: the server bundle must not evaluate NVL. The app imports these
// helpers on the server, so this file must never reach graph-chart.tsx.
describe("graph-labels", () => {
  it("imports neither NVL nor graph-chart", () => {
    expect(src).not.toMatch(/from\s+["'](@neo4j-nvl|\.\/graph-chart)/);
  });
});
