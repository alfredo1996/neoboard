/**
 * Type guard that checks whether a given value is an object
 * containing a `message` property of type string.
 *
 * This is typically used to safely handle and inspect thrown errors.
 *
 * @param {unknown} err - The value to check.
 * @returns {boolean} True if the value is an object with a string `message` property.
 */
export function errorHasMessage(err: unknown): err is { message: string } {
  return typeof err === 'object' && err !== null && 'message' in err && typeof (err as any).message === 'string';
}

/**
 * Collects all node labels and node properties in a set of Neo4j records.
 * @param records : a list of Neo4j records.
 * @returns a list of lists, where each inner list is [NodeLabel] + [prop1, prop2, prop3]...
 */
export function extractNodeAndRelPropertiesFromRecords(records: any) {
  const fieldsDict = {};
  records.forEach((record) => {
    record._fields.forEach((field) => {
      saveNodeAndRelPropertiesToDictionary(field, fieldsDict);
    });
  });
  const fields = Object.keys(fieldsDict).map((label) => {
    return [label].concat(Object.values(fieldsDict[label]));
  });
  return fields.length > 0 ? fields : [];
}

export function saveNodeAndRelPropertiesToDictionary(field, fieldsDict) {
  if (field == undefined) {
    return;
  }
  if (valueIsArray(field)) {
    field.forEach((v) => saveNodeAndRelPropertiesToDictionary(v, fieldsDict));
  } else if (valueIsNode(field)) {
    field.labels.forEach((l) => {
      fieldsDict[l] = fieldsDict[l]
        ? [...new Set(fieldsDict[l].concat(Object.keys(field.properties)))]
        : Object.keys(field.properties);
    });
  } else if (valueIsRelationship(field)) {
    let l = field.type;
    fieldsDict[l] = fieldsDict[l]
      ? [...new Set(fieldsDict[l].concat(Object.keys(field.properties)))]
      : Object.keys(field.properties);
  } else if (valueIsPath(field)) {
    field.segments.forEach((segment) => {
      saveNodeAndRelPropertiesToDictionary(segment.start, fieldsDict);
      saveNodeAndRelPropertiesToDictionary(segment.end, fieldsDict);
    });
  }
}

/* HELPER FUNCTIONS FOR DETERMINING TYPE OF FIELD RETURNED FROM NEO4J */
export function valueIsArray(value) {
  return Array.isArray(value);
}

export function valueIsNode(value: any): boolean {
  return !!(value?.labels && value?.identity && value?.properties);
}

export function valueIsRelationship(value: any): boolean {
  return !!(value?.type && value?.start && value?.end && value?.identity && value?.properties);
}

export function valueIsPath(value: any): boolean {
  return !!(value?.start && value?.end && value?.segments && value?.length);
}
