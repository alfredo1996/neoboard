import {
  describeConnectionTerms,
  registerConnector,
  unregisterConnector,
} from "../src/connector-registry";
import type { ConnectorPlugin, SchemaTerm } from "@neoboard/connector-sdk";

const fakeModule = () =>
  ({ runQuery: jest.fn(), checkConnection: jest.fn() }) as never;
const plugin = (over: Partial<ConnectorPlugin>): ConnectorPlugin => ({
  type: "terms-db",
  label: "Terms DB",
  category: "database",
  fields: [],
  createModule: fakeModule,
  ...over,
});

describe("describeConnectionTerms", () => {
  afterEach(() => unregisterConnector("terms-db"));

  it("passes a connector's own list through unchanged", async () => {
    const own: SchemaTerm[] = [{ kind: "entity", key: "Thing", parentKey: "" }];
    registerConnector(
      plugin({
        createSchemaManager: () => ({
          fetchSchema: jest.fn().mockRejectedValue(new Error("not used")),
          describeTerms: async () => own,
        }),
      }),
    );
    await expect(describeConnectionTerms("terms-db", {})).resolves.toBe(own);
  });

  it("adapts the schema when the connector has no list of its own", async () => {
    registerConnector(
      plugin({
        createSchemaManager: () => ({
          fetchSchema: async () => ({ type: "terms-db", labels: ["A"] }),
        }),
      }),
    );
    await expect(describeConnectionTerms("terms-db", {})).resolves.toEqual([
      { kind: "entity", key: "A", parentKey: "" },
    ]);
  });

  it("gives no terms for a connector with no schema manager, or an unknown type", async () => {
    registerConnector(plugin({}));
    await expect(describeConnectionTerms("terms-db", {})).resolves.toEqual([]);
    await expect(describeConnectionTerms("nope", {})).resolves.toEqual([]);
  });
});
