"use client";

/**
 * Inline keyboard-shortcut hint for toolbar buttons (#1156).
 *
 * Renders the combo in platform notation — "⌘E" on macOS, "Ctrl+E" elsewhere —
 * as a subtle <kbd> chip so shortcuts are discoverable without hovering for
 * the title tooltip. Combos use the same "Cmd+X" strings as
 * useKeyboardShortcuts ("Cmd" = meta on Mac, ctrl elsewhere).
 */

const MAC_GLYPHS: Record<string, string> = {
  cmd: "⌘",
  shift: "⇧",
  alt: "⌥",
};

export function formatShortcut(combo: string, isMac: boolean): string {
  const parts = combo.split("+");
  if (isMac) {
    return parts.map((p) => MAC_GLYPHS[p.toLowerCase()] ?? p).join("");
  }
  return parts.map((p) => (p.toLowerCase() === "cmd" ? "Ctrl" : p)).join("+");
}

function detectMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent);
}

export function ShortcutHint({ combo }: { combo: string }) {
  return (
    // suppressHydrationWarning: the platform is only knowable client-side;
    // the server renders the Ctrl form and Macs correct it on hydration.
    // aria-hidden: the shortcut is a visual affordance; the button's
    // accessible name stays "Save"/"Edit" (screen readers get the shortcut
    // from the title tooltip; visual users from this chip).
    <kbd
      suppressHydrationWarning
      aria-hidden="true"
      className="pointer-events-none ml-2 hidden rounded border border-current/25 px-1 font-mono text-[10px] font-medium leading-4 opacity-60 sm:inline-block"
    >
      {formatShortcut(combo, detectMac())}
    </kbd>
  );
}
