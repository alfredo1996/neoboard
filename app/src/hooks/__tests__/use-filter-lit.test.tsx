import { describe, it, expect, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useState } from "react";
import { useFilterLit } from "../use-filter-lit";

function Card({
  onChange,
  enabled = true,
}: Readonly<{ onChange: (l: boolean) => void; enabled?: boolean }>) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useFilterLit(el, enabled, onChange);
  return (
    <div ref={setEl} data-testid="card">
      <button data-testid="trigger" aria-expanded="false">
        pick
      </button>
    </div>
  );
}

const fire = (el: Element, type: string, init?: object) =>
  act(() => {
    el.dispatchEvent(new FocusEvent(type, { bubbles: true, ...init }));
  });

function setup(enabled = true) {
  const onChange = vi.fn();
  const utils = render(<Card onChange={onChange} enabled={enabled} />);
  return {
    onChange,
    card: utils.getByTestId("card"),
    trigger: utils.getByTestId("trigger"),
    ...utils,
  };
}

describe("useFilterLit (#2369)", () => {
  it("lights on hover and clears on leave", () => {
    const { card, onChange } = setup();
    fire(card, "pointerenter", { bubbles: false });
    expect(onChange).toHaveBeenLastCalledWith(true);
    fire(card, "pointerleave", { bubbles: false });
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("lights on keyboard focus but not on mouse focus", () => {
    const { trigger, onChange } = setup();
    vi.spyOn(trigger, "matches").mockReturnValue(false);
    fire(trigger, "focusin");
    expect(onChange).not.toHaveBeenCalled();
    vi.spyOn(trigger, "matches").mockReturnValue(true);
    fire(trigger, "focusin");
    expect(onChange).toHaveBeenLastCalledWith(true);
    fire(trigger, "focusout", { relatedTarget: document.body });
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("stays lit while the list is open and clears when it closes with the pointer elsewhere", async () => {
    const { card, trigger, onChange } = setup();
    fire(card, "pointerenter", { bubbles: false });
    // The pointer moves onto the portalled list: the card sees a leave.
    fire(card, "pointerleave", { bubbles: false });
    onChange.mockClear();
    await act(async () => {
      trigger.setAttribute("aria-expanded", "true");
    });
    expect(onChange).toHaveBeenLastCalledWith(true);
    // The list closes under the pointer: no event at all, only the attribute.
    await act(async () => {
      trigger.setAttribute("aria-expanded", "false");
    });
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("does nothing when disabled", () => {
    const { card, onChange } = setup(false);
    fire(card, "pointerenter", { bubbles: false });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears on unmount while lit", () => {
    const { card, onChange, unmount } = setup();
    fire(card, "pointerenter", { bubbles: false });
    unmount();
    expect(onChange).toHaveBeenLastCalledWith(false);
  });
});
