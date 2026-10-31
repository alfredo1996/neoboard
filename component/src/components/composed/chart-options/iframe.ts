import { type ChartOptionDef } from "./shared";
import { validateIframeUrl } from "./validate-iframe-url";
import { validateIframeSandbox } from "./iframe-sandbox";

export const iframeOptions: ChartOptionDef[] = [
  {
    key: "url",
    label: "URL",
    type: "text",
    default: "",
    category: "Content",
    help: "Prefer https. Some sites refuse framing.",
    description:
      "Page to embed; prefer https. Some sites refuse framing via X-Frame-Options / CSP.",
    validate: validateIframeUrl,
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
    default: "",
    category: "Security",
    help: "Restrict if the page is untrusted.",
    description:
      "Sandbox attributes controlling what the embedded page can do. Restrict if untrusted.",
    validate: validateIframeSandbox,
  },
];
