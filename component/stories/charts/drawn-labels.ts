import * as echarts from "echarts/core";

type Rect = { intersect(other: Rect): boolean };
type HostEl = { getTextContent?(): DisplayEl | undefined };
type DisplayEl = {
  type: string;
  ignore: boolean;
  style?: { text?: string };
  transform?: number[] | null;
  getBoundingRect(): {
    clone(): Rect & { applyTransform(m: number[] | null): void };
  };
};

/** Pixel rects of the region names ECharts actually drew (not ignored). */
export function drawnLabels(canvasElement: HTMLElement) {
  const el = canvasElement.querySelector<HTMLElement>(
    '[data-testid="base-chart"]',
  );
  const zr = el && echarts.getInstanceByDom(el)?.getZr();
  if (!zr) return [];
  // Region names are the text content of each region shape, not list entries.
  return (zr.storage.getDisplayList() as unknown as HostEl[])
    .map((h) => h.getTextContent?.())
    .filter((e): e is DisplayEl => !!e)
    .filter((e) => e.type === "text" && !e.ignore && e.style?.text)
    .map((e) => {
      const rect = e.getBoundingRect().clone();
      rect.applyTransform(e.transform ?? null); // mutates in place
      return { text: String(e.style?.text), rect: rect as Rect };
    });
}

/** "A / B" for every pair of drawn labels whose boxes intersect. */
export function labelClashes(labels: ReturnType<typeof drawnLabels>) {
  const clashes: string[] = [];
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++)
      if (labels[i].rect.intersect(labels[j].rect))
        clashes.push(`${labels[i].text} / ${labels[j].text}`);
  return clashes;
}
