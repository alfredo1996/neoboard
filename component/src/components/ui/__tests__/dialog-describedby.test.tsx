import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../dialog";

/**
 * #1282 — DialogContent hard-coded `aria-describedby={undefined}`, which
 * suppressed Radix's automatic wiring between the dialog and its
 * DialogDescription. Every dialog that rendered a description had it silently
 * unlinked: visible on screen, absent from the accessibility tree.
 *
 * Radix generates the description id and sets `aria-describedby` on the
 * content when a DialogDescription is present. The fix is to stop overriding
 * that, while keeping an explicit opt-out available for dialogs that
 * genuinely have no description.
 */
describe("#1282 — DialogContent description wiring", () => {
  it("links the description to the dialog", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Delete dashboard</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(describedBy, "dialog should be described by something").toBeTruthy();

    const description = document.getElementById(describedBy!);
    expect(description).not.toBeNull();
    expect(description).toHaveTextContent("This cannot be undone.");
  });

  it("still allows an explicit opt-out for dialogs with no description", () => {
    // Radix warns when a dialog has no description; passing undefined
    // explicitly at the call site is the documented suppression. It must
    // remain possible — it just must not be the library-wide default.
    render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Fullscreen widget</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-describedby");
  });

  it("honours a caller-supplied aria-describedby", () => {
    // Used where the explanatory copy already exists as body text and should
    // not be duplicated into a DialogDescription (e.g. the re-assign widgets
    // dialog).
    render(
      <Dialog open>
        <DialogContent aria-describedby="existing-copy">
          <DialogTitle>Re-assign widgets</DialogTitle>
          <p id="existing-copy">Pick a connection to migrate widgets to.</p>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole("dialog")).toHaveAttribute(
      "aria-describedby",
      "existing-copy",
    );
  });
});
