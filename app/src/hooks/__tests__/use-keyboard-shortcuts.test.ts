import { describe, it, expect } from "vitest";
import { parseShortcut, matchesShortcut } from "../use-keyboard-shortcuts";

describe("parseShortcut", () => {
  it("parses Cmd+S", () => {
    const result = parseShortcut("Cmd+S");
    expect(result).toEqual({
      key: "s",
      meta: true,
      ctrl: false,
      shift: false,
      alt: false,
    });
  });

  it("parses Ctrl+Shift+N", () => {
    const result = parseShortcut("Ctrl+Shift+N");
    expect(result).toEqual({
      key: "n",
      meta: false,
      ctrl: true,
      shift: true,
      alt: false,
    });
  });

  it("parses Escape (no modifiers)", () => {
    const result = parseShortcut("Escape");
    expect(result).toEqual({
      key: "escape",
      meta: false,
      ctrl: false,
      shift: false,
      alt: false,
    });
  });

  it("parses Cmd+E", () => {
    const result = parseShortcut("Cmd+E");
    expect(result).toEqual({
      key: "e",
      meta: true,
      ctrl: false,
      shift: false,
      alt: false,
    });
  });
});

describe("matchesShortcut", () => {
  function makeEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
    return {
      key: "s",
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      ...overrides,
    } as KeyboardEvent;
  }

  it("matches Cmd+S on Mac (metaKey)", () => {
    const parsed = parseShortcut("Cmd+S");
    const event = makeEvent({ key: "s", metaKey: true });
    expect(matchesShortcut(event, parsed)).toBe(true);
  });

  it("matches Cmd+S as Ctrl+S on non-Mac (ctrlKey)", () => {
    const parsed = parseShortcut("Cmd+S");
    const event = makeEvent({ key: "s", ctrlKey: true });
    // Cmd maps to either meta or ctrl
    expect(matchesShortcut(event, parsed)).toBe(true);
  });

  it("does not match when wrong key", () => {
    const parsed = parseShortcut("Cmd+S");
    const event = makeEvent({ key: "d", metaKey: true });
    expect(matchesShortcut(event, parsed)).toBe(false);
  });

  it("does not match when modifier missing", () => {
    const parsed = parseShortcut("Cmd+S");
    const event = makeEvent({ key: "s" }); // no meta or ctrl
    expect(matchesShortcut(event, parsed)).toBe(false);
  });

  it("matches Escape with no modifiers", () => {
    const parsed = parseShortcut("Escape");
    const event = makeEvent({ key: "Escape" });
    expect(matchesShortcut(event, parsed)).toBe(true);
  });

  it("does not match Escape when modifier is pressed", () => {
    const parsed = parseShortcut("Escape");
    const event = makeEvent({ key: "Escape", metaKey: true });
    expect(matchesShortcut(event, parsed)).toBe(false);
  });
});
