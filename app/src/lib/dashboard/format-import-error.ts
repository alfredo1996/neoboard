import type { ZodError } from "zod";

/**
 * Turn a Zod validation failure on a dashboard export into a message that
 * names *where* the file is wrong, instead of a bare "Required" (#1048).
 *
 * e.g. path `["layout","pages",0,"widgets",0,"query"]` + "Required" becomes
 * `layout.pages[0].widgets[0].query: Required`.
 */
/**
 * Accepts `PropertyKey[]`, which is what zod 4 widened `issue.path` to — it can
 * now contain symbols. A symbol has no useful textual form here, so it is
 * rendered via `String()` rather than dropped: losing a segment would silently
 * mis-address the error, which is the opposite of what this function is for.
 */
export function formatZodPath(path: ReadonlyArray<PropertyKey>): string {
  return path.reduce<string>((acc, seg) => {
    if (typeof seg === "number") return `${acc}[${seg}]`;
    const key = typeof seg === "symbol" ? String(seg) : seg;
    return acc ? `${acc}.${key}` : key;
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
