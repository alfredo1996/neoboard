/**
 * The Equal Earth projection (Šavrič, Patterson & Jenny 2018), written inline so
 * the choropleth needs no `d3-geo` (#2230). Shaped for ECharts' map-series
 * `projection` option: `project` goes lon/lat degrees to planar x/y, and
 * `unproject` is the inverse (a Newton iteration; the forward map has no closed
 * inverse). Scaled by 100 and y flipped, because ECharts draws y downwards.
 */
const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;
const SCALE = 100;

/** Polynomial of the auxiliary latitude and its derivative. */
function poly(th: number) {
  const t2 = th * th;
  const t6 = t2 * t2 * t2;
  return {
    y: th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)),
    dy: A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2),
  };
}

export const equalEarth = {
  project([lon, lat]: [number, number]): [number, number] {
    const l = (lon * Math.PI) / 180;
    const th = Math.asin(M * Math.sin((lat * Math.PI) / 180));
    const { y, dy } = poly(th);
    return [(SCALE * l * Math.cos(th)) / (M * dy), -SCALE * y];
  },
  unproject([x, y]: [number, number]): [number, number] {
    const px = x / SCALE;
    const py = -y / SCALE;
    let th = py;
    for (let i = 0; i < 12; i++) {
      const p = poly(th);
      const d = (p.y - py) / p.dy;
      th -= d;
      if (Math.abs(d) < 1e-9) break;
    }
    const { dy } = poly(th);
    return [
      ((180 / Math.PI) * M * px * dy) / Math.cos(th),
      (180 / Math.PI) * Math.asin(Math.sin(th) / M),
    ];
  },
};
