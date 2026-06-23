import type { ZodError } from "zod";

/**
 * Turn a Zod validation failure on a dashboard export into a message that
 * names *where* the file is wrong, instead of a bare "Required" (#1048).
 *
 * e.g. path `["layout","pages",0,"widgets",0,"query"]` + "Required" becomes
 * `layout.pages[0].widgets[0].query: Required`.
 */
export function formatZodPath(path: ReadonlyArray<string | number>): string {
  return path.reduce<string>((acc, seg) => {
    if (typeof seg === "number") return `${acc}[${seg}]`;
    return acc ? `${acc}.${seg}` : seg;
  }, "");
}

export function formatImportError(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "The dashboard file is not a valid export.";
  const where = formatZodPath(issue.path);
  return where
    ? `Invalid dashboard file — ${where}: ${issue.message}`
    : `Invalid dashboard file — ${issue.message}`;
}
