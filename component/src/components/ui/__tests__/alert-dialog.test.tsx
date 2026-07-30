import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "../alert-dialog";

/**
 * AlertDialog must pop in place at the viewport centre, open and close — the
 * same rule as its sibling Dialog (#1155, #1373). It shipped with upstream
 * shadcn's `top-[48%]`, a deliberate 2%-of-height lift, which made the two
 * modals animate differently for no design reason; both use `top-1/2` now.
 *
 * The four `slide-*-1/2` classes asserted below are CENTRING COMPENSATION, not
 * motion: tailwindcss-animate's `enter` keyframe is `from`-only and `exit` is
 * `to`-only, and both build one `transform` from `--tw-enter/exit-translate-x/y`
 * — which default to 0. Without them the keyframe animates between
 * `translate3d(0,0,0)` and the resting `translate(-50%,-50%)`, so the dialog
 * flies in from the bottom-right and back out to it.
 *
 * This is a jsdom class-presence guard, and that is ALL it is — jsdom has no
 * layout engine and no `getAnimations()`, so it cannot see drift itself. The
 * assertion that measures the geometry lives in
 * `stories/ui/alert-dialog.stories.tsx`, run by the `storybook` browser project
 * (`npm run test:visual`). Keep both: this one fails fast if the classes are
 * deleted, that one fails if the compensation stops working.
 */
describe("AlertDialogContent animation", () => {
  it("carries the centring compensation for the enter/exit keyframes", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Test</AlertDialogTitle>
          <AlertDialogDescription>Body</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    );
    const cls = screen.getByRole("alertdialog").className;

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

    // No upstream 48% lift: it is the one axis where the two modals diverged.
    expect(cls).not.toContain("48%");
  });
});
