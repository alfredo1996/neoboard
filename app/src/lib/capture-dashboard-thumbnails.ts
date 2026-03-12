/**
 * Capture per-widget thumbnail images from the live dashboard DOM.
 *
 * Iterates over rendered widgets (located via `data-widget-id` attributes),
 * captures JPEG snapshots using the existing `capturePreview()` utility,
 * and returns a map of `{ [widgetId]: "data:image/jpeg;base64,..." }`.
 *
 * Unsupported chart types (graph, map, json, form, parameter-select) are
 * silently skipped — the dashboard list falls back to colored tiles for those.
 */

import { capturePreview } from "./capture-preview";

const THUMBNAIL_WIDTH = 200;
const THUMBNAIL_HEIGHT = 125;
const JPEG_QUALITY = 0.5;

/**
 * Downscale a full-size preview data-URI to a smaller thumbnail.
 * Returns the resized JPEG data-URI or undefined if downscaling fails.
 */
function downscale(dataUri: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = THUMBNAIL_WIDTH;
        canvas.height = THUMBNAIL_HEIGHT;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(undefined); return; }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);

        const scale = Math.min(
          THUMBNAIL_WIDTH / img.width,
          THUMBNAIL_HEIGHT / img.height,
        );
        const dw = img.width * scale;
        const dh = img.height * scale;
        const dx = (THUMBNAIL_WIDTH - dw) / 2;
        const dy = (THUMBNAIL_HEIGHT - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);

        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      } catch {
        resolve(undefined);
      }
    };
    img.onerror = () => resolve(undefined);
    img.src = dataUri;
  });
}

export interface CaptureWidget {
  id: string;
  chartType: string;
}

/**
 * Capture thumbnails for all widgets visible in the given container.
 *
 * @param container  The grid container element (must contain `[data-widget-id]` children).
 * @param widgets    Widget metadata (id + chartType) for the current page.
 * @returns Map of widgetId → JPEG data-URI for widgets where capture succeeded.
 */
export async function captureDashboardThumbnails(
  container: HTMLElement,
  widgets: CaptureWidget[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  for (const widget of widgets) {
    const el = container.querySelector<HTMLElement>(
      `[data-widget-id="${CSS.escape(widget.id)}"]`,
    );
    if (!el) continue;

    const preview = capturePreview(el, widget.chartType);
    if (!preview) continue;

    const thumb = await downscale(preview);
    if (thumb) {
      result[widget.id] = thumb;
    }
  }

  return result;
}
