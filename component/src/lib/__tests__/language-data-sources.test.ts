import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { languageDataSources } from "../language-data-sources";
import { parameterSource } from "../parameter-completion";

const PARAMS = [{ label: "$param_customer", detail: "Customer" }];

describe("languageDataSources (#2485)", () => {
  it("hands over the sources added through language data", async () => {
    const doc = "MATCH (p) WHERE p.email = $cu";
    const state = EditorState.create({
      doc,
      extensions: [
        EditorState.languageData.of(() => [
          { autocomplete: parameterSource(() => PARAMS) },
        ]),
      ],
    });
    const result = await languageDataSources(
      new CompletionContext(state, doc.length, false),
    );
    expect(
      result && "options" in result && result.options.map((o) => o.label),
    ).toEqual(["$param_customer"]);
  });

  it("accepts a list of completions as a source", async () => {
    const doc = "SELECT $x";
    const state = EditorState.create({
      doc,
      extensions: [
        EditorState.languageData.of(() => [
          { autocomplete: [{ label: "$x" }] },
        ]),
      ],
    });
    const result = await languageDataSources(
      new CompletionContext(state, doc.length, false),
    );
    expect(
      result && "options" in result && result.options.map((o) => o.label),
    ).toEqual(["$x"]);
  });

  it("gives nothing when none was added", async () => {
    const state = EditorState.create({ doc: "MATCH (n) RETURN $" });
    expect(
      await languageDataSources(new CompletionContext(state, 18, false)),
    ).toBeNull();
  });
});
