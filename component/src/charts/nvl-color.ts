/**
 * Normalize a CSS color for the Neo4j NVL graph renderer.
 *
 * NVL draws nodes/relationships to WebGL and only understands hex colors — it
 * silently drops `hsl()` strings, leaving nodes with no fill (invisible but
 * still present/clickable). Our brand "citrine" palette is authored in `hsl()`
 * (great for ECharts, which parses it fine), so graph node colors sourced from
 * that palette must be converted to hex first (#1157).
 *
 * Only `hsl(...)` inputs are converted; hex and anything else pass through
 * unchanged (hex already works; rule/explicit colors are already hex).
 */
export function toNvlColor(color: string): string {
  const match = /^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i.exec(
    color,
  );
  if (!match) return color;
  const h = Number(match[1]);
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  return hslToHex(h, s, l);
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHexByte = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHexByte(f(0))}${toHexByte(f(8))}${toHexByte(f(4))}`;
}
