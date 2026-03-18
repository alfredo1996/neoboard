/**
 * Type declarations for the direct import path to the cypher() language
 * extension from @neo4j-cypher/react-codemirror.
 *
 * We import from this specific subpath instead of the barrel export to avoid
 * pulling in CypherEditor -> syntaxValidation -> workerpool -> child_process,
 * which breaks webpack/Next.js builds (no Node.js builtins in browser).
 */
declare module "@neo4j-cypher/react-codemirror/dist/src/lang-cypher/langCypher" {
  import type { LanguageSupport } from "@codemirror/language";

  export interface CypherConfig {
    lint?: boolean;
    showSignatureTooltipBelow?: boolean;
    featureFlags?: {
      consoleCommands?: boolean;
    };
    schema?: {
      labels?: string[];
      relationshipTypes?: string[];
      propertyKeys?: string[];
      databaseNames?: string[];
      aliasNames?: string[];
      parameters?: Record<string, unknown>;
    };
    useLightVersion: boolean;
    setUseLightVersion?: (useLightVersion: boolean) => void;
  }

  export function cypher(config: CypherConfig): LanguageSupport;
}
