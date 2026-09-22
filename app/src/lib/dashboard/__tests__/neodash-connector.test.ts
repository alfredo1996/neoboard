import { describe, it, expect } from "vitest";
import { cypherConnector } from "../neodash-connector";

/**
 * #1900: a NeoDash dashboard's reports are Cypher, so the import needs an
 * installed connector that SPEAKS Cypher — which is a question about the
 * query language, not about a connector's name. The import used to synthesize
 * `type: "neo4j"` and hope.
 */
const graphy = {
  type: "some-graph-db",
  label: "Some Graph DB",
  queryLanguage: "cypher",
};
const tabular = {
  type: "some-sql-db",
  label: "Some SQL DB",
  queryLanguage: "sql",
};
const mute = { type: "files", label: "Files" };

describe("cypherConnector", () => {
  it("finds the installed connector that speaks Cypher, whatever it is called", () => {
    expect(cypherConnector([tabular, graphy])).toEqual(graphy);
  });

  it("is undefined when nothing installed speaks Cypher", () => {
    expect(cypherConnector([tabular, mute])).toBeUndefined();
  });

  // Loading and "nothing installed" are both `undefined` here on purpose —
  // the caller tells them apart, because only one of them is permanent.
  it("is undefined while the connectors are still loading", () => {
    expect(cypherConnector(undefined)).toBeUndefined();
  });

  it("does not pick a connector that declares no language", () => {
    expect(cypherConnector([mute])).toBeUndefined();
  });

  it("takes the first when several speak Cypher", () => {
    const other = {
      type: "another-graph",
      label: "Another",
      queryLanguage: "cypher",
    };
    expect(cypherConnector([graphy, other])).toEqual(graphy);
  });
});
