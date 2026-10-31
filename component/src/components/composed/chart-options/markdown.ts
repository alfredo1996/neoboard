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
      "Markdown to render: headings, bold, italic, links, lists, code, blockquotes.",
  },
  {
    key: "textSize",
    label: "Text size",
    type: "select",
    default: "md",
    category: "Text",
    description: "Size of the text. Headings scale with it.",
    options: [
      { label: "Small", value: "sm" },
      { label: "Medium", value: "md" },
      { label: "Large", value: "lg" },
    ],
  },
  {
    key: "textAlign",
    label: "Alignment",
    type: "select",
    default: "left",
    category: "Text",
    description: "Alignment of paragraphs, headings, lists and quotes.",
    options: [
      { label: "Left", value: "left" },
      { label: "Center", value: "center" },
      { label: "Right", value: "right" },
    ],
  },
];
