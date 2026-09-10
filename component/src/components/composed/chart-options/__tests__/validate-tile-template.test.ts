import { describe, it, expect } from "vitest";
import {
  unknownTilePlaceholders,
  validateTileTemplate,
} from "../validate-tile-template";

// Leaflet's Util.template throws "No value provided for variable {x}" for any
// placeholder it was not handed — synchronously, from inside addTo(map).
// Provider docs hand out {apikey}, {accessToken}, {id} and {style} verbatim.
describe("validateTileTemplate (#1685)", () => {
  it.each([
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    "https://tiles.example.test/{z}/{x}/{y}{r}.png",
    "https://tiles.example.test/{z}/{x}/{-y}.png",
    "none",
    "",
    "   ",
  ])("accepts %j", (value) => {
    expect(validateTileTemplate(value)).toBeNull();
  });

  it.each([
    "https://tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey={apikey}",
    "https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}",
    "https://tiles.example.test/{Z}/{x}/{y}.png",
  ])("rejects %j with an error naming the placeholder", (value) => {
    const result = validateTileTemplate(value);
    expect(result?.level).toBe("error");
    const [first] = unknownTilePlaceholders(value);
    expect(result?.message).toContain(`{${first}}`);
  });

  it("lists every unknown placeholder, in order, once each", () => {
    expect(
      unknownTilePlaceholders("https://t/{id}/{z}/{x}/{y}?k={apikey}&s={id}"),
    ).toEqual(["id", "apikey"]);
  });

  it.each(["{ z}", "{  z}"])(
    "skips leading spaces the way Leaflet's ` *` does — %s is {z}",
    (braces) => {
      expect(
        unknownTilePlaceholders(`https://t/${braces}/{x}/{y}.png`),
      ).toEqual([]);
    },
  );

  it("still rejects braces holding only spaces — Leaflet throws for those too", () => {
    // Util.template matches `{ }` (capture " "), finds no data for it, throws.
    expect(validateTileTemplate("https://t/{ }/{z}/{x}/{y}.png")?.level).toBe(
      "error",
    );
  });

  it("treats a space inside the braces the way Leaflet does — as part of the name", () => {
    // Util.template captures "z " for "{z }", looks up data["z "], and throws.
    expect(unknownTilePlaceholders("https://t/{z }/{x}/{y}.png")).toEqual([
      "z ",
    ]);
  });
});
