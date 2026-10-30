import { defaultHighlightStyle, HighlightStyle } from "@codemirror/language";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";

// The default palettes, with the colours that fall under WCAG AA on the field
// darkened or lightened to reach 4.5:1 (#2329; #085 and #7d8799 on the Mist
// field, #2367).
const recolour = (style: HighlightStyle, fixed: Record<string, string>) =>
  HighlightStyle.define(
    style.specs.map((s) =>
      s.color && fixed[s.color] ? { ...s, color: fixed[s.color] } : s,
    ),
  );

export const lightHighlightStyle = recolour(defaultHighlightStyle, {
  "#e40": "#c93400",
  "#f00": "#cc0000",
  "#085": "#007a45",
});

export const darkHighlightStyle = recolour(oneDarkHighlightStyle, {
  "#7d8799": "#8791a3",
});
