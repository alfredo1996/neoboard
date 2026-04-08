import { createConnectionModule } from "../../src/connector-registry";
import { Neo4jConnectionModule } from "../../src/neo4j/Neo4jConnectionModule";
import { PostgresConnectionModule } from "../../src/postgresql/PostgresConnectionModule";
import { AuthType } from "../../src/generalized/interfaces";

describe("Connection Module Factory (via registry)", () => {
  const neo4jAuthConfig = {
    username: "test",
    password: "test",
    authType: AuthType.NATIVE,
    uri: "bolt://localhost:7687",
  };

  const pgAuthConfig = {
    username: "test",
    password: "test",
    authType: AuthType.NATIVE,
    uri: "postgresql://localhost:5432/testdb",
  };

  test("should create Neo4j connection module", () => {
    const module = createConnectionModule("neo4j", neo4jAuthConfig);
    expect(module).toBeInstanceOf(Neo4jConnectionModule);
  });

  test("should create PostgreSQL connection module", () => {
    const module = createConnectionModule("postgresql", pgAuthConfig);
    expect(module).toBeInstanceOf(PostgresConnectionModule);
  });

  test("should throw for unsupported connection type", () => {
    expect(() => {
      createConnectionModule("unsupported", neo4jAuthConfig);
    }).toThrow('Unknown connector type: "unsupported"');
  });
});
