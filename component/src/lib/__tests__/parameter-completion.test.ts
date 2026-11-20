import { describe, it, expect, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import type { Completion } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { parameterSource } from "../parameter-completion";

const PARAMS = [
  { label: "$param_customer", detail: "Customer: filters by customers.email" },
];

function complete(doc: string, params = PARAMS) {
  const state = EditorState.create({ doc });
  const ctx = new CompletionContext(state, doc.length, false);
  return parameterSource(() => params)(ctx);
}

describe("parameterSource (#2485)", () => {
  it("offers the parameter with its hint after a $, starting where the language's own sources do", () => {
    const r = complete("WHERE c.email = $cu");
    // After the `$` (index 16), so it shares a start with the SQL sources.
    expect(r).toMatchObject({ from: 17 });
    const options = (r && "options" in r && r.options) || [];
    expect(options.map(({ label, detail }) => ({ label, detail }))).toEqual(
      PARAMS,
    );
  });

  it("applies by replacing the typed $ and word with the label, and touches nothing else", () => {
    const r = complete("WHERE c.email = $cu");
    const option = (r && "options" in r && r.options[0]) as Completion;
    const dispatch = vi.fn();
    (option.apply as (...a: unknown[]) => void)(
      { dispatch } as unknown as EditorView,
      option,
      17,
      19,
    );
    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 16, to: 19, insert: "$param_customer" },
      selection: { anchor: 16 + "$param_customer".length },
    });
  });

  it.each([
    ["no $ before the cursor", "WHERE c.email = cu", PARAMS],
    ["no parameters", "WHERE c.email = $cu", []],
  ])("offers nothing with %s", (_, doc, params) => {
    expect(complete(doc, params)).toBeNull();
  });
});
