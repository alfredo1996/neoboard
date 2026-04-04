import ora from "ora";
import chalk from "chalk";

export function createSpinner(text: string) {
  return ora(text);
}

export function info(msg: string): void {
  console.log(chalk.blue(msg));
}

export function warn(msg: string): void {
  console.log(chalk.yellow(`WARN: ${msg}`));
}

export function error(msg: string): void {
  console.log(chalk.red(`ERROR: ${msg}`));
}

export function success(msg: string): void {
  console.log(chalk.green(`\u2714 ${msg}`));
}

export function banner(lines: string[]): void {
  const maxLen = Math.max(...lines.map((l) => l.length));
  const top = "\u2554" + "\u2550".repeat(maxLen + 2) + "\u2557";
  const bottom = "\u255A" + "\u2550".repeat(maxLen + 2) + "\u255D";

  console.log(top);
  for (const line of lines) {
    console.log("\u2551 " + line.padEnd(maxLen) + " \u2551");
  }
  console.log(bottom);
}
