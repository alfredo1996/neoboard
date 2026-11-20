import { describe, it, expect, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  autocompletion,
  CompletionContext,
  currentCompletions,
  startCompletion,
} from "@codemirror/autocomplete";
import { cypher } from "../cypher-lang/cypher";
import { parameterExtension, parameterSource } from "../parameter-completion";

// The ANTLR parser has ESM resolution issues in Vitest's Node environment
// (as in cypher-lang-smoke.test.ts); its own completions are none here.
vi.mock("@neo4j-cypher/language-support", () => ({
  applySyntaxColouring: vi.fn(() => []),
  autocomplete: vi.fn(() => []),
  shouldAutoCompleteYield: vi.fn(() => false),
  testData: { DbSchema: {} },
}));

const PARAMS = [
  { label: "$param_customer", detail: "Customer: filters by customers.email" },
];

function complete(doc: string, params = PARAMS) {
  const state = EditorState.create({ doc });
  const ctx = new CompletionContext(state, doc.length, false);
  return parameterSource(() => params)(ctx);
}

describe("parameterSource (#2485)", () => {
  it("offers the parameter with its hint after a $, from the $ so the label replaces it", () => {
    const r = complete("WHERE c.email = $cu");
    expect(r).toMatchObject({ from: 16 });
    const options = (r && "options" in r && r.options) || [];
    expect(options.map(({ label, detail }) => ({ label, detail }))).toEqual(
      PARAMS,
    );
  });

  it.each([
    ["no $ before the cursor", "WHERE c.email = cu", PARAMS],
    ["no parameters", "WHERE c.email = $cu", []],
  ])("offers nothing with %s", (_, doc, params) => {
    expect(complete(doc, params)).toBeNull();
  });
});

describe("the editor wiring (#2485)", () => {
  it.each([
    ["cypher, whose own source overrides language data", cypher({})],
    ["a language that sets no override", autocompletion()],
  ])("lists the parameter beside %s", async (_, language) => {
    const doc = "MATCH (n) WHERE n.id = $cu";
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: [language, parameterExtension(EditorState, () => PARAMS)],
      }),
    });
    startCompletion(view);
    await vi.waitFor(() =>
      expect(currentCompletions(view.state).map((c) => c.label)).toContain(
        "$param_customer",
      ),
    );
    view.destroy();
  });
});
