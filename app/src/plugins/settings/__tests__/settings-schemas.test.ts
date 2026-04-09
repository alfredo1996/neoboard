/**
 * Tests for chart plugin settings schemas.
 *
 * Verifies that each schema:
 *   1. Parses an empty object successfully (defaults applied)
 *   2. Parses valid settings without errors
 *   3. Rejects invalid values with ZodError
 *   4. Passes through unknown keys (.passthrough())
 */

import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import { barSettingsSchema } from "../../bar/settings";
import { lineSettingsSchema } from "../../line/settings";
import { pieSettingsSchema } from "../../pie/settings";
import { gaugeSettingsSchema } from "../../gauge/settings";
import { radarSettingsSchema } from "../../radar/settings";
import { sankeySettingsSchema } from "../../sankey/settings";
import { sunburstSettingsSchema } from "../../sunburst/settings";
import { treemapSettingsSchema } from "../../treemap/settings";
import { singleValueSettingsSchema } from "../../single-value/settings";
import { tableSettingsSchema } from "../../table/settings";
import { jsonSettingsSchema } from "../../json/settings";
import { graphSettingsSchema } from "../../graph/settings";
import { mapSettingsSchema } from "../../map/settings";
import { markdownSettingsSchema } from "../../markdown/settings";
import { iframeSettingsSchema } from "../../iframe/settings";
import { formSettingsSchema } from "../../form/settings";
import { parameterSelectSettingsSchema } from "../../parameter-select/settings";

// ---------------------------------------------------------------------------
// Helper: all schemas in one place for shared tests
// ---------------------------------------------------------------------------

const schemas = [
  { name: "bar", schema: barSettingsSchema },
  { name: "line", schema: lineSettingsSchema },
  { name: "pie", schema: pieSettingsSchema },
  { name: "gauge", schema: gaugeSettingsSchema },
  { name: "radar", schema: radarSettingsSchema },
  { name: "sankey", schema: sankeySettingsSchema },
  { name: "sunburst", schema: sunburstSettingsSchema },
  { name: "treemap", schema: treemapSettingsSchema },
  { name: "single-value", schema: singleValueSettingsSchema },
  { name: "table", schema: tableSettingsSchema },
  { name: "json", schema: jsonSettingsSchema },
  { name: "graph", schema: graphSettingsSchema },
  { name: "map", schema: mapSettingsSchema },
  { name: "markdown", schema: markdownSettingsSchema },
  { name: "iframe", schema: iframeSettingsSchema },
  { name: "form", schema: formSettingsSchema },
  { name: "parameter-select", schema: parameterSelectSettingsSchema },
] as const;

describe("settings schemas — shared behavior", () => {
  it.each(schemas)("$name: parses empty object with defaults", ({ schema }) => {
    const result = schema.parse({});
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  it.each(schemas)("$name: passes through unknown keys", ({ schema }) => {
    const result = schema.parse({ _unknownKey: "hello", _extra: 42 });
    expect(result).toHaveProperty("_unknownKey", "hello");
    expect(result).toHaveProperty("_extra", 42);
  });
});

// ---------------------------------------------------------------------------
// Bar settings
// ---------------------------------------------------------------------------

describe("barSettingsSchema", () => {
  it("applies correct defaults", () => {
    const result = barSettingsSchema.parse({});
    expect(result.orientation).toBe("vertical");
    expect(result.stacked).toBe(false);
    expect(result.showValues).toBe(false);
    expect(result.showLegend).toBe(true);
    expect(result.barWidth).toBe(0);
    expect(result.barGap).toBe("30%");
    expect(result.showGridLines).toBe(true);
    expect(result.axisLabelRotation).toBe(-1);
    expect(result.enableDataZoom).toBe(false);
    expect(result.colorblindMode).toBe(false);
  });

  it("parses valid settings", () => {
    const result = barSettingsSchema.parse({
      orientation: "horizontal",
      stacked: true,
      barWidth: 20,
      xAxisLabel: "Category",
      yAxisLabel: "Count",
      colorPalette: "ocean",
    });
    expect(result.orientation).toBe("horizontal");
    expect(result.stacked).toBe(true);
    expect(result.barWidth).toBe(20);
    expect(result.xAxisLabel).toBe("Category");
  });

  it("rejects invalid orientation", () => {
    expect(() => barSettingsSchema.parse({ orientation: "diagonal" })).toThrow(
      ZodError,
    );
  });

  it("coerces string numbers for barWidth", () => {
    const result = barSettingsSchema.parse({ barWidth: "15" });
    expect(result.barWidth).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Line settings
// ---------------------------------------------------------------------------

describe("lineSettingsSchema", () => {
  it("applies correct defaults", () => {
    const result = lineSettingsSchema.parse({});
    expect(result.smooth).toBe(false);
    expect(result.area).toBe(false);
    expect(result.showLegend).toBe(true);
    expect(result.lineWidth).toBe(2);
    expect(result.stepped).toBe(false);
    expect(result.showPoints).toBe(false);
    expect(result.showGridLines).toBe(true);
    expect(result.connectNulls).toBe(false);
    expect(result.endLabel).toBe(false);
    expect(result.enableDataZoom).toBe(false);
    expect(result.colorblindMode).toBe(false);
  });

  it("parses valid settings", () => {
    const result = lineSettingsSchema.parse({
      smooth: true,
      area: true,
      rightAxisSeries: "revenue, expenses",
      lineWidth: 3,
    });
    expect(result.smooth).toBe(true);
    expect(result.rightAxisSeries).toBe("revenue, expenses");
    expect(result.lineWidth).toBe(3);
  });

  it("coerces string numbers for lineWidth", () => {
    const result = lineSettingsSchema.parse({ lineWidth: "4" });
    expect(result.lineWidth).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Pie settings
// ---------------------------------------------------------------------------

describe("pieSettingsSchema", () => {
  it("applies correct defaults", () => {
    const result = pieSettingsSchema.parse({});
    expect(result.donut).toBe(false);
    expect(result.showLabel).toBe(true);
    expect(result.showLegend).toBe(true);
    expect(result.roseMode).toBe(false);
    expect(result.labelPosition).toBe("outside");
    expect(result.showPercentage).toBe(false);
    expect(result.sortSlices).toBe(false);
    expect(result.colorblindMode).toBe(false);
  });

  it("rejects invalid labelPosition", () => {
    expect(() => pieSettingsSchema.parse({ labelPosition: "top" })).toThrow(
      ZodError,
    );
  });

  it("coerces string numbers for topN", () => {
    const result = pieSettingsSchema.parse({ topN: "5" });
    expect(result.topN).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Gauge settings
// ---------------------------------------------------------------------------

describe("gaugeSettingsSchema", () => {
  it("applies correct defaults", () => {
    const result = gaugeSettingsSchema.parse({});
    expect(result.min).toBe(0);
    expect(result.max).toBe(100);
    expect(result.showProgress).toBe(true);
    expect(result.showPointer).toBe(true);
    expect(result.showDetail).toBe(true);
    expect(result.startAngle).toBe(225);
    expect(result.endAngle).toBe(-45);
  });

  it("coerces string numbers", () => {
    const result = gaugeSettingsSchema.parse({ min: "10", max: "200" });
    expect(result.min).toBe(10);
    expect(result.max).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Radar settings
// ---------------------------------------------------------------------------

describe("radarSettingsSchema", () => {
  it("applies correct defaults", () => {
    const result = radarSettingsSchema.parse({});
    expect(result.shape).toBe("polygon");
    expect(result.filled).toBe(false);
    expect(result.showLegend).toBe(true);
    expect(result.showValues).toBe(false);
  });

  it("rejects invalid shape", () => {
    expect(() => radarSettingsSchema.parse({ shape: "triangle" })).toThrow(
      ZodError,
    );
  });
});

// ---------------------------------------------------------------------------
// Sankey settings
// ---------------------------------------------------------------------------

describe("sankeySettingsSchema", () => {
  it("applies correct defaults", () => {
    const result = sankeySettingsSchema.parse({});
    expect(result.orient).toBe("horizontal");
    expect(result.showLabels).toBe(true);
    expect(result.nodeWidth).toBe(20);
    expect(result.nodeGap).toBe(8);
  });

  it("coerces string numbers for nodeWidth", () => {
    const result = sankeySettingsSchema.parse({ nodeWidth: "30" });
    expect(result.nodeWidth).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Sunburst settings
// ---------------------------------------------------------------------------

describe("sunburstSettingsSchema", () => {
  it("applies correct defaults", () => {
    const result = sunburstSettingsSchema.parse({});
    expect(result.showLabels).toBe(true);
    expect(result.sort).toBe("desc");
    expect(result.highlightOnHover).toBe(true);
  });

  it("rejects invalid sort", () => {
    expect(() => sunburstSettingsSchema.parse({ sort: "random" })).toThrow(
      ZodError,
    );
  });
});

// ---------------------------------------------------------------------------
// Treemap settings
// ---------------------------------------------------------------------------

describe("treemapSettingsSchema", () => {
  it("applies correct defaults", () => {
    const result = treemapSettingsSchema.parse({});
    expect(result.showLabels).toBe(true);
    expect(result.showBreadcrumb).toBe(true);
    expect(result.showValues).toBe(false);
    expect(result.colorSaturation).toBe("medium");
  });

  it("rejects invalid colorSaturation", () => {
    expect(() =>
      treemapSettingsSchema.parse({ colorSaturation: "ultra" }),
    ).toThrow(ZodError);
  });
});

// ---------------------------------------------------------------------------
// Single value settings
// ---------------------------------------------------------------------------

describe("singleValueSettingsSchema", () => {
  it("applies correct defaults", () => {
    const result = singleValueSettingsSchema.parse({});
    expect(result.fontSize).toBe("lg");
    expect(result.numberFormat).toBe("plain");
  });

  it("parses valid settings", () => {
    const result = singleValueSettingsSchema.parse({
      title: "Total",
      prefix: "$",
      suffix: "USD",
      fontSize: "xl",
      numberFormat: "comma",
      decimalPlaces: 2,
    });
    expect(result.title).toBe("Total");
    expect(result.fontSize).toBe("xl");
    expect(result.decimalPlaces).toBe(2);
  });

  it("rejects invalid fontSize", () => {
    expect(() => singleValueSettingsSchema.parse({ fontSize: "xxxl" })).toThrow(
      ZodError,
    );
  });
});

// ---------------------------------------------------------------------------
// JSON settings
// ---------------------------------------------------------------------------

describe("jsonSettingsSchema", () => {
  it("applies correct defaults", () => {
    const result = jsonSettingsSchema.parse({});
    expect(result.initialExpanded).toBe(2);
  });

  it("coerces string numbers", () => {
    const result = jsonSettingsSchema.parse({ initialExpanded: "5" });
    expect(result.initialExpanded).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Graph settings
// ---------------------------------------------------------------------------

describe("graphSettingsSchema", () => {
  it("applies correct defaults", () => {
    const result = graphSettingsSchema.parse({});
    expect(result.layout).toBe("force");
    expect(result.showLabels).toBe(true);
  });

  it("rejects invalid layout", () => {
    expect(() => graphSettingsSchema.parse({ layout: "random" })).toThrow(
      ZodError,
    );
  });
});

// ---------------------------------------------------------------------------
// Map settings
// ---------------------------------------------------------------------------

describe("mapSettingsSchema", () => {
  it("applies correct defaults", () => {
    const result = mapSettingsSchema.parse({});
    expect(result.autoFitBounds).toBe(true);
  });

  it("parses valid settings", () => {
    const result = mapSettingsSchema.parse({
      tileLayer: "https://tiles.example.com/{z}/{x}/{y}.png",
      zoom: 10,
      minZoom: 2,
      maxZoom: 18,
      autoFitBounds: false,
    });
    expect(result.zoom).toBe(10);
    expect(result.autoFitBounds).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Markdown settings
// ---------------------------------------------------------------------------

describe("markdownSettingsSchema", () => {
  it("parses empty object", () => {
    const result = markdownSettingsSchema.parse({});
    expect(result.content).toBeUndefined();
  });

  it("parses valid content", () => {
    const result = markdownSettingsSchema.parse({ content: "# Hello" });
    expect(result.content).toBe("# Hello");
  });
});

// ---------------------------------------------------------------------------
// Iframe settings
// ---------------------------------------------------------------------------

describe("iframeSettingsSchema", () => {
  it("parses empty object", () => {
    const result = iframeSettingsSchema.parse({});
    expect(result.url).toBeUndefined();
    expect(result.iframeTitle).toBeUndefined();
    expect(result.sandbox).toBeUndefined();
  });

  it("parses valid settings", () => {
    const result = iframeSettingsSchema.parse({
      url: "https://example.com",
      iframeTitle: "My Frame",
      sandbox: "allow-scripts",
    });
    expect(result.url).toBe("https://example.com");
  });
});

// ---------------------------------------------------------------------------
// Form settings
// ---------------------------------------------------------------------------

describe("formSettingsSchema", () => {
  it("parses empty object", () => {
    const result = formSettingsSchema.parse({});
    expect(result).toBeDefined();
  });

  it("passes through form-specific keys", () => {
    const result = formSettingsSchema.parse({
      fields: [{ name: "email", type: "text" }],
      submitLabel: "Save",
    });
    expect(result).toHaveProperty("fields");
    expect(result).toHaveProperty("submitLabel", "Save");
  });
});

// ---------------------------------------------------------------------------
// Table settings
// ---------------------------------------------------------------------------

describe("tableSettingsSchema", () => {
  it("parses empty object", () => {
    const result = tableSettingsSchema.parse({});
    expect(result).toBeDefined();
  });

  it("passes through table-specific keys", () => {
    const result = tableSettingsSchema.parse({
      pageSize: 25,
      showRowNumbers: true,
    });
    expect(result).toHaveProperty("pageSize", 25);
  });
});

// ---------------------------------------------------------------------------
// Parameter select settings
// ---------------------------------------------------------------------------

describe("parameterSelectSettingsSchema", () => {
  it("applies correct defaults", () => {
    const result = parameterSelectSettingsSchema.parse({});
    expect(result.parameterType).toBe("select");
    expect(result.rangeMin).toBe(0);
    expect(result.rangeMax).toBe(100);
    expect(result.rangeStep).toBe(1);
    expect(result.searchable).toBe(true);
  });

  it("parses valid settings", () => {
    const result = parameterSelectSettingsSchema.parse({
      parameterName: "category",
      parameterType: "multi-select",
      seedQuery: "RETURN DISTINCT type FROM items",
      searchable: false,
    });
    expect(result.parameterName).toBe("category");
    expect(result.parameterType).toBe("multi-select");
    expect(result.searchable).toBe(false);
  });

  it("rejects invalid parameterType", () => {
    expect(() =>
      parameterSelectSettingsSchema.parse({ parameterType: "invalid" }),
    ).toThrow(ZodError);
  });

  it("coerces string numbers for range fields", () => {
    const result = parameterSelectSettingsSchema.parse({
      rangeMin: "10",
      rangeMax: "500",
      rangeStep: "5",
    });
    expect(result.rangeMin).toBe(10);
    expect(result.rangeMax).toBe(500);
    expect(result.rangeStep).toBe(5);
  });
});
