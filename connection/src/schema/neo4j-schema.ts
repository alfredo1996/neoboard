import neo4j from "neo4j-driver";
import { Neo4jConnectionModule } from "../neo4j/Neo4jConnectionModule";
import type { AuthConfig } from "@neoboard/connector-sdk";
import type { SchemaManager } from "./schema-manager";
import type { DatabaseSchema, PropertyDef } from "@neoboard/connector-sdk";

/**
 * `db.schema.nodeTypeProperties()` names a node type by its whole label
 * combination, each label backticked — ":`Person`", ":`Person`:`Actor`" — and
 * `relTypeProperties()` does the same with one type. Return the bare names so
 * callers can key by label (#1693); a name that isn't quoted just loses its
 * leading colon.
 */
function typeNames(typeName: string): string[] {
  const quoted = [...typeName.matchAll(/`((?:[^`]|``)*)`/g)].map((m) =>
    m[1].replaceAll("``", "`"),
  );
  return quoted.length > 0 ? quoted : [typeName.replace(/^:/, "")];
}

function addProperty(
  map: Record<string, PropertyDef[]>,
  key: string,
  name: string | null,
  types: string[] | string | null,
) {
  const list = (map[key] ??= []);
  // A label or type with no properties is reported as one row whose
  // propertyName is NULL — keep the key, drop the phantom property (#1714).
  if (name == null) return;
  // ":Person" and ":Person:Actor" both report `name` — one property of Person.
  if (list.some((p) => p.name === name)) return;
  list.push({
    name,
    type: Array.isArray(types) ? (types[0] ?? "String") : String(types),
  });
}

/**
 * Fetches schema information from a Neo4j database.
 *
 * Runs four APOC/built-in procedures:
 *  - db.labels()
 *  - db.relationshipTypes()
 *  - db.schema.nodeTypeProperties()
 *  - db.schema.relTypeProperties()
 */
export class Neo4jSchemaManager implements SchemaManager {
  async fetchSchema(authConfig: AuthConfig): Promise<DatabaseSchema> {
    const module = new Neo4jConnectionModule(authConfig);
    // neo4j-driver and neo4j-driver-core each export their own structurally
    // identical Driver type; the module returns the -core identity while the
    // local helper is typed against neo4j-driver's. Same runtime object —
    // bridge the duplicate type identities once, here (#966).
    const driver = module.getDriver() as unknown as ReturnType<
      typeof neo4j.driver
    >;

    try {
      const [labels, relationshipTypes, nodeProperties, relProperties] =
        await Promise.all([
          this._runQuery<{ label: string }>(
            driver,
            "CALL db.labels() YIELD label RETURN label",
          ),
          this._runQuery<{ relationshipType: string }>(
            driver,
            "CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType",
          ),
          this._runQuery<{
            nodeType: string;
            propertyName: string | null;
            propertyTypes: string[] | null;
          }>(
            driver,
            "CALL db.schema.nodeTypeProperties() YIELD nodeType, propertyName, propertyTypes",
          ),
          this._runQuery<{
            relType: string;
            propertyName: string | null;
            propertyTypes: string[] | null;
          }>(
            driver,
            "CALL db.schema.relTypeProperties() YIELD relType, propertyName, propertyTypes",
          ),
        ]);

      const nodePropsMap: Record<string, PropertyDef[]> = {};
      for (const row of nodeProperties) {
        for (const label of typeNames(row.nodeType)) {
          addProperty(nodePropsMap, label, row.propertyName, row.propertyTypes);
        }
      }

      const relPropsMap: Record<string, PropertyDef[]> = {};
      for (const row of relProperties) {
        for (const relType of typeNames(row.relType)) {
          addProperty(
            relPropsMap,
            relType,
            row.propertyName,
            row.propertyTypes,
          );
        }
      }

      return {
        type: "neo4j",
        labels: labels.map((r) => r.label),
        relationshipTypes: relationshipTypes.map((r) => r.relationshipType),
        nodeProperties: nodePropsMap,
        relProperties: relPropsMap,
      };
    } finally {
      await driver.close();
    }
  }

  private async _runQuery<T>(
    driver: ReturnType<typeof neo4j.driver>,
    query: string,
  ): Promise<T[]> {
    const session = driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      const result = await session.run(query);
      return result.records.map((record) => {
        const obj: Record<string, unknown> = {};
        for (const key of record.keys) {
          const val = record.get(key);
          // Convert Neo4j integers and lists
          if (neo4j.isInt(val)) {
            obj[key as string] = val.toNumber();
          } else if (Array.isArray(val)) {
            obj[key as string] = val.map((v) =>
              neo4j.isInt(v) ? v.toNumber() : v,
            );
          } else {
            obj[key as string] = val;
          }
        }
        return obj as T;
      });
    } finally {
      await session.close();
    }
  }
}
