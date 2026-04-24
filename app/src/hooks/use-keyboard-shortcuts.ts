"use client";

import { useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Shortcut parsing — exported for unit testing
// ---------------------------------------------------------------------------

export interface ParsedShortcut {
  key: string;
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

/**
 * Parse a shortcut string like "Cmd+S", "Ctrl+Shift+N", "Escape".
 * "Cmd" maps to metaKey (Mac) or ctrlKey (Windows/Linux) at match time.
 */
export function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.split("+").map((p) => p.trim());
  const modifiers = new Set(parts.slice(0, -1).map((m) => m.toLowerCase()));
  const key = parts[parts.length - 1].toLowerCase();

  return {
    key,
    meta: modifiers.has("cmd") || modifiers.has("meta"),
    ctrl: modifiers.has("ctrl"),
    shift: modifiers.has("shift"),
    alt: modifiers.has("alt"),
  };
}

/**
 * Check if a keyboard event matches a parsed shortcut.
 * "Cmd" accepts either metaKey or ctrlKey to support both Mac and Windows.
 */
export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: ParsedShortcut,
): boolean {
  if (event.key.toLowerCase() !== shortcut.key) return false;

  // Cmd accepts either meta or ctrl (cross-platform)
  if (shortcut.meta) {
    if (!event.metaKey && !event.ctrlKey) return false;
  } else {
    // When Cmd is not expected, neither meta nor ctrl should be pressed
    // (unless ctrl is explicitly required)
    if (event.metaKey) return false;
    if (!shortcut.ctrl && event.ctrlKey) return false;
  }

  if (shortcut.ctrl && !event.ctrlKey && !event.metaKey) return false;
  if (shortcut.shift !== event.shiftKey) return false;
  if (shortcut.alt !== event.altKey) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface ShortcutDefinition {
  /** Shortcut string: "Cmd+S", "Escape", "Cmd+Shift+N", etc. */
  shortcut: string;
  /** Handler called when the shortcut is triggered. */
  handler: () => void;
  /** When true, the shortcut is disabled. */
  disabled?: boolean;
}

/** Elements that should suppress shortcuts when focused. */
const INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  if (INPUT_TAGS.has(el.tagName)) return true;
  // CodeMirror editor uses contenteditable
  if ((el as HTMLElement).isContentEditable) return true;
  // Radix combobox input
  if (el.getAttribute("role") === "combobox") return true;
  return false;
}

/**
 * Register keyboard shortcuts. Shortcuts are suppressed when a text input,
 * textarea, or CodeMirror editor is focused.
 *
 * Escape is an exception — it always fires (to close modals).
 */
export function useKeyboardShortcuts(shortcuts: ShortcutDefinition[]): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      for (const def of shortcuts) {
        if (def.disabled) continue;
        const parsed = parseShortcut(def.shortcut);
        if (!matchesShortcut(event, parsed)) continue;

        // Allow Escape even in inputs (to close modals)
        // Suppress all other shortcuts when typing
        if (parsed.key !== "escape" && isInputFocused()) continue;

        event.preventDefault();
        event.stopPropagation();
        def.handler();
        return;
      }
    },
    [shortcuts],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
