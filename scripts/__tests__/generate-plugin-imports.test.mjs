import { describeInstalledCheck, PLUGIN_CODEGEN } from "./codegen-harness.mjs";

// #2087 — the chart plugin codegen checked installation with CommonJS, the
// check #2064 replaced in the connector codegen. validateEntry, renderSource
// and runGenerator are covered in generate-plugin-imports.node-test.mjs.
describeInstalledCheck(PLUGIN_CODEGEN);
