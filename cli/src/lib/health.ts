import { createSpinner } from "./output.js";

export interface HealthCheckOptions {
  check: () => boolean | Promise<boolean>;
  label: string;
  interval?: number;
  timeout?: number;
}

export async function waitForHealth(opts: HealthCheckOptions): Promise<void> {
  const { check, label, interval = 2000, timeout = 120_000 } = opts;
  const spinner = createSpinner(`Waiting for ${label}...`);
  spinner.start();

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) {
      spinner.succeed(`${label} is ready`);
      return;
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  spinner.fail(`${label} did not become ready within ${timeout / 1000}s`);
  throw new Error(`Timeout waiting for ${label}`);
}
