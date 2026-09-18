import {
  CONNECTOR_FORM_FIELDS,
  neo4jFormFields,
  postgresFormFields,
} from "../src/form-fields";
import { CONNECTOR_QUERY_LANGUAGES } from "../src/query-languages";

// The connection dialog still renders from `form-fields.ts` until #1899
// replaces it with GET /api/connectors. #1897 made that file a projection of
// the connector descriptors, so these literals — captured from the hand-written
// arrays BEFORE the refactor — are what keeps the rendered form identical.
// JSON.stringify, not toEqual: key order and absent-vs-undefined both count.

const NEO4J_BEFORE = [
  {
    key: "uri",
    label: "URI",
    type: "text",
    required: true,
    placeholder: "bolt://localhost:7687",
  },
  {
    key: "username",
    label: "Username",
    type: "text",
    required: true,
    placeholder: "neo4j",
  },
  { key: "password", label: "Password", type: "password", required: true },
  {
    key: "database",
    label: "Database",
    type: "text",
    placeholder: "neo4j (default)",
    description: "Database name (leave empty for default).",
  },
];

const POSTGRES_BEFORE = [
  {
    key: "uri",
    label: "URI",
    type: "text",
    required: true,
    placeholder: "postgresql://localhost:5432",
  },
  {
    key: "username",
    label: "Username",
    type: "text",
    required: true,
    placeholder: "postgres",
  },
  { key: "password", label: "Password", type: "password", required: true },
  {
    key: "database",
    label: "Database",
    type: "text",
    placeholder: "postgres",
    description: "Database name (optional).",
  },
];

describe("form-fields.ts output is unchanged by the descriptor refactor (#1897)", () => {
  it("neo4jFormFields", () => {
    expect(JSON.stringify(neo4jFormFields)).toBe(JSON.stringify(NEO4J_BEFORE));
  });

  it("postgresFormFields", () => {
    expect(JSON.stringify(postgresFormFields)).toBe(
      JSON.stringify(POSTGRES_BEFORE),
    );
  });

  it("CONNECTOR_FORM_FIELDS", () => {
    expect(JSON.stringify(CONNECTOR_FORM_FIELDS)).toBe(
      JSON.stringify({ neo4j: NEO4J_BEFORE, postgresql: POSTGRES_BEFORE }),
    );
  });

  it("CONNECTOR_QUERY_LANGUAGES", () => {
    expect(JSON.stringify(CONNECTOR_QUERY_LANGUAGES)).toBe(
      JSON.stringify({ neo4j: "cypher", postgresql: "sql" }),
    );
  });
});
