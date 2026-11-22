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
// Each exact property procedure scans the whole store. Past this budget the
// properties come from SAMPLE_SIZE entities per label or type instead (#2532).
const PROCEDURE_TIMEOUT_MS = 5000;
const SAMPLE_SIZE = 1000;

/** Neo4j's TransactionTimedOut family, whichever side raised it. */
function isTimeout(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.includes("TransactionTimedOut");
}

// valueType() names, as the procedures spell them in propertyTypes.
const VALUE_TYPES: Record<string, string> = {
  STRING: "String",
  INTEGER: "Long",
  FLOAT: "Double",
  BOOLEAN: "Boolean",
  DATE: "Date",
  "ZONED DATETIME": "DateTime",
  "LOCAL DATETIME": "LocalDateTime",
  "ZONED TIME": "Time",
  "LOCAL TIME": "LocalTime",
  DURATION: "Duration",
  POINT: "Point",
};

/**
 * `valueType()` ("LIST<STRING NOT NULL> NOT NULL") in the procedures'
 * vocabulary ("StringArray"); "" where it has no name for it.
 */
export function procedureType(valueType: unknown): string {
  if (typeof valueType !== "string") return "";
  const t = valueType.replace(/ NOT NULL$/, "");
  const list = /^LIST<(.*)>$/.exec(t);
  if (list) {
    // An empty list is LIST<NOTHING>; the exact path calls it StringArray.
    const inner = list[1] === "NOTHING" ? "String" : procedureType(list[1]);
    return inner ? `${inner}Array` : "";
  }
  return VALUE_TYPES[t] ?? "";
}

/**
 * A name from the database's own catalog, quoted as an identifier (backticks
 * doubled); null for one with a backslash, which is refused: Neo4j reads
 * \u0060 inside a quoted identifier as a backtick, which would end the quote
 * (measured on 5.26). Callers put it in the text with a template literal,
 * never String.replace, whose replacement string expands `$`` and `$&`.
 */
function quoteIdent(name: string): string | null {
  if (name.includes("\\")) return null;
  return "`" + name.replaceAll("`", "``") + "`";
}

/** Runs fn over items, `limit` at a time, results in item order. */
async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  // Each worker chains to the next free item when its call settles.
  const worker = (): Promise<void> => {
    if (next >= items.length) return Promise.resolve();
    const i = next++;
    return fn(items[i]).then((r) => {
      out[i] = r;
      return worker();
    });
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return out;
}

/**
 * The names in a type as `db.schema.*TypeProperties()` quotes it: ":`Movie`",
 * or ":`Person`:`Actor`" for a node with two labels (#2415). Plain ":Movie"
 * still reads as "Movie".
 */
function namesOf(quoted: string): string[] {
  const names = [...quoted.matchAll(/`((?:[^`]|``)+)`/g)].map((m) =>
    m[1].replaceAll("``", "`"),
  );
  return names.length > 0 ? names : [quoted.replace(/^:/, "")];
}

type SessionOpener = () => ReturnType<
  ReturnType<typeof neo4j.driver>["session"]
>;

/** A row of a property procedure, or of a sample in the same shape. */
interface PropertyRow {
  type: string;
  propertyName: string;
  propertyTypes: string[];
}

/** Adds the property to each name, once. */
function addProperty(
  into: Record<string, PropertyDef[]>,
  names: string[],
  row: { propertyName: string; propertyTypes: string[] },
): void {
  // A type with no properties comes back as one row with a null name.
  if (row.propertyName == null) return;
  const type = Array.isArray(row.propertyTypes)
    ? (row.propertyTypes[0] ?? "String")
    : String(row.propertyTypes);
  for (const name of names) {
    const list = (into[name] ??= []);
    if (!list.some((p) => p.name === row.propertyName)) {
      list.push({ name: row.propertyName, type });
    }
  }
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
  private readonly procedureTimeoutMs: number;

  /** `procedureTimeoutMs`: the budget of each exact property procedure; tests lower it. */
  constructor(options: { procedureTimeoutMs?: number } = {}) {
    this.procedureTimeoutMs =
      options.procedureTimeoutMs ?? PROCEDURE_TIMEOUT_MS;
  }

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
          this._propertyRows(
            openSession,
            "nodeType",
            "CALL db.schema.nodeTypeProperties() YIELD nodeType, propertyName, propertyTypes",
          ),
          this._propertyRows(
            openSession,
            "relType",
            "CALL db.schema.relTypeProperties() YIELD relType, propertyName, propertyTypes",
          ),
        ]);

      // No prototype: a label named `constructor` is a name, not Object's.
      const nodePropsMap: Record<string, PropertyDef[]> = Object.create(null);
      for (const row of nodeProperties ??
        (await this._sampleProperties(
          openSession,
          labels.map((r) => r.label),
          (ident) => `(n:${ident})`,
        ))) {
        addProperty(nodePropsMap, namesOf(row.type), row);
      }

      const relPropsMap: Record<string, PropertyDef[]> = Object.create(null);
      for (const row of relProperties ??
        (await this._sampleProperties(
          openSession,
          relationshipTypes.map((r) => r.relationshipType),
          (ident) => `()-[n:${ident}]->()`,
        ))) {
        addProperty(relPropsMap, namesOf(row.type), row);
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
    openSession: SessionOpener,
    types: string[],
  ): Promise<RelationshipPattern[]> {
    // A failed sample gives that type no pattern instead of failing the whole
    // schema (#2508).
    const perType = await mapConcurrent(types, PATTERN_CONCURRENCY, (type) =>
      this._typePatterns(openSession, type).catch(
        (): RelationshipPattern[] => [],
      ),
    );
    return perType.flat();
  }

  /**
   * One exact property procedure under its own budget. null when it timed out,
   * so the caller samples; any other error fails the read, as before.
   */
  private async _propertyRows(
    openSession: SessionOpener,
    typeColumn: string,
    query: string,
  ): Promise<PropertyRow[] | null> {
    try {
      const rows = await this._withDeadline(
        this._runQuery<Record<string, unknown>>(
          openSession,
          query,
          this.procedureTimeoutMs,
        ),
      );
      if (rows === null) return null;
      // Cypher 25 servers spell types "INTEGER NOT NULL"; 5.x says "Long". One
      // vocabulary, the 5.x one, so a Refresh that switches path keeps the type.
      return rows.map((r) => ({
        type: r[typeColumn] as string,
        propertyName: r.propertyName as string,
        propertyTypes: Array.isArray(r.propertyTypes)
          ? (r.propertyTypes as string[]).map((t) => procedureType(t) || t)
          : (r.propertyTypes as string[]),
      }));
    } catch (error) {
      if (isTimeout(error)) return null;
      throw error;
    }
  }

  /**
   * The result, or null once the budget has passed. Neo4j 5.x does not
   * interrupt db.schema.*TypeProperties() on the server timeout until the scan
   * ends (16M nodes: 100 ms budget, failed at 4.3 s), so the client stops
   * waiting; the server timeout stays as the backstop where it does abort.
   * The abandoned query's late result or error is dropped; its session is
   * closed by _runQuery, or at the latest by driver.close().
   */
  private async _withDeadline<T>(work: Promise<T>): Promise<T | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), this.procedureTimeoutMs);
    });
    work.catch(() => undefined);
    try {
      return await Promise.race([work, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Properties from up to SAMPLE_SIZE entities per name, in the procedures'
   * row shape and type vocabulary. A failed sample leaves that name without
   * properties. Names come from the database's own catalog, quoted as
   * identifiers exactly as _typePatterns does (see there for the backslash).
   */
  private async _sampleProperties(
    openSession: SessionOpener,
    names: string[],
    pattern: (ident: string) => string,
  ): Promise<PropertyRow[]> {
    const perName = await mapConcurrent(names, PATTERN_CONCURRENCY, (name) =>
      this._sampleOne(openSession, name, pattern).catch(
        (): PropertyRow[] => [],
      ),
    );
    return perName.flat();
  }

  private async _sampleOne(
    openSession: SessionOpener,
    name: string,
    pattern: (ident: string) => string,
  ): Promise<PropertyRow[]> {
    // Not a parameter: a dynamic label, (n:$($l)), is Neo4j 5.26+ only and was
    // measured on 5.26 as AllNodesScan plus a filter, losing the label scan.
    // The name is the catalog's own, quoted as in _typePatterns.
    const ident = quoteIdent(name);
    if (ident === null) return [];
    const head =
      `MATCH ${pattern(ident)} WITH n LIMIT ${SAMPLE_SIZE} ` +
      "UNWIND keys(n) AS k ";
    // A name is quoted in the procedures' own form, so namesOf reads it back.
    const type = ":" + ident;
    let rows: Array<{ propertyName: string; propertyTypes: unknown[] }>;
    try {
      rows = await this._runQuery(
        openSession,
        head +
          "RETURN k AS propertyName, collect(DISTINCT valueType(n[k])) AS propertyTypes",
      );
    } catch (error) {
      // valueType() is Neo4j 5.13+: without it the names stay, the types are
      // unset. Any other error is not that, and fails this name.
      if (
        !/valueType|unknown function/i.test(String((error as Error)?.message))
      )
        throw error;
      rows = await this._runQuery(
        openSession,
        head + "RETURN DISTINCT k AS propertyName",
      );
    }
    // One type, as addProperty keeps one on the exact path; the first by name,
    // since collect(DISTINCT) has no order.
    return rows.map((r) => ({
      type,
      propertyName: r.propertyName,
      propertyTypes: [
        (r.propertyTypes ?? [])
          .map(procedureType)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))[0] ?? "",
      ],
    }));
  }

  private async _typePatterns(
    openSession: SessionOpener,
    type: string,
  ): Promise<RelationshipPattern[]> {
    // The name comes from db.relationshipTypes(), the database's own
    // catalog, not from user input; it is quoted as an identifier (backticks
    // doubled). A dynamic type, [r:$($t)], was measured on 5.26 and loses the
    // relationship-type index (all-relationships scan plus filter); none of
    // [r:$($t)], [r:$any($t)], type(r) = $t or type(r) IN [$t] keeps it on
    // 5.26 or 2025.06, so the type has to be in the text.
    // ponytail: such a type gets no pattern; upgrade to a parameterized form
    // once Neo4j keeps the type index for a dynamic type.
    const ident = quoteIdent(type);
    if (ident === null) return [];
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
    openSession: SessionOpener,
    query: string,
    timeout: number = DEFAULT_CONNECTION_CONFIG.timeout,
  ): Promise<T[]> {
    const session = openSession();
    try {
      // Server-enforced transaction timeout; these ran unbounded (#1302).
      const result = await session.run(query, {}, { timeout });
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
