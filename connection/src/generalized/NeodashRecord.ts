export class NeodashRecord {
  private record: { [key: string | symbol]: any };

  constructor(record: Record<string, any>) {
    /**
     * @type {Object<string, any>}
     * private
     */
    this.record = record;
    //eslint -disable-next-line @typescript-eslint/no-unsafe-return
    // The return is required for the proxy to work correctly
    return this.__createProxy__(); // NOSONAR
  }

  /**
   * Returns the underlying record as a plain JavaScript object.
   */
  toObject(): Record<string, any> {
    return { ...this.record };
  }

  /**
   * Extracts field metadata from the current record.
   *
   * - If `useNodePropsAsFields` is `false` (default), returns a flat list of top-level keys.
   * - If `true`, extracts structured fields from Neo4j nodes, grouped by label.
   *
   * Each entry in the result corresponds to a field group:
   * - For nodes: [label, ...propertyKeys]
   * - For other types (e.g., primitives): just the key names
   *
   * Useful for dynamic field selection (e.g., dropdown filters),
   * especially when visualizing graph structures.
   *
   * @param useNodePropsAsFields Whether to extract node properties grouped by label. Defaults to `false`.
   * @returns A flat list of keys or a nested list of `[label, ...props]` per node type.
   */
  getFields(useNodePropsAsFields: boolean = false): string[] | string[][] {
    const keys = Object.keys(this.record);

    // Return top-level keys if not extracting node properties.
    if (!useNodePropsAsFields) {
      return keys;
    }

    // Dictionary to collect properties grouped by node label.
    const fieldsDict: Record<string, Set<string>> = {};

    // Extract properties from a Neo4j node and group them by label.
    const handleNode = (node: any) => {
      if (node?.labels && node?.properties) {
        node.labels.forEach((label: string) => {
          if (!fieldsDict[label]) fieldsDict[label] = new Set();
          Object.keys(node.properties).forEach((prop) => fieldsDict[label].add(prop));
        });
      }
    };

    // Recursively traverse nested values: arrays, paths, nodes.
    const traverse = (val: any) => {
      if (!val) return;

      if (Array.isArray(val)) {
        val.forEach(traverse);
      } else if (val?.segments && Array.isArray(val.segments)) {
        val.segments.forEach((segment: any) => {
          traverse(segment.start);
          traverse(segment.end);
        });
      } else {
        handleNode(val);
      }
    };

    // Traverse all values in the record.
    Object.values(this.record).forEach(traverse);

    // Return a list of fields per label: [label, prop1, prop2, ...]
    return Object.entries(fieldsDict).map(([label, props]) => [label, ...Array.from(props)]);
  }

  /**
   * Creates a proxy to intercept property access and assignment.
   * This enables syntax like `record.propertyName` and `record["propertyName"]` instead of `record.get('propertyName')`.
   */
  __createProxy__() {
    return new Proxy(this, {
      get(target, prop) {
        // Intercept method access
        if (prop === 'toObject' || prop === 'toJSON') return target.toObject.bind(target);
        if (prop === 'getFields') return target.getFields.bind(target);
        // Intercept property access
        if (prop in target.record) {
          return target.record[prop];
        }
        return undefined; // or handle "property not found" logic
      },
      set(target, prop, value) {
        // Intercept property assignment
        target.record[prop] = value;
        return true;
      },
    });
  }
}
