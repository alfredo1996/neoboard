import { type ChartOptionDef } from "./shared";
import { validateIframeUrl } from "./validate-iframe-url";

export const iframeOptions: ChartOptionDef[] = [
  {
    key: "url",
    label: "URL",
    type: "text",
    default: "",
    category: "Content",
    description:
      "The URL of the external page to embed. Must be an https:// URL. " +
      "Some sites refuse framing via X-Frame-Options / CSP.",
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
    description:
      "HTML sandbox attributes controlling what the embedded page can do. Restrict for untrusted content.",
  },
];
