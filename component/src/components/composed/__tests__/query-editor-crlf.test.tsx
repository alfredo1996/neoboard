// Real CodeMirror (no mocks): the document normalises CRLF to LF, so a cursor
// computed from the input string's length lies past the end and throws.
import { createRef } from "react";
import { act, render, screen } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryEditor, type QueryEditorHandle } from "../query-editor";

// jsdom lacks what Radix Select calls.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => {};

const CRLF = "SELECT\r\n1";
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 50)));

async function mount(props: Record<string, unknown> = {}) {
  const ref = createRef<QueryEditorHandle>();
  const onChange = vi.fn();
  const utils = render(
    <QueryEditor ref={ref} language="sql" onChange={onChange} {...props} />,
  );
  await flush();
  const view = EditorView.findFromDOM(
    utils.container.querySelector<HTMLElement>(".cm-editor")!,
  )!;
  return { ref, onChange, view, ...utils };
}

const edit = (view: EditorView) =>
  act(() => view.dispatch({ changes: { from: 0, insert: "x" } }));

describe("QueryEditor — CRLF text (#1693)", () => {
  it("controlled replacement leaves the cursor at the end and onChange alive", async () => {
    const { view, onChange, rerender } = await mount({ value: "" });
    rerender(<QueryEditor language="sql" value={CRLF} onChange={onChange} />);
    await flush();
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    onChange.mockClear();
    edit(view);
    expect(onChange).toHaveBeenCalled();
  });

  it("insert leaves the cursor after the text", async () => {
    const { ref, view } = await mount();
    act(() => ref.current?.insert(CRLF));
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
  });

  it("history selection leaves the cursor at the end and onChange alive", async () => {
    const { view, onChange } = await mount({ history: [CRLF] });
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option"));
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    onChange.mockClear();
    edit(view);
    expect(onChange).toHaveBeenCalled();
  });
});
