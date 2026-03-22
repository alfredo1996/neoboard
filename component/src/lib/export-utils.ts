/**
 * Escape a CSV cell value per RFC 4180.
 * Wraps in quotes if the value contains comma, double-quote, or newline.
 */
function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
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
  const headerLine = headers.join(",");
  const rows = data.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(","));
  return [headerLine, ...rows].join("\n");
}

/**
 * Trigger a browser file download from a string or data URL.
 * Works by creating a temporary anchor element.
 */
export function triggerDownload(content: string, filename: string, mimeType = "text/csv"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
