import { describe, it, expect } from "vitest";
import type { DatabaseSchema as SdkSchema } from "@neoboard/connection";
import type { QueryEditorProps } from "@neoboard/components";

/** The component mirror, read off the prop the app actually hands schemas to. */
type ComponentSchema = NonNullable<QueryEditorProps["schema"]>;

/**
 * `component/` must not depend on the connector SDK, so it keeps its own
 * mirror of `DatabaseSchema`. `app/` sees both, so the drift check lives here
 * (#1895). It is a TYPE-level test: `tsc` (npm run typecheck) is what fails.
 *
 * Identity, not mutual assignability — assignability cannot see an added
 * OPTIONAL field, which is exactly how a mirror drifts.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

describe("DatabaseSchema: component mirror vs connector SDK", () => {
  it("is structurally identical to the SDK type", () => {
    const identical: Equal<SdkSchema, ComponentSchema> = true;
    expect(identical).toBe(true);
  });

  it("would catch an optional field added on one side only", () => {
    const drifted: Equal<SdkSchema, ComponentSchema & { views?: string[] }> =
      false;
    expect(drifted).toBe(false);
  });
});
