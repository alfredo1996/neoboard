import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle } from "../dialog";

/**
 * The dialog should pop in place (centered zoom + fade), not slide up from the
 * bottom edge (#1155). Guards against regressing to the slide-from-bottom
 * animation.
 */
describe("DialogContent animation", () => {
  it("uses a centered zoom entrance, not a bottom slide", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Test</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const content = screen.getByRole("dialog");
    const cls = content.className;
    expect(cls).toContain("zoom-in-95");
    expect(cls).toContain("zoom-out-95");
    expect(cls).not.toContain("slide-in-from-bottom");
    expect(cls).not.toContain("slide-out-to-bottom");
    // Still centered.
    expect(cls).toContain("translate-x-[-50%]");
    expect(cls).toContain("translate-y-[-50%]");
  });
});
