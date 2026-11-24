import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";

/**
 * #1879 — package boundaries (CLAUDE.md "Three Packages") are enforced by
 * ESLint's `no-restricted-imports`, so the CI `ESLint` job catches them. The
 * PreToolUse hook only sees agent edits and misses package-name imports.
 */

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const RULE = "no-restricted-imports";
const eslint = new ESLint({ cwd: ROOT });

async function restricted(code, filePath) {
  const [res] = await eslint.lintText(code, {
    filePath: `${ROOT}/${filePath}`,
  });
  return res.messages.filter((m) => m.ruleId === RULE);
}

const COMPONENT = "component/src/charts/probe.tsx";
const CONNECTION = "connection/src/neo4j/probe.ts";
const SDK = "connector-sdk/src/probe.ts";

const FORBIDDEN = [
  [COMPONENT, 'import { x } from "@neoboard/connection";'],
  [COMPONENT, 'import { x } from "@neoboard/connection/neo4j";'],
  [COMPONENT, 'import type { X } from "@neoboard/connection";'],
  [COMPONENT, 'import { x } from "../../../connection/src/index";'],
  [COMPONENT, 'import { x } from "../../../app/src/lib/x";'],
  [COMPONENT, 'import { x } from "@/app/lib/x";'],
  [COMPONENT, 'import { x } from "@/connection/x";'],
  [CONNECTION, 'import React from "react";'],
  [CONNECTION, 'import { x } from "react/jsx-runtime";'],
  [CONNECTION, 'import { x } from "react-dom";'],
  [CONNECTION, 'import { x } from "react-dom/client";'],
  [CONNECTION, 'import type { Y } from "@neoboard/components";'],
  [CONNECTION, 'import { Y } from "@neoboard/components/row-shapes";'],
  [CONNECTION, 'import { x } from "../../../app/src/x";'],
  [CONNECTION, 'import { x } from "../../../component/src/x";'],
  [SDK, 'import React from "react";'],
  [SDK, 'import { x } from "react-dom/client";'],
  [SDK, 'import { x } from "@neoboard/connection";'],
  [SDK, 'import type { x } from "@neoboard/connection/neo4j";'],
  [SDK, 'import { x } from "@neoboard/components";'],
  [SDK, 'import { x } from "../../connection/src/x";'],
  [SDK, 'import { x } from "../../component/src/x";'],
  [SDK, 'import { x } from "../../app/src/x";'],
];

const ALLOWED = [
  [CONNECTION, 'import { x } from "@neoboard/connector-sdk";'],
  [CONNECTION, 'import { x } from "../shared/x";'],
  [COMPONENT, 'import { x } from "@/lib/utils";'],
  [COMPONENT, 'import { x } from "../components/button";'],
  [COMPONENT, 'import React from "react";'],
  [COMPONENT, 'import { x } from "@neoboard/connector-sdk";'],
  [SDK, 'import { x } from "./generalized/row-value";'],
];

describe("package import boundaries (#1879)", () => {
  it.each(FORBIDDEN)("%s forbids %s", async (file, code) => {
    expect(await restricted(code, file)).not.toHaveLength(0);
  });

  it.each(ALLOWED)("%s allows %s", async (file, code) => {
    expect(await restricted(code, file)).toHaveLength(0);
  });

  it.each([
    ["component/src/charts/bar-chart.tsx", "@neoboard/connection"],
    ["connection/src/neo4j/Neo4jRecordParser.ts", "react"],
    ["connector-sdk/src/generalized/row-value.ts", "react"],
  ])("rule is active on real file %s", async (file, source) => {
    // Lint the real file's path with a violation, so a later config block that
    // redefines the rule for overlapping globs cannot drop the boundary.
    expect(await restricted(`import "${source}";`, file)).not.toHaveLength(0);
  });
});
