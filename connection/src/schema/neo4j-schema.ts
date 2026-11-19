import neo4j from "neo4j-driver";
import { Neo4jConnectionModule } from "../neo4j/Neo4jConnectionModule";
import {
  DEFAULT_CONNECTION_CONFIG,
  type ConnectorConfig,
  type DatabaseSchema,
  type PropertyDef,
  type RelationshipPattern,
} from "@neoboard/connector-sdk";
import type { SchemaManager } from "./schema-manager";
import { optionalString } from "../config-bag";

const PATTERN_SAMPLE = 1000;
const PATTERN_CONCURRENCY = 8;

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
  async fetchSchema(config: ConnectorConfig): Promise<DatabaseSchema> {
    const module = new Neo4jConnectionModule(config);
    // neo4j-driver and neo4j-driver-core each export their own structurally
    // identical Driver type; the module returns the -core identity while the
    // local helper is typed against neo4j-driver's. Same runtime object —
    // bridge the duplicate type identities once, here (#966).
    const driver = module.getDriver() as unknown as ReturnType<
      typeof neo4j.driver
    >;

    // The connection's own database, as its queries use — not the server's
    // home database (#1919). Blank means home, as it does for queries.
    const database = optionalString(config.database);
    const openSession = () =>
      driver.session({ defaultAccessMode: neo4j.session.READ, database });
    try {
      const [labels, relationshipTypes, nodeProperties, relProperties] =
        await Promise.all([
          this._runQuery<{ label: string }>(
            openSession,
            "CALL db.labels() YIELD label RETURN label",
          ),
          this._runQuery<{ relationshipType: string }>(
            openSession,
            "CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType",
          ),
          this._runQuery<{
            nodeType: string;
            propertyName: string;
            propertyTypes: string[];
          }>(
            openSession,
            "CALL db.schema.nodeTypeProperties() YIELD nodeType, propertyName, propertyTypes",
          ),
          this._runQuery<{
            relType: string;
            propertyName: string;
            propertyTypes: string[];
          }>(
            openSession,
            "CALL db.schema.relTypeProperties() YIELD relType, propertyName, propertyTypes",
          ),
        ]);

      const nodePropsMap: Record<string, PropertyDef[]> = {};
      for (const row of nodeProperties) {
        const label = row.nodeType.replace(/^:/, "");
        if (!nodePropsMap[label]) nodePropsMap[label] = [];
        nodePropsMap[label].push({
          name: row.propertyName,
          type: Array.isArray(row.propertyTypes)
            ? (row.propertyTypes[0] ?? "String")
            : String(row.propertyTypes),
        });
      }

      const relPropsMap: Record<string, PropertyDef[]> = {};
      for (const row of relProperties) {
        const relType = row.relType.replace(/^:/, "");
        if (!relPropsMap[relType]) relPropsMap[relType] = [];
        relPropsMap[relType].push({
          name: row.propertyName,
          type: Array.isArray(row.propertyTypes)
            ? (row.propertyTypes[0] ?? "String")
            : String(row.propertyTypes),
        });
      }

      const relationshipPatterns = await this._relationshipPatterns(
        openSession,
        relationshipTypes.map((r) => r.relationshipType),
      );

      return {
        type: "neo4j",
        labels: labels.map((r) => r.label),
        relationshipTypes: relationshipTypes.map((r) => r.relationshipType),
        nodeProperties: nodePropsMap,
        relProperties: relPropsMap,
        relationshipPatterns,
      };
    } finally {
      await driver.close();
    }
  }

  /**
   * The label pairs each relationship type joins, read from up to
   * PATTERN_SAMPLE of its relationships (#2508). A node with several labels
   * yields a pair per label.
   *
   * ponytail: a sample finds only pairs that exist, but can miss a pattern
   * that is very rare within a type. db.schema.visualization() is instant but
   * invents pairs on multi-label nodes; raise the sample if a rare pair matters.
   */
  private async _relationshipPatterns(
    openSession: () => ReturnType<ReturnType<typeof neo4j.driver>["session"]>,
    types: string[],
  ): Promise<RelationshipPattern[]> {
    // Samples run PATTERN_CONCURRENCY at a time; a failed sample gives that
    // type no pattern instead of failing the whole schema (#2508).
    const perType: RelationshipPattern[][] = new Array(types.length);
    let next = 0;
    const worker = async () => {
      while (next < types.length) {
        const i = next++;
        perType[i] = await this._typePatterns(openSession, types[i]).catch(
          () => [],
        );
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(PATTERN_CONCURRENCY, types.length) },
        worker,
      ),
    );
    return perType.flat();
  }

  private async _typePatterns(
    openSession: () => ReturnType<ReturnType<typeof neo4j.driver>["session"]>,
    type: string,
  ): Promise<RelationshipPattern[]> {
    // The name comes from db.relationshipTypes(), the database's own
    // catalog, not from user input; it is quoted as an identifier (backticks
    // doubled). A dynamic type, [r:$($t)], was measured on 5.26 and loses the
    // relationship-type index (all-relationships scan plus filter).
    const ident = "`" + type.replaceAll("`", "``") + "`";
    const rows = await this._runQuery<{ from: string[]; to: string[] }>(
      openSession,
      `MATCH ()-[r:${ident}]->() WITH r LIMIT ${PATTERN_SAMPLE} ` +
        "RETURN DISTINCT labels(startNode(r)) AS from, labels(endNode(r)) AS to",
    );
    const patterns: RelationshipPattern[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      for (const from of row.from) {
        for (const to of row.to) {
          if (seen.has(`${from}\u0000${to}`)) continue;
          seen.add(`${from}\u0000${to}`);
          patterns.push({ type, from, to });
        }
      }
    }
    return patterns;
  }

  private async _runQuery<T>(
    openSession: () => ReturnType<ReturnType<typeof neo4j.driver>["session"]>,
    query: string,
  ): Promise<T[]> {
    const session = openSession();
    try {
      // Server-enforced transaction timeout; these ran unbounded (#1302).
      const result = await session.run(
        query,
        {},
        { timeout: DEFAULT_CONNECTION_CONFIG.timeout },
      );
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
