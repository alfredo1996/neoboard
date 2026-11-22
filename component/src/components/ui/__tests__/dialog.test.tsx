import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "../dialog";

/**
 * The dialog should pop in place (centered zoom + fade) at the viewport centre,
 * open and close (#1155, #1373).
 *
 * The four `slide-*-1/2` classes asserted below are CENTRING COMPENSATION, not
 * motion: tailwindcss-animate's `enter` keyframe is `from`-only and `exit` is
 * `to`-only, and both build one `transform` from `--tw-enter/exit-translate-x/y`
 * — which default to 0. Without them the keyframe animates between
 * `translate3d(0,0,0)` and the resting `translate(-50%,-50%)`, so the dialog
 * flies in from the bottom-right and back out to it. They set those variables
 * to -50% on both axes so only the scale and opacity animate.
 *
 * This is a jsdom class-presence guard, and that is ALL it is. jsdom has no
 * layout engine and no `getAnimations()`, so it cannot see the drift itself —
 * the previous version of this test asserted the *absence* of
 * `slide-in-from-bottom` and therefore passed both before and after the bug was
 * introduced. The assertion that actually measures the geometry lives in
 * `stories/ui/dialog.stories.tsx`, run by the `storybook` browser project
 * (`npm run test:visual`). Keep both: this one fails fast if the classes are
 * deleted, that one fails if the compensation stops working.
 */
describe("DialogContent animation", () => {
  it("carries the centring compensation for the enter/exit keyframes", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Test</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const cls = screen.getByRole("dialog").className;

    // Resting position.
    expect(cls).toContain("translate-x-[-50%]");
    expect(cls).toContain("translate-y-[-50%]");

    // Scale + fade are the only intended motion.
    expect(cls).toContain("zoom-in-95");
    expect(cls).toContain("zoom-out-95");

    // Centring compensation — both axes, both directions. See the docblock.
    expect(cls).toContain("data-[state=open]:slide-in-from-left-1/2");
    expect(cls).toContain("data-[state=open]:slide-in-from-top-1/2");
    expect(cls).toContain("data-[state=closed]:slide-out-to-left-1/2");
    expect(cls).toContain("data-[state=closed]:slide-out-to-top-1/2");
  });
});

describe("DialogContent focus (#2223)", () => {
  it("traps Tab inside and gives focus back to the trigger on Escape", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>Outside</button>
        <Dialog>
          <DialogTrigger>Open</DialogTrigger>
          <DialogContent>
            <DialogTitle>Rename</DialogTitle>
            <input aria-label="Name" />
          </DialogContent>
        </Dialog>
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Rename" });

    for (let i = 0; i < 4; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Open" })).toHaveFocus(),
    );
  });
});

describe("DialogContent Escape for a panel that keeps it (#2515)", () => {
  function open(onEscapeKeyDown?: () => void) {
    render(
      <Dialog defaultOpen>
        <DialogContent onEscapeKeyDown={onEscapeKeyDown}>
          <DialogTitle>Editor</DialogTitle>
          <div data-keeps-escape="">
            <button>in the panel</button>
          </div>
          <button>elsewhere</button>
        </DialogContent>
      </Dialog>,
    );
  }

  it("an Escape from inside the marked panel leaves the dialog open", async () => {
    const user = userEvent.setup();
    const caller = vi.fn();
    open(caller);
    screen.getByRole("button", { name: "in the panel" }).focus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(caller).toHaveBeenCalledTimes(1);
  });

  it("an Escape from anywhere else still closes it", async () => {
    const user = userEvent.setup();
    open();
    screen.getByRole("button", { name: "elsewhere" }).focus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
