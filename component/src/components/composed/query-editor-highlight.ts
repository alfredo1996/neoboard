import { defaultHighlightStyle, HighlightStyle } from "@codemirror/language";

// The default light palette, with the two colours that fall under WCAG AA on
// the white field (#e40 3.84:1, #f00 4.00:1) darkened to reach 4.5:1 (#2329).
const FIXED: Record<string, string> = { "#e40": "#c93400", "#f00": "#cc0000" };

export const lightHighlightStyle = HighlightStyle.define(
  defaultHighlightStyle.specs.map((s) =>
    s.color && FIXED[s.color] ? { ...s, color: FIXED[s.color] } : s,
  ),
);
