import {
  buildNeo4jQuery,
  buildPostgresQuery,
  CONNECTOR_QUERY_BUILDERS,
} from "../src/query-builders";
import { neo4jPlugin } from "../src/neo4j/plugin";
import { postgresPlugin } from "../src/postgresql/plugin";

// #1696 — spec → query text in the connector's dialect. Filter values are
// bound as `$param_<field>` driver parameters and never appear in the text;
// identifiers are quoted when the dialect would otherwise misparse them.

const HOSTILE = "'; DROP TABLE movies; --";

describe("buildNeo4jQuery", () => {
  it("matches the label and returns each field aliased to its own name", () => {
    expect(
      buildNeo4jQuery({
        source: "Movie",
        fields: ["title", "released"],
        limit: 100,
      }),
    ).toEqual({
      query:
        "MATCH (n:Movie)\nRETURN n.title AS title, n.released AS released\nLIMIT 100",
      params: {},
    });
  });

  it("binds the filter value as a parameter, never in the text", () => {
    const built = buildNeo4jQuery({
      source: "Movie",
      fields: ["title"],
      filter: { field: "released", op: ">", value: 2000 },
      limit: 50,
    });
    expect(built.query).toBe(
      "MATCH (n:Movie)\nWHERE n.released > $param_released\nRETURN n.title AS title\nLIMIT 50",
    );
    expect(built.params).toEqual({ param_released: 2000 });

    const hostile = buildNeo4jQuery({
      source: "Movie",
      fields: ["title"],
      filter: { field: "title", op: "=", value: HOSTILE },
    });
    expect(hostile.query).not.toContain("DROP");
    expect(hostile.params).toEqual({ param_title: HOSTILE });
  });

  it("spells != as <> and contains as a case-insensitive CONTAINS", () => {
    expect(
      buildNeo4jQuery({
        source: "Movie",
        fields: ["title"],
        filter: { field: "title", op: "!=", value: "x" },
      }).query,
    ).toContain("WHERE n.title <> $param_title");
    expect(
      buildNeo4jQuery({
        source: "Movie",
        fields: ["title"],
        filter: { field: "title", op: "contains", value: "x" },
      }).query,
    ).toContain(
      // toString on the parameter too: toLower rejects an Integer (#1717).
      "WHERE toLower(toString(n.title)) CONTAINS toLower(toString($param_title))",
    );
  });

  it("returns the whole node when no fields are picked", () => {
    expect(buildNeo4jQuery({ source: "Movie", fields: [] }).query).toBe(
      "MATCH (n:Movie)\nRETURN n",
    );
  });

  it("backticks identifiers Cypher would misparse and sanitises the param name", () => {
    const built = buildNeo4jQuery({
      source: "Movie Night",
      fields: ["release date", "it`s"],
      filter: { field: "release date", op: ">=", value: 1 },
    });
    expect(built.query).toBe(
      "MATCH (n:`Movie Night`)\n" +
        "WHERE n.`release date` >= $param_release_date\n" +
        "RETURN n.`release date` AS `release date`, n.`it``s` AS `it``s`",
    );
    expect(built.params).toEqual({ param_release_date: 1 });
  });

  it("omits LIMIT unless it is a positive integer", () => {
    for (const limit of [undefined, 0, -5, 2.5, Number.NaN]) {
      expect(
        buildNeo4jQuery({ source: "Movie", fields: ["title"], limit }).query,
      ).not.toContain("LIMIT");
    }
  });

  it("rejects an operator it does not know", () => {
    expect(() =>
      buildNeo4jQuery({
        source: "Movie",
        fields: [],
        // Deliberately off-contract: the builder is the boundary.
        filter: { field: "title", op: "like" as never, value: "x" },
      }),
    ).toThrow(/operator/i);
  });
});

describe("buildPostgresQuery", () => {
  it("selects the columns from the table, every identifier double-quoted", () => {
    expect(
      buildPostgresQuery({
        source: "movies",
        fields: ["title", "released"],
        filter: { field: "released", op: ">", value: 2000 },
        limit: 100,
      }),
    ).toEqual({
      query:
        'SELECT "title", "released"\nFROM "movies"\nWHERE "released" > $param_released\nLIMIT 100',
      params: { param_released: 2000 },
    });
  });

  it("never puts the filter value in the text", () => {
    const built = buildPostgresQuery({
      source: "movies",
      fields: ["title"],
      filter: { field: "title", op: "=", value: HOSTILE },
    });
    expect(built.query).not.toContain("DROP");
    expect(built.params).toEqual({ param_title: HOSTILE });
  });

  it("selects * when no fields are picked and omits a bad limit", () => {
    expect(
      buildPostgresQuery({ source: "movies", fields: [], limit: 0 }).query,
    ).toBe('SELECT *\nFROM "movies"');
  });

  it("spells != as <> and contains as ILIKE over a text cast", () => {
    expect(
      buildPostgresQuery({
        source: "movies",
        fields: [],
        filter: { field: "title", op: "!=", value: "x" },
      }).query,
    ).toContain('WHERE "title" <> $param_title');
    expect(
      buildPostgresQuery({
        source: "movies",
        fields: [],
        filter: { field: "title", op: "contains", value: "x" },
      }).query,
    ).toContain(
      "WHERE CAST(\"title\" AS text) ILIKE '%' || $param_title || '%'",
    );
  });

  it("escapes a double quote inside a name by doubling it", () => {
    expect(
      buildPostgresQuery({ source: 'say "hi"', fields: ['a"b'] }).query,
    ).toBe('SELECT "a""b"\nFROM "say ""hi"""');
  });
});

describe("plugin wiring", () => {
  it("built-in plugins expose their builder and the client-safe map matches", () => {
    expect(neo4jPlugin.buildQuery).toBe(buildNeo4jQuery);
    expect(postgresPlugin.buildQuery).toBe(buildPostgresQuery);
    expect(CONNECTOR_QUERY_BUILDERS).toEqual({
      neo4j: buildNeo4jQuery,
      postgresql: buildPostgresQuery,
    });
  });
});
