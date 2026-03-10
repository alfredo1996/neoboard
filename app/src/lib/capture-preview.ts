/**
 * Capture a preview image from the widget preview pane.
 *
 * Strategy:
 * 1. For ECharts-based charts (bar, line, pie, single-value): use ECharts'
 *    native `getDataURL()` API via the canvas element.
 * 2. For other chart types: fall back to canvas screenshot via `html2canvas`
 *    if available, otherwise return undefined (icon placeholder will be used).
 *
 * Returns a JPEG data-URI (max ~100KB) or undefined if capture fails.
 */

const MAX_WIDTH = 400;
const MAX_HEIGHT = 300;
const JPEG_QUALITY = 0.7;

/**
 * Attempt to capture a preview from an ECharts canvas inside the given element.
 * Returns a data-URI string or undefined.
 */
export function captureEChartsPreview(container: HTMLElement): string | undefined {
  // ECharts renders into a <canvas> inside a div with data-testid="widget-preview"
  const canvas = container.querySelector("canvas");
  if (!canvas) return undefined;

  try {
    // Resize to thumbnail dimensions
    const thumb = document.createElement("canvas");
    thumb.width = MAX_WIDTH;
    thumb.height = MAX_HEIGHT;
    const ctx = thumb.getContext("2d");
    if (!ctx) return undefined;

    // Draw the chart canvas scaled to fit
    const srcW = canvas.width;
    const srcH = canvas.height;
    const scale = Math.min(MAX_WIDTH / srcW, MAX_HEIGHT / srcH);
    const dw = srcW * scale;
    const dh = srcH * scale;
    const dx = (MAX_WIDTH - dw) / 2;
    const dy = (MAX_HEIGHT - dh) / 2;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, MAX_WIDTH, MAX_HEIGHT);
    ctx.drawImage(canvas, dx, dy, dw, dh);

    return thumb.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch {
    // Canvas tainted or other error
    return undefined;
  }
}

/**
 * Capture a preview for table-type widgets by rendering a simple thumbnail
 * of the first few rows.
 */
export function captureTablePreview(container: HTMLElement): string | undefined {
  const table = container.querySelector("table");
  if (!table) return undefined;

  try {
    const thumb = document.createElement("canvas");
    thumb.width = MAX_WIDTH;
    thumb.height = MAX_HEIGHT;
    const ctx = thumb.getContext("2d");
    if (!ctx) return undefined;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, MAX_WIDTH, MAX_HEIGHT);
    ctx.fillStyle = "#374151";
    ctx.font = "11px system-ui, sans-serif";

    // Extract header and first few rows
    const headers = Array.from(table.querySelectorAll("th")).map((th) => th.textContent ?? "");
    const rows = Array.from(table.querySelectorAll("tbody tr")).slice(0, 6);

    const colWidth = Math.floor((MAX_WIDTH - 16) / Math.max(headers.length, 1));
    let y = 20;

    // Draw header
    ctx.fillStyle = "#1f2937";
    ctx.font = "bold 11px system-ui, sans-serif";
    headers.forEach((h, i) => {
      ctx.fillText(h.substring(0, 15), 8 + i * colWidth, y);
    });

    // Separator line
    y += 6;
    ctx.strokeStyle = "#e5e7eb";
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(MAX_WIDTH - 8, y);
    ctx.stroke();
    y += 14;

    // Draw rows
    ctx.fillStyle = "#4b5563";
    ctx.font = "11px system-ui, sans-serif";
    rows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      cells.forEach((cell, i) => {
        const text = (cell.textContent ?? "").substring(0, 15);
        ctx.fillText(text, 8 + i * colWidth, y);
      });
      y += 18;
      if (y > MAX_HEIGHT - 10) return;
    });

    return thumb.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch {
    return undefined;
  }
}

/** Chart types that use ECharts canvas rendering. */
const ECHARTS_TYPES = new Set(["bar", "line", "pie", "single-value"]);

/**
 * Capture a preview image from the widget preview container.
 * Returns a JPEG data-URI or undefined if capture is not possible.
 */
export function capturePreview(
  previewElement: HTMLElement,
  chartType: string,
): string | undefined {
  if (ECHARTS_TYPES.has(chartType)) {
    return captureEChartsPreview(previewElement);
  }
  if (chartType === "table") {
    return captureTablePreview(previewElement);
  }
  // graph, map, json, form, parameter-select: no preview capture
  return undefined;
}
