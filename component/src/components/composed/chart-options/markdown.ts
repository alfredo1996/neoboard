import { type ChartOptionDef } from "./shared";

export const markdownOptions: ChartOptionDef[] = [
  {
    key: "content",
    label: "Markdown Content",
    type: "text",
    default: "",
    category: "Content",
    description:
      "Markdown text to render. Supports headings, bold, italic, links, lists, code blocks, and blockquotes.",
  },
];
