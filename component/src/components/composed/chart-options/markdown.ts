import { type ChartOptionDef } from "./shared";

export const markdownOptions: ChartOptionDef[] = [
  {
    key: "content",
    label: "Markdown Content",
    // Multiline by nature — a single-line input strips newlines and breaks
    // headings/lists (#1049).
    type: "textarea",
    default: "",
    category: "Content",
    description:
      "Markdown text to render. Supports headings, bold, italic, links, lists, code blocks, and blockquotes.",
  },
];
