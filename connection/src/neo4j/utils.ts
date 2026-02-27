export { errorHasMessage } from '../generalized/utils';

/**
 * Collects all node labels and node properties in a set of Neo4j records.
 * @param records : a list of Neo4j records.
 * @returns a list of lists, where each inner list is [NodeLabel] + [prop1, prop2, prop3]...
 */
export function extractNodeAndRelPropertiesFromRecords(records: unknown[]): string[][] {
  const fieldsDict: Record<string, string[]> = {};
  records.forEach((record: unknown) => {
    const rec = record as { _fields: unknown[] };
    rec._fields.forEach((field: unknown) => {
      saveNodeAndRelPropertiesToDictionary(field, fieldsDict);
    });
  });
  const fields = Object.keys(fieldsDict).map((label) => {
    return [label].concat(Object.values(fieldsDict[label]));
  });
  return fields.length > 0 ? fields : [];
}

export function saveNodeAndRelPropertiesToDictionary(field: unknown, fieldsDict: Record<string, string[]>): void {
  if (field == undefined) {
    return;
  }
  if (Array.isArray(field)) {
    field.forEach((v) => saveNodeAndRelPropertiesToDictionary(v, fieldsDict));
  } else if (valueIsNode(field)) {
    field.labels.forEach((l: string) => {
      fieldsDict[l] = fieldsDict[l]
        ? [...new Set(fieldsDict[l].concat(Object.keys(field.properties)))]
        : Object.keys(field.properties);
    });
  } else if (valueIsRelationship(field)) {
    const l = field.type;
    fieldsDict[l] = fieldsDict[l]
      ? [...new Set(fieldsDict[l].concat(Object.keys(field.properties)))]
      : Object.keys(field.properties);
  } else if (valueIsPath(field)) {
    field.segments.forEach((segment: { start: unknown; end: unknown }) => {
      saveNodeAndRelPropertiesToDictionary(segment.start, fieldsDict);
      saveNodeAndRelPropertiesToDictionary(segment.end, fieldsDict);
    });
  }
}

/* HELPER FUNCTIONS FOR DETERMINING TYPE OF FIELD RETURNED FROM NEO4J */
export function valueIsNode(value: unknown): value is { labels: string[]; identity: unknown; properties: Record<string, unknown> } {
  return typeof value === 'object' && value !== null && 'labels' in value && 'identity' in value && 'properties' in value;
}

export function valueIsRelationship(value: unknown): value is { type: string; start: unknown; end: unknown; identity: unknown; properties: Record<string, unknown> } {
  return typeof value === 'object' && value !== null && 'type' in value && 'start' in value && 'end' in value && 'identity' in value && 'properties' in value;
}

export function valueIsPath(value: unknown): value is { start: unknown; end: unknown; segments: Array<{ start: unknown; end: unknown }>; length: number } {
  return typeof value === 'object' && value !== null && 'start' in value && 'end' in value && 'segments' in value && 'length' in value;
}
