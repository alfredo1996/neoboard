import { describe, it, expect, afterEach } from "vitest";
import { buildEmptyDataOption } from "../chart-utils";

describe("buildEmptyDataOption", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("uses the light muted-foreground tone by default", () => {
    const opt = buildEmptyDataOption() as {
      title: { text: string; textStyle: { color: string } };
    };
    expect(opt.title.text).toBe("No data");
    expect(opt.title.textStyle.color).toBe("#666d7a");
  });

  it("uses the dark muted-foreground tone in dark mode", () => {
    document.documentElement.classList.add("dark");
    const opt = buildEmptyDataOption() as {
      title: { textStyle: { color: string } };
    };
    expect(opt.title.textStyle.color).toBe("#959ba7");
  });
});
