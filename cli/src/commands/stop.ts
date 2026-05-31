import { composeDown } from "../lib/docker.js";
import { success, error as logError } from "../lib/output.js";

export async function runStop(opts?: { volumes?: boolean }): Promise<void> {
  try {
    composeDown({ volumes: opts?.volumes });
    success("NeoBoard services stopped");
  } catch {
    logError(
      "Failed to stop services. Is Docker running? Try: docker compose down",
    );
    process.exitCode = 1;
  }
}
