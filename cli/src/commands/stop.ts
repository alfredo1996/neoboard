import { composeDown } from "../lib/docker.js";
import { success } from "../lib/output.js";

export async function runStop(opts?: { volumes?: boolean }): Promise<void> {
  composeDown({ volumes: opts?.volumes });
  success("NeoBoard services stopped");
}
