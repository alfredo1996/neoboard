/**
 * Vendored from @neo4j-cypher/react-codemirror (Apache-2.0)
 * https://github.com/neo4j/cypher-language-support
 *
 * Simplified: removed Prism fallback (useLightVersion) since we always
 * use the ANTLR parser. This eliminates the prismjs dependency.
 */
import type { Facet } from "@codemirror/state";
import { type Input, NodeType, Parser, type PartialParse, Tree } from "@lezer/common";
import {
  applySyntaxColouring,
  type ParsedCypherToken,
} from "@neo4j-cypher/language-support";
import {
  type CodemirrorParseTokenType,
  cypherTokenTypeToNode,
  parserAdapterNodeSet,
} from "./constants";
import type { CypherConfig } from "./cypher";

const DEFAULT_NODE_GROUP_SIZE = 4;

export class ParserAdapter extends Parser {
  cypherTokenTypeToNode: Record<CodemirrorParseTokenType, NodeType>;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CM6 facet type is complex
    facet: Facet<any>,
    _config: CypherConfig,
  ) {
    super();
    this.cypherTokenTypeToNode = cypherTokenTypeToNode(facet);
  }

  createParse(input: Input): PartialParse {
    return this.startParse(input);
  }

  startParse(input: string | Input): PartialParse {
    const document =
      typeof input === "string" ? input : input.read(0, input.length);
    const tree = this.buildTree(document);
    return {
      stoppedAt: input.length,
      parsedPos: input.length,
      stopAt: () => undefined,
      advance: () => tree,
    };
  }

  private buildTree(document: string) {
    const tokens = applySyntaxColouring(document);
    if (tokens.length === 0) {
      return this.createEmptyTree(document);
    }
    const buffer = this.createBuffer(tokens);
    this.addTopNode(buffer, document);
    return Tree.build({
      buffer: buffer.flat(),
      nodeSet: parserAdapterNodeSet(this.cypherTokenTypeToNode),
      topID: this.cypherTokenTypeToNode.topNode.id,
    });
  }

  private createBuffer(tokens: ParsedCypherToken[]) {
    return tokens.map((token) => {
      const nodeTypeId = this.cypherTokenTypeToNode[token.tokenType].id;
      const startOffset = token.position.startOffset;
      const endOffset = startOffset + token.length;
      return [nodeTypeId, startOffset, endOffset, DEFAULT_NODE_GROUP_SIZE];
    });
  }

  private createEmptyTree(document: string) {
    return Tree.build({
      buffer: [
        this.cypherTokenTypeToNode.topNode.id,
        0,
        document.length,
        DEFAULT_NODE_GROUP_SIZE,
      ],
      nodeSet: parserAdapterNodeSet(this.cypherTokenTypeToNode),
      topID: this.cypherTokenTypeToNode.topNode.id,
    });
  }

  private addTopNode(buffer: number[][], document: string) {
    buffer.push([
      this.cypherTokenTypeToNode.topNode.id,
      0,
      document.length,
      buffer.length * DEFAULT_NODE_GROUP_SIZE + DEFAULT_NODE_GROUP_SIZE,
    ]);
  }
}
