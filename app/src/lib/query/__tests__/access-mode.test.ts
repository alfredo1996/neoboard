import { describe, it, expect } from "vitest";
import { toConnectorAccessMode } from "@/lib/query/query-executor";

describe("toConnectorAccessMode (#1044)", () => {
  it("maps the pipeline's lowercase access mode to the connector's uppercase one", () => {
    expect(toConnectorAccessMode("read")).toBe("READ");
    expect(toConnectorAccessMode("write")).toBe("WRITE");
  });
});
