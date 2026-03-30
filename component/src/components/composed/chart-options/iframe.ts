import { type ChartOptionDef } from "./shared";

export const iframeOptions: ChartOptionDef[] = [
  {
    key: "url",
    label: "URL",
    type: "text",
    default: "",
    category: "Content",
    description:
      "The URL of the external page to embed. Must be an https:// URL.",
  },
  {
    key: "iframeTitle",
    label: "Title",
    type: "text",
    default: "Embedded content",
    category: "Content",
    description:
      "Accessible title for the embedded content (used by screen readers).",
  },
  {
    key: "sandbox",
    label: "Sandbox Policy",
    type: "text",
    default: "allow-scripts allow-popups",
    category: "Security",
    description:
      "HTML sandbox attributes controlling what the embedded page can do. Restrict for untrusted content.",
  },
];
