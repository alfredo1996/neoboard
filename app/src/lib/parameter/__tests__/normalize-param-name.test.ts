import { describe, it, expect } from "vitest";
import { normalizeParamName } from "../normalize-param-name";

describe("normalizeParamName (#1055)", () => {
  it("strips a leading param_ prefix so the token isn't doubled", () => {
    expect(normalizeParamName("param_status")).toBe("status");
    expect(normalizeParamName("PARAM_status")).toBe("status");
  });

  it("leaves a clean name untouched", () => {
    expect(normalizeParamName("status")).toBe("status");
    expect(normalizeParamName("country")).toBe("country");
  });

  it("only strips one leading prefix (not internal occurrences)", () => {
    expect(normalizeParamName("param_param_status")).toBe("param_status");
    expect(normalizeParamName("status_param")).toBe("status_param");
  });
});
