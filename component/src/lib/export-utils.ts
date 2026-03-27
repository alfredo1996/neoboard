/**
 * Escape a CSV cell value per RFC 4180.
 * Wraps in quotes if the value contains comma, double-quote, newline, or carriage return.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  const needsQuoting =
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r") ||
    /^[=@+\-]/.test(str);
  if (needsQuoting) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build a CSV string from an array of flat record objects.
 * Headers are derived from the keys of the first row.
 */
export function buildCsvString(data: Record<string, unknown>[]): string {
  if (!data.length) return "";
  const headers = Object.keys(data[0]);
  const headerLine = headers.map(escapeCsvCell).join(",");
  const rows = data.map((row) =>
    headers.map((h) => escapeCsvCell(row[h])).join(","),
  );
  return [headerLine, ...rows].join("\n");
}

/**
 * Slugify a string for use in filenames.
 * Lowercases, replaces non-alphanumeric runs with hyphens, and trims leading/trailing hyphens.
 */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

/**
 * Build a descriptive export filename from dashboard name and widget title.
 * Format: `{dashboard-slug}_{widget-slug}.{ext}`
 * Falls back to just the widget slug if dashboard name is not provided.
 */
export function buildExportFilename(
  widgetTitle: string,
  extension: string,
  dashboardName?: string,
): string {
  const widgetSlug = slugify(widgetTitle) || "export";
  if (dashboardName) {
    const dashSlug = slugify(dashboardName);
    if (dashSlug) {
      return `${dashSlug}_${widgetSlug}.${extension}`;
    }
  }
  return `${widgetSlug}.${extension}`;
}

/**
 * Trigger a browser file download from a string or data URL.
 * Works by creating a temporary anchor element.
 */
export function triggerDownload(
  content: string,
  filename: string,
  mimeType = "text/csv",
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation so the browser can read the Blob before it's freed (Firefox)
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Trigger a PNG download from a data URL (e.g. from ECharts getDataURL).
 */
export function triggerPngDownload(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
