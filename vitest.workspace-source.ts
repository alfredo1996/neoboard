import { fileURLToPath } from "node:url";

// Tests read the workspace packages from src/ (#1878). Their `exports` point at
// dist/, which `npm ci` does not build, and an edit to src/ would otherwise go
// unseen until a rebuild. Vitest-only: tsconfig `paths` stays untouched because
// Next's webpack honours it and would change what transpilePackages compiles.
// One entry per `exports` subpath; scripts/__tests__/workspace-source-resolution
// fails when a subpath has none. Used by app/vitest.config.ts and the root
// vitest.config.ts (the scripts suite).
const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export const workspaceSourceAliases = [
  {
    find: /^@neoboard\/connection(?![\w/-])/,
    replacement: src("./connection/src/index.ts"),
  },
  {
    find: /^@neoboard\/connector-sdk(?![\w/-])/,
    replacement: src("./connector-sdk/src/index.ts"),
  },
];
