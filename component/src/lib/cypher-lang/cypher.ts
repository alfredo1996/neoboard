/**
 * CM6 Cypher language extension.
 *
 * Vendored and simplified from @neo4j-cypher/react-codemirror (Apache-2.0).
 * Uses @neo4j-cypher/language-support directly for parsing, autocompletion,
 * and signature help — without the React wrapper, workerpool, or prismjs.
 *
 * https://github.com/neo4j/cypher-language-support
 */
import { autocompletion } from "@codemirror/autocomplete";
import {
  defineLanguageFacet,
  Language,
  LanguageSupport,
} from "@codemirror/language";
import type { DbSchema } from "@neo4j-cypher/language-support";
import { completionStyles, cypherAutocomplete } from "./autocomplete";
import { languageDataSources } from "../language-data-sources";
import { ParserAdapter } from "./parser-adapter";
import { signatureHelpTooltip } from "./signature-help";

const facet = defineLanguageFacet({
  commentTokens: { block: { open: "/*", close: "*/" }, line: "//" },
  closeBrackets: { brackets: ["(", "[", "{", "'", '"', "`"] },
});

export type CypherConfig = {
  lint?: boolean;
  showSignatureTooltipBelow?: boolean;
  featureFlags?: { consoleCommands?: boolean };
  schema?: DbSchema;
  useLightVersion?: boolean;
};

export function cypher(config: CypherConfig) {
  const parserAdapter = new ParserAdapter(facet, config);
  const cypherLanguage = new Language(facet, parserAdapter, [], "cypher");

  return new LanguageSupport(cypherLanguage, [
    autocompletion({
      // The second source passes on what the editor adds through language data
      // (parameter suggestions, #2485), which `override` would otherwise drop.
      override: [cypherAutocomplete(config), languageDataSources],
      optionClass: completionStyles,
    }),
    signatureHelpTooltip(config),
    // Linting is intentionally omitted — it requires workerpool which
    // pulls in child_process/worker_threads (Node.js builtins not
    // available in the browser bundle). Pass lint: false to skip.
  ]);
}
