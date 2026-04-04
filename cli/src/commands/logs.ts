import { spawn } from "../lib/exec.js";
import { composeFile } from "../lib/docker.js";
import { paths } from "../lib/config.js";
import { error as logError } from "../lib/output.js";

const SERVICE_MAP: Record<string, string> = {
  postgres: "postgres",
  pg: "postgres",
  neo4j: "neo4j",
  app: "app",
};

export async function runLogs(opts: {
  service?: string;
  follow?: boolean;
  lines?: string;
}): Promise<void> {
  const args = ["compose", "-f", composeFile(), "logs"];

  if (opts.lines) args.push("--tail", opts.lines);
  if (opts.follow) args.push("-f");

  if (opts.service) {
    const mapped = SERVICE_MAP[opts.service];
    if (!mapped) {
      logError(
        `Unknown service "${opts.service}". Available: ${Object.keys(SERVICE_MAP).join(", ")}`,
      );
      process.exitCode = 1;
      return;
    }
    args.push(mapped);
  }

  const child = spawn("docker", args, { cwd: paths.root });
  const cleanup = () => child.kill();
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await new Promise<void>((resolve) => {
    child.on("close", () => resolve());
  });
}
