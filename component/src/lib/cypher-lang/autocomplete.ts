/**
 * Vendored from @neo4j-cypher/react-codemirror (Apache-2.0)
 * https://github.com/neo4j/cypher-language-support
 */
import {
  type Completion,
  type CompletionSource,
  snippet,
} from "@codemirror/autocomplete";
import {
  autocomplete,
  shouldAutoCompleteYield,
} from "@neo4j-cypher/language-support";
import {
  CompletionItemKind,
  CompletionItemTag,
} from "vscode-languageserver-types";
import type { CypherConfig } from "./cypher";
import { getDocString } from "./utils";

/** CM6 completion icon type strings. */
type CompletionIcon =
  | "Text" | "Method" | "Function" | "Constructor" | "Field"
  | "Variable" | "Class" | "Interface" | "Module" | "Property"
  | "Unit" | "Value" | "Enum" | "Keyword" | "Snippet"
  | "Color" | "File" | "Reference" | "Folder" | "EnumMember"
  | "Constant" | "Struct" | "Console" | "Operator" | "TypeParameter";

const completionKindToIcon: Record<CompletionItemKind, CompletionIcon> = {
  [CompletionItemKind.Text]: "Text",
  [CompletionItemKind.Method]: "Method",
  [CompletionItemKind.Function]: "Function",
  [CompletionItemKind.Constructor]: "Constructor",
  [CompletionItemKind.Field]: "Field",
  [CompletionItemKind.Variable]: "Variable",
  [CompletionItemKind.Class]: "Class",
  [CompletionItemKind.Interface]: "Interface",
  [CompletionItemKind.Module]: "Module",
  [CompletionItemKind.Property]: "Property",
  [CompletionItemKind.Unit]: "Unit",
  [CompletionItemKind.Value]: "Value",
  [CompletionItemKind.Enum]: "Enum",
  [CompletionItemKind.Keyword]: "Keyword",
  [CompletionItemKind.Snippet]: "Snippet",
  [CompletionItemKind.Color]: "Color",
  [CompletionItemKind.File]: "File",
  [CompletionItemKind.Reference]: "Reference",
  [CompletionItemKind.Folder]: "Folder",
  [CompletionItemKind.EnumMember]: "EnumMember",
  [CompletionItemKind.Constant]: "Constant",
  [CompletionItemKind.Struct]: "Struct",
  [CompletionItemKind.Event]: "Console",
  [CompletionItemKind.Operator]: "Operator",
  [CompletionItemKind.TypeParameter]: "TypeParameter",
};

export const completionStyles: (
  completion: Completion & { deprecated?: boolean },
) => string = (completion) => {
  if (completion.deprecated) {
    return "cm-deprecated-element";
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CM6 expects null for no class
  return null as any;
};

export const cypherAutocomplete: (config: CypherConfig) => CompletionSource =
  (config) => (context) => {
    const documentText = context.state.doc.toString();
    const offset = context.pos;
    const triggerCharacters = [".", ":", "{", "$", ")", "]", "-", "<"];
    const lastCharacter = documentText.at(offset - 1);
    const yieldTriggered = shouldAutoCompleteYield(documentText, offset);
    const lastWord = context.matchBefore(/\w*/);
    const inWord = lastWord!.from !== lastWord!.to;
    const shouldTriggerCompletion =
      inWord ||
      context.explicit ||
      triggerCharacters.includes(lastCharacter ?? "") ||
      yieldTriggered;

    if (!shouldTriggerCompletion) {
      return null;
    }

    const options = autocomplete(
      documentText,
      config.schema ?? {},
      offset,
      context.explicit,
    );

    return {
      from: context.matchBefore(/(\w)*$/)!.from,
      options: options.map((o) => {
        let maybeInfo = {};
        let emptyInfo = true;
        const newDiv = document.createElement("div");

        if (o.signature) {
          const header = document.createElement("p");
          header.setAttribute("class", "cm-completionInfo-signature");
          header.textContent = o.signature;
          if (header.textContent.length > 0) {
            emptyInfo = false;
            newDiv.appendChild(header);
          }
        }

        if (o.documentation) {
          const paragraph = document.createElement("p");
          paragraph.textContent = getDocString(o.documentation);
          if (paragraph.textContent.length > 0) {
            emptyInfo = false;
            newDiv.appendChild(paragraph);
          }
        }

        if (!emptyInfo) {
          maybeInfo = { info: () => Promise.resolve(newDiv) };
        }

        const deprecated =
          o.tags?.find((tag) => tag === CompletionItemTag.Deprecated) ?? false;
        const maybeDeprecated = deprecated
          ? { boost: -99, deprecated: true }
          : {};

        return {
          label: o.insertText ? o.insertText : o.label,
          displayLabel: o.label,
          type: o.kind !== undefined ? completionKindToIcon[o.kind] : undefined,
          apply:
            o.kind === CompletionItemKind.Snippet
              ? snippet((o.insertText ?? o.label) + "${}")
              : undefined,
          detail: o.detail,
          ...maybeDeprecated,
          ...maybeInfo,
        };
      }),
    };
  };
