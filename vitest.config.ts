import { defineConfig } from "vitest/config";
import { workspaceSourceAliases } from "./vitest.workspace-source";

// The scripts suite (`npm run test:scripts`) runs from the repo root (#1878).
export default defineConfig({ resolve: { alias: workspaceSourceAliases } });
