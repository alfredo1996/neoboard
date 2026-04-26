import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readManifest,
  addToManifest,
  removeFromManifest,
} from "../../lib/manifest.js";

describe("manifest", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), "neoboard-test-" + Date.now());
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("readManifest", () => {
    it("returns empty arrays when file does not exist", () => {
      const result = readManifest(join(tempDir, "missing.json"), "plugins");
      expect(result).toEqual([]);
    });

    it("reads existing plugins", () => {
      const path = join(tempDir, "plugins.json");
      writeFileSync(
        path,
        JSON.stringify({
          plugins: [{ package: "@myorg/heatmap" }],
        }),
      );
      const result = readManifest(path, "plugins");
      expect(result).toHaveLength(1);
      expect(result[0].package).toBe("@myorg/heatmap");
    });

    it("reads existing connectors", () => {
      const path = join(tempDir, "connectors.json");
      writeFileSync(
        path,
        JSON.stringify({
          connectors: [{ package: "@myorg/mongodb" }],
        }),
      );
      const result = readManifest(path, "connectors");
      expect(result).toHaveLength(1);
      expect(result[0].package).toBe("@myorg/mongodb");
    });
  });

  describe("addToManifest", () => {
    it("creates file and adds entry when file does not exist", () => {
      const path = join(tempDir, "new.json");
      addToManifest(path, "plugins", { package: "@myorg/heatmap" });
      const result = readManifest(path, "plugins");
      expect(result).toHaveLength(1);
      expect(result[0].package).toBe("@myorg/heatmap");
    });

    it("appends to existing entries", () => {
      const path = join(tempDir, "existing.json");
      writeFileSync(
        path,
        JSON.stringify({ plugins: [{ package: "@myorg/a" }] }),
      );
      addToManifest(path, "plugins", { package: "@myorg/b" });
      const result = readManifest(path, "plugins");
      expect(result).toHaveLength(2);
    });

    it("does not duplicate existing package", () => {
      const path = join(tempDir, "dup.json");
      writeFileSync(
        path,
        JSON.stringify({ plugins: [{ package: "@myorg/a" }] }),
      );
      addToManifest(path, "plugins", { package: "@myorg/a" });
      const result = readManifest(path, "plugins");
      expect(result).toHaveLength(1);
    });

    it("supports overrides flag", () => {
      const path = join(tempDir, "override.json");
      addToManifest(path, "plugins", {
        package: "@myorg/bar",
        overrides: true,
      });
      const result = readManifest(path, "plugins");
      expect(result[0].overrides).toBe(true);
    });
  });

  describe("error handling and safety", () => {
    it("warns and returns empty on corrupted JSON", () => {
      const path = join(tempDir, "corrupt.json");
      writeFileSync(path, "NOT VALID JSON{{{");
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = readManifest(path, "plugins");
      expect(result).toEqual([]);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("atomic write doesn't leave temp files on success", () => {
      const path = join(tempDir, "atomic.json");
      addToManifest(path, "plugins", { package: "@myorg/test" });
      const files = readdirSync(tempDir);
      expect(files.filter((f) => f.startsWith(".tmp-"))).toHaveLength(0);
    });
  });

  describe("removeFromManifest", () => {
    it("removes an entry by package name", () => {
      const path = join(tempDir, "remove.json");
      writeFileSync(
        path,
        JSON.stringify({
          plugins: [{ package: "@myorg/a" }, { package: "@myorg/b" }],
        }),
      );
      const removed = removeFromManifest(path, "plugins", "@myorg/a");
      expect(removed).toBe(true);
      const result = readManifest(path, "plugins");
      expect(result).toHaveLength(1);
      expect(result[0].package).toBe("@myorg/b");
    });

    it("returns false when package not found", () => {
      const path = join(tempDir, "notfound.json");
      writeFileSync(
        path,
        JSON.stringify({ plugins: [{ package: "@myorg/a" }] }),
      );
      const removed = removeFromManifest(path, "plugins", "@myorg/missing");
      expect(removed).toBe(false);
    });

    it("returns false when file does not exist", () => {
      const removed = removeFromManifest(
        join(tempDir, "missing.json"),
        "plugins",
        "@myorg/a",
      );
      expect(removed).toBe(false);
    });
  });
});
