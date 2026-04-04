import { existsSync } from "node:fs";
import { run } from "../lib/exec.js";
import {
  paths,
  readProjectConfig,
  writeProjectConfig,
  writeLocalConfig,
} from "../lib/config.js";
import { info, success, createSpinner } from "../lib/output.js";
import { generateEnvFile } from "./env.js";

export async function runInit(opts?: {
  mode?: "docker" | "local";
}): Promise<void> {
  const mode = opts?.mode ?? "docker";

  if (existsSync(paths.projectConfig)) {
    info("neoboard.config.json already exists — skipping config generation.");
  } else {
    const config = readProjectConfig(); // returns defaults
    writeProjectConfig(config);
    success("Created neoboard.config.json");
  }

  writeLocalConfig({ mode });
  success(`Mode set to '${mode}' in .neoboard.local`);

  if (mode === "local") {
    const spinner = createSpinner("Installing dependencies...");
    spinner.start();
    const dirs = [
      paths.root,
      paths.appDir,
      paths.componentDir,
      paths.connectionDir,
    ];
    for (const dir of dirs) {
      run("npm install", { cwd: dir });
    }
    spinner.succeed("Dependencies installed");

    generateEnvFile();
  }

  info("");
  info("Next step: run 'neoboard start' to launch services.");
}
