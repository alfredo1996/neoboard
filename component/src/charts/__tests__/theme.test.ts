import { describe, it, expect, vi } from "vitest";
import {
  DEEP_OCEAN_LIGHT,
  DEEP_OCEAN_DARK,
  THEME_LIGHT,
  THEME_DARK,
  registerNeoboardThemes,
} from "../theme";

describe("chart theme", () => {
  describe("palette constants", () => {
    it("DEEP_OCEAN_LIGHT has 10 colors", () => {
      expect(DEEP_OCEAN_LIGHT).toHaveLength(10);
    });

    it("DEEP_OCEAN_DARK has 10 colors", () => {
      expect(DEEP_OCEAN_DARK).toHaveLength(10);
    });

    it("all light colors are valid hsl() strings", () => {
      for (const c of DEEP_OCEAN_LIGHT) {
        expect(c).toMatch(/^hsl\(\d+,\s*\d+%,\s*\d+%\)$/);
      }
    });

    it("all dark colors are valid hsl() strings", () => {
      for (const c of DEEP_OCEAN_DARK) {
        expect(c).toMatch(/^hsl\(\d+,\s*\d+%,\s*\d+%\)$/);
      }
    });

    it("light and dark palettes have no duplicate colors", () => {
      expect(new Set(DEEP_OCEAN_LIGHT).size).toBe(10);
      expect(new Set(DEEP_OCEAN_DARK).size).toBe(10);
    });
  });

  describe("theme names", () => {
    it("THEME_LIGHT is 'neoboard-light'", () => {
      expect(THEME_LIGHT).toBe("neoboard-light");
    });

    it("THEME_DARK is 'neoboard-dark'", () => {
      expect(THEME_DARK).toBe("neoboard-dark");
    });
  });

  describe("registerNeoboardThemes", () => {
    it("registers both light and dark themes", () => {
      const mockRegister = vi.fn();
      registerNeoboardThemes(mockRegister);
      expect(mockRegister).toHaveBeenCalledTimes(2);
      expect(mockRegister).toHaveBeenCalledWith(
        THEME_LIGHT,
        expect.objectContaining({ color: DEEP_OCEAN_LIGHT }),
      );
      expect(mockRegister).toHaveBeenCalledWith(
        THEME_DARK,
        expect.objectContaining({ color: DEEP_OCEAN_DARK }),
      );
    });

    it("sets transparent background on both themes", () => {
      const mockRegister = vi.fn();
      registerNeoboardThemes(mockRegister);
      for (const call of mockRegister.mock.calls) {
        expect(call[1].backgroundColor).toBe("transparent");
      }
    });

    it("includes axis styling in light theme", () => {
      const mockRegister = vi.fn();
      registerNeoboardThemes(mockRegister);
      const lightTheme = mockRegister.mock.calls.find(
        (c: unknown[]) => c[0] === THEME_LIGHT,
      )![1];
      expect(lightTheme.categoryAxis).toBeDefined();
      expect(lightTheme.valueAxis).toBeDefined();
    });

    it("includes axis styling in dark theme", () => {
      const mockRegister = vi.fn();
      registerNeoboardThemes(mockRegister);
      const darkTheme = mockRegister.mock.calls.find(
        (c: unknown[]) => c[0] === THEME_DARK,
      )![1];
      expect(darkTheme.categoryAxis).toBeDefined();
      expect(darkTheme.valueAxis).toBeDefined();
    });
  });
});
