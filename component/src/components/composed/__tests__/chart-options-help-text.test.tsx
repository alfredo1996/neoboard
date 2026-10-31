import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { OptionRows } from "./option-rows";
import {
  getChartOptions,
  CHART_TYPES_WITH_OPTIONS,
} from "../chart-options/index";

vi.setConfig({ testTimeout: 15000 });

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

/**
 * #1549 — option help text.
 *
 * The descriptions themselves are recent and wanted (#1283 item 2b moved them
 * out of a Label-only tooltip into real text). Two things went wrong with how
 * they land.
 *
 * 1. LAYOUT. `OptionLabel` returned a bare Fragment, and the boolean case
 *    renders it directly inside `flex items-center justify-between`. The
 *    fragment flattens, so the description <p> became a THIRD flex child
 *    sitting between the label and the Switch instead of beneath the label —
 *    on 89 of the 186 rendered description instances. A long description there
 *    does not merely take space, it shoves the switch across the panel.
 *
 * 2. LENGTH. 121 descriptions, median 57 chars — which reads fine inline — but
 *    a long tail to 194. The problem is the tail, not the mechanism, so the
 *    fix is to shorten the outliers and ratchet the limit rather than build a
 *    disclosure UI that would regress #1283 item 2b.
 */

/** Longest a description may be. Absolute, not derived from the current median. */
const MAX_DESCRIPTION_LENGTH = 90;

describe("#1549 — option help text layout", () => {
  it("reads a boolean's description but does not draw it, so every row stays one line (#2388)", () => {
    const option = getChartOptions("bar").find(
      (o) => o.type === "boolean" && o.description && !o.help,
    );
    expect(option, "no described boolean option to test").toBeDefined();

    render(
      <OptionRows chartType="bar" settings={{}} onSettingsChange={vi.fn()} />,
    );

    const description = document.getElementById(`${option!.key}-desc`);
    expect(description).toHaveClass("sr-only");
    expect(document.getElementById(option!.key)).toHaveAttribute(
      "aria-describedby",
      `${option!.key}-desc`,
    );
  });

  it("wraps described and undescribed options the same way", () => {
    const options = getChartOptions("bar").filter((o) => o.type === "boolean");
    const described = options.find((o) => o.description);
    const bare = options.find((o) => !o.description);
    expect(described).toBeDefined();
    if (!bare) return; // every boolean is described — nothing to compare

    render(
      <OptionRows chartType="bar" settings={{}} onSettingsChange={vi.fn()} />,
    );

    const rowOf = (key: string) =>
      document.querySelector(`label[for="${key}"]`)!.parentElement!;
    // Same row for both, so rows do not jump when a description is added or
    // removed.
    expect(rowOf(described!.key).className).toBe(rowOf(bare.key).className);
  });
});

describe("#1549 — option help text length", () => {
  it("keeps every description within the length budget", () => {
    const offenders: string[] = [];
    for (const chartType of CHART_TYPES_WITH_OPTIONS) {
      for (const option of getChartOptions(chartType)) {
        if (
          option.description &&
          option.description.length > MAX_DESCRIPTION_LENGTH
        ) {
          offenders.push(
            `${chartType}.${option.key} (${option.description.length})`,
          );
        }
      }
    }
    expect(
      [...new Set(offenders)].sort(),
      `descriptions over ${MAX_DESCRIPTION_LENGTH} chars`,
    ).toEqual([]);
  });

  it("still has descriptions to check", () => {
    const described = CHART_TYPES_WITH_OPTIONS.flatMap((t) =>
      getChartOptions(t).filter((o) => o.description),
    );
    expect(described.length).toBeGreaterThan(50);
  });
});
