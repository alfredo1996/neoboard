/**
 * Vendored from @neo4j-cypher/react-codemirror (Apache-2.0)
 * https://github.com/neo4j/cypher-language-support
 */
import { MarkupContent } from "vscode-languageserver-types";

export function getDocString(result: string | MarkupContent): string {
  if (MarkupContent.is(result)) {
    return result.value;
  } else {
    return result;
  }
}
