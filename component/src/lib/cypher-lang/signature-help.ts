/**
 * Vendored from @neo4j-cypher/react-codemirror (Apache-2.0)
 * https://github.com/neo4j/cypher-language-support
 */
import { type EditorState, StateField } from "@codemirror/state";
import { showTooltip, type Tooltip } from "@codemirror/view";
import { signatureHelp } from "@neo4j-cypher/language-support";
import { MarkupContent, type SignatureInformation } from "vscode-languageserver-types";
import type { CypherConfig } from "./cypher";

function getDocString(result: string | MarkupContent | undefined): string {
  if (!result) return "";
  if (MarkupContent.is(result)) return result.value;
  return result;
}

function getTriggerCharacter(query: string, caretPosition: number) {
  let i = caretPosition - 1;
  let triggerCharacter = query.at(i);
  while (/\s/.test(triggerCharacter ?? "") && i > 0) {
    i -= 1;
    triggerCharacter = query.at(i);
  }
  return triggerCharacter;
}

const createSignatureHelpElement =
  ({ signature, activeParameter }: { signature: SignatureInformation; activeParameter: number }) =>
  () => {
    const parameters = signature.parameters ?? [];
    const doc = getDocString(signature.documentation);
    const dom = document.createElement("div");
    dom.className = "cm-signature-help-panel";

    const contents = document.createElement("div");
    contents.className = "cm-signature-help-panel-contents";
    dom.appendChild(contents);

    const signatureLabel = document.createElement("div");
    signatureLabel.className = "cm-signature-help-panel-name";
    const methodName = signature.label.slice(0, signature.label.indexOf("("));
    const returnType = signature.label.slice(signature.label.indexOf(")") + 1);
    signatureLabel.appendChild(document.createTextNode(`${methodName}(`));

    let currentParamDescription: string | undefined;

    parameters.forEach((param, index) => {
      if (typeof param.label === "string") {
        const span = document.createElement("span");
        span.appendChild(document.createTextNode(param.label));
        if (index !== parameters.length - 1) {
          span.appendChild(document.createTextNode(", "));
        }
        if (index === activeParameter) {
          span.className = "cm-signature-help-panel-current-argument";
          const paramDoc = param.documentation;
          currentParamDescription = MarkupContent.is(paramDoc) ? paramDoc.value : (paramDoc as string | undefined);
        }
        signatureLabel.appendChild(span);
      }
    });

    signatureLabel.appendChild(document.createTextNode(")"));
    signatureLabel.appendChild(document.createTextNode(returnType));
    contents.appendChild(signatureLabel);

    const separator = document.createElement("div");
    separator.className = "cm-signature-help-panel-separator";
    contents.appendChild(separator);

    if (currentParamDescription !== undefined) {
      const argDescription = document.createElement("div");
      argDescription.className = "cm-signature-help-panel-arg-description";
      argDescription.appendChild(document.createTextNode(currentParamDescription));
      contents.appendChild(argDescription);
    }

    const methodDescription = document.createElement("div");
    methodDescription.className = "cm-signature-help-panel-description";
    methodDescription.appendChild(document.createTextNode(doc));
    contents.appendChild(methodDescription);

    return { dom };
  };

function getSignatureHelpTooltip(state: EditorState, config: CypherConfig): Tooltip[] {
  const schema = config.schema;
  const ranges = state.selection.ranges;
  const range = ranges.at(0);

  if (schema && ranges.length === 1 && range && range.from === range.to) {
    const caretPosition = range.from;
    const query = state.doc.toString();
    const triggerCharacter = getTriggerCharacter(query, caretPosition);

    if (triggerCharacter === "(" || triggerCharacter === ",") {
      const info = signatureHelp(query, schema, caretPosition);
      const activeSignature = info.activeSignature;
      const signatures = info.signatures;
      const activeParameter = info.activeParameter ?? 0;

      if (
        activeSignature !== undefined &&
        activeSignature >= 0 &&
        activeSignature < signatures.length
      ) {
        return [
          {
            pos: caretPosition,
            above: !(config.showSignatureTooltipBelow ?? true),
            arrow: true,
            create: createSignatureHelpElement({
              signature: signatures[activeSignature],
              activeParameter,
            }),
          },
        ];
      }
    }
  }

  return [];
}

export function signatureHelpTooltip(config: CypherConfig) {
  return StateField.define<readonly Tooltip[]>({
    create: (state) => getSignatureHelpTooltip(state, config),
    update(tooltips, tr) {
      if (!tr.docChanged && !tr.selection) return tooltips;
      return getSignatureHelpTooltip(tr.state, config);
    },
    provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
  });
}
