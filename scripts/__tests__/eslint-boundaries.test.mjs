import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";

/**
 * #1879 — package boundaries (CLAUDE.md "Three Packages") are enforced by
 * ESLint's `no-restricted-imports`, so the CI `ESLint` job catches them. The
 * PreToolUse hook only sees agent edits and misses package-name imports.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");
const RULES = new Set(["no-restricted-imports", "no-restricted-syntax"]);
const eslint = new ESLint({ cwd: ROOT });

async function restricted(code, filePath) {
  const [res] = await eslint.lintText(code, {
    filePath: `${ROOT}/${filePath}`,
  });
  return res.messages.filter((m) => RULES.has(m.ruleId));
}

const COMPONENT = "component/src/charts/probe.tsx";
const CONNECTION = "connection/src/neo4j/probe.ts";
const SDK = "connector-sdk/src/probe.ts";
const CONNECTION_TSX = "connection/src/probe.tsx";
const SDK_TSX = "connector-sdk/src/probe.tsx";

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
  // bare directory specifiers
  [COMPONENT, 'import { x } from "../../../connection";'],
  [COMPONENT, 'import { x } from "../../../connection/";'],
  [COMPONENT, 'import { x } from "../../../app";'],
  [COMPONENT, 'import { x } from "@/app";'],
  [COMPONENT, 'import { x } from "@/connection";'],
  [CONNECTION, 'import { x } from "../../../component";'],
  [CONNECTION, 'import { x } from "../../../app";'],
  [SDK, 'import { x } from "../../connection";'],
  [SDK, 'import { x } from "../../app";'],
  // dynamic import() and import("x").T type queries
  [COMPONENT, 'export const l = () => import("@neoboard/connection");'],
  [COMPONENT, 'export type T = import("@neoboard/connection").M;'],
  [COMPONENT, 'export const l = () => import("../../../app/src/x");'],
  [COMPONENT, 'export type T = import("@/app/x").M;'],
  [CONNECTION, 'export const l = () => import("react");'],
  [CONNECTION, 'export type T = import("react").FC;'],
  [CONNECTION, 'export const l = () => import("@neoboard/components");'],
  [CONNECTION, 'export type T = import("../../../app/src/x").M;'],
  [SDK, 'export const l = () => import("@neoboard/connection");'],
  [SDK, 'export type T = import("../../component/src/x").M;'],
  // no-substitution template literal sources
  [COMPONENT, 'export const l = () => import(`@neoboard/connection`);'],
  [CONNECTION, 'export const l = () => import(`react`);'],
  [SDK, 'export const l = () => import(`../../app/src/x`);'],
  // .tsx files
  [CONNECTION_TSX, 'import React from "react";'],
  [SDK_TSX, 'import { x } from "@neoboard/connection";'],
];

const ALLOWED = [
  [CONNECTION, 'import { x } from "@neoboard/connector-sdk";'],
  [CONNECTION, 'import { x } from "../shared/x";'],
  [COMPONENT, 'import { x } from "@/lib/utils";'],
  [COMPONENT, 'import { x } from "../components/button";'],
  [COMPONENT, 'import React from "react";'],
  [COMPONENT, 'import { x } from "@neoboard/connector-sdk";'],
  [SDK, 'import { x } from "./generalized/row-value";'],
  [COMPONENT, 'import { x } from "../app-shell";'],
  [COMPONENT, 'import { x } from "./connection-address";'],
  [COMPONENT, 'import { x } from "./dynamic-connection-fields";'],
  [COMPONENT, 'export const l = () => import("./dynamic-connection-fields");'],
  [COMPONENT, 'export const l = () => import(`./dynamic-connection-fields`);'],
  [COMPONENT, 'export type T = import("react").FC;'],
  [CONNECTION, 'export const l = () => import("@neoboard/connector-sdk");'],
];

describe("package import boundaries (#1879)", () => {
  it.each(FORBIDDEN)("%s forbids %s", async (file, code) => {
    expect(await restricted(code, file)).not.toHaveLength(0);
  });

  it.each(ALLOWED)("%s allows %s", async (file, code) => {
    expect(await restricted(code, file)).toHaveLength(0);
  });
});
