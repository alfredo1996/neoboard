/**
 * Type augmentation for @neo4j-cypher/codemirror.
 *
 * The package ships type declarations at src/codemirror.d.ts but its
 * package.json exports field doesn't include a "types" condition, so
 * TypeScript in bundler resolution mode can't resolve them.
 */
declare module "@neo4j-cypher/codemirror" {
  import type { Extension } from "@codemirror/state";
  import type { EditorView } from "@codemirror/view";

  export interface EditorSupportSchema {
    labels?: string[];
    relationshipTypes?: string[];
    propertyKeys?: string[];
  }

  export type Theme = "light" | "dark" | "auto";

  export interface EditorOptions {
    autocomplete?: boolean;
    autocompleteCloseOnBlur?: boolean;
    autofocus?: boolean;
    bracketMatching?: boolean;
    closeBrackets?: boolean;
    cypherLanguage?: boolean;
    history?: boolean;
    lineNumbers?: boolean;
    lineWrapping?: boolean;
    lint?: boolean;
    placeholder?: string;
    readOnly?: boolean;
    schema?: EditorSupportSchema;
    search?: boolean;
    theme?: Theme;
    value?: string;
    preExtensions?: Extension[];
    postExtensions?: Extension[];
  }

  export interface EditorApi {
    clearHistory(): void;
    destroy(): void;
    focus(): void;
    setAutocomplete(autocomplete?: boolean): void;
    setLint(lint?: boolean): void;
    setPlaceholder(placeholder?: string): void;
    setReadOnly(readOnly?: boolean): void;
    setSchema(schema?: EditorSupportSchema): void;
    setTheme(theme?: Theme): void;
    setValue(value?: string, parseOnSetValue?: boolean): void;
    onValueChanged(
      listener: (value: string, changes: unknown) => void,
    ): () => void;
    offValueChanged(listener: (value: string, changes: unknown) => void): void;
    codemirror: EditorView;
    setPreExtensions(preExtensions?: Extension[]): void;
    setPostExtensions(postExtensions?: Extension[]): void;
  }

  export function createCypherEditor(
    parentDOMElement: Element | DocumentFragment,
    options: EditorOptions,
  ): { editor: EditorApi };
}
