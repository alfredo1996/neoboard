import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ShortcutHint, formatShortcut } from "../shortcut-hint";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubPlatform(platform: string) {
  vi.stubGlobal("navigator", { platform, userAgent: platform });
}

describe("formatShortcut", () => {
  it("renders Mac glyphs joined without separators", () => {
    expect(formatShortcut("Cmd+E", true)).toBe("⌘E");
    expect(formatShortcut("Cmd+S", true)).toBe("⌘S");
    expect(formatShortcut("Cmd+Shift+N", true)).toBe("⌘⇧N");
  });

  it("renders Ctrl-style combos elsewhere", () => {
    expect(formatShortcut("Cmd+E", false)).toBe("Ctrl+E");
    expect(formatShortcut("Cmd+Shift+N", false)).toBe("Ctrl+Shift+N");
  });
});

describe("ShortcutHint", () => {
  it("shows the ⌘ glyph on macOS", () => {
    stubPlatform("MacIntel");
    render(<ShortcutHint combo="Cmd+E" />);
    expect(screen.getByText("⌘E")).toBeDefined();
  });

  it("shows Ctrl+ on other platforms", () => {
    stubPlatform("Win32");
    render(<ShortcutHint combo="Cmd+S" />);
    expect(screen.getByText("Ctrl+S")).toBeDefined();
  });

  it("renders as a kbd element (semantic keyboard hint)", () => {
    stubPlatform("MacIntel");
    render(<ShortcutHint combo="Cmd+S" />);
    expect(screen.getByText("⌘S").tagName).toBe("KBD");
  });
});
