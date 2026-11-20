/**
 * The parent key the term contract gives a property: `<kind>:<key>` of the
 * entity it belongs to (see `SchemaTerm.parentKey` in the connector SDK). The
 * server checks a concept's key property by it and the concept dialog picks
 * key properties by it.
 */
export const entityParentKey = (entityKey: string) => `entity:${entityKey}`;

/**
 * A parameter name from a concept's name (Customer to `customer`): lower case,
 * every run of other characters one underscore, none at the ends.
 */
export function slugParameter(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "");
}
