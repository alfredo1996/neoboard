import { spawn } from "../lib/exec.js";
import { paths, getMode } from "../lib/config.js";
import { info } from "../lib/output.js";

export async function runDev(): Promise<void> {
  const mode = getMode();

  if (mode === "docker") {
    info(
      "In Docker mode, the app runs inside the container. Use 'neoboard start' and visit http://localhost:3000.",
    );
    return;
  }

  info("Starting Next.js dev server...");
  const child = spawn("npm", ["run", "dev"], { cwd: paths.appDir });

  // Forward signals for clean shutdown
  const cleanup = () => child.kill();
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await new Promise<void>((resolve) => {
    child.on("close", () => resolve());
  });
}
