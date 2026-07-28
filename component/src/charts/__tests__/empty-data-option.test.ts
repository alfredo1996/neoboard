import { describe, it, expect } from "vitest";
import { buildEmptyDataOption } from "../chart-utils";

describe("buildEmptyDataOption", () => {
  // The colour is now an argument, not a DOM read. Reading the theme inside a
  // useMemo body is what froze the label at mount-time theme (#1286) — a pure
  // function cannot make that mistake, and the caller is forced to subscribe.
  it.each([
    [false, "#666d7a"],
    [true, "#959ba7"],
  ])("uses the muted-foreground tone for dark=%s", (dark, color) => {
    const opt = buildEmptyDataOption(dark) as {
      title: { text: string; textStyle: { color: string } };
    };
    expect(opt.title.text).toBe("No data");
    expect(opt.title.textStyle.color).toBe(color);
  });
});
