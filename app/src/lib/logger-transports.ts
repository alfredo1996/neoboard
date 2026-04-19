import type pino from "pino";

/**
 * Transport config builder for the NeoBoard logger.
 *
 * Pino supports a single file descriptor (sync, default) or a multi-target
 * transport (async, worker-thread based). We keep the default case — stdout
 * JSON — on the sync path because it's the hot path, used in every
 * production deployment, and has zero overhead.
 *
 * As soon as the operator asks for anything beyond stdout JSON (file output,
 * both, or pretty format), we switch to the multi-target transport API.
 *
 * Env vars honoured:
 *   LOG_OUTPUT     — "stdout" | "file" | "both"  (default: "stdout")
 *   LOG_FORMAT     — "json" | "pretty"           (default: "json")
 *   LOG_FILE_PATH  — file destination path       (default: "./logs/neoboard.log")
 *   LOG_MAX_SIZE   — rotation threshold          (default: "50M")
 *   LOG_MAX_FILES  — retained rotated files      (default: 7)
 */

export type LogOutput = "stdout" | "file" | "both";
export type LogFormat = "json" | "pretty";

export interface TransportConfig {
  output: LogOutput;
  format: LogFormat;
  filePath: string;
  maxSize: string;
  maxFiles: number;
}

const DEFAULT_FILE_PATH = "./logs/neoboard.log";
const DEFAULT_MAX_SIZE = "50M";
const DEFAULT_MAX_FILES = 7;

function normaliseOutput(raw: string | undefined): LogOutput {
  const v = raw?.toLowerCase();
  if (v === "file" || v === "both") return v;
  return "stdout";
}

function normaliseFormat(raw: string | undefined): LogFormat {
  return raw?.toLowerCase() === "pretty" ? "pretty" : "json";
}

function normaliseMaxFiles(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_FILES;
}

/** Read the transport config from env vars with defaults applied. */
export function readTransportConfig(): TransportConfig {
  return {
    output: normaliseOutput(process.env.LOG_OUTPUT),
    format: normaliseFormat(process.env.LOG_FORMAT),
    filePath: process.env.LOG_FILE_PATH ?? DEFAULT_FILE_PATH,
    maxSize: process.env.LOG_MAX_SIZE ?? DEFAULT_MAX_SIZE,
    maxFiles: normaliseMaxFiles(process.env.LOG_MAX_FILES),
  };
}

/**
 * Build a pino transport config from the given options. Returns
 * `undefined` for the default stdout-JSON case — the caller should then
 * omit the `transport` field entirely so pino writes synchronously to
 * fd 1.
 *
 * For every other case (file output, both, or pretty format) returns a
 * TransportMultiOptions shape that pino will lift into worker threads.
 */
export function buildTransport(
  config: TransportConfig = readTransportConfig(),
): pino.TransportMultiOptions | undefined {
  const targets: pino.TransportTargetOptions[] = [];

  if (config.output === "stdout" || config.output === "both") {
    if (config.format === "pretty") {
      // pino-pretty is a devDependency — only loaded when LOG_FORMAT=pretty.
      targets.push({
        target: "pino-pretty",
        level: "trace",
        options: {
          colorize: true,
          ignore: "pid,hostname,service,env",
          translateTime: "HH:MM:ss.l",
        },
      });
    } else {
      // Explicit stdout target in the multi-target case. Uses the
      // built-in pino/file target with destination: 1 (stdout fd).
      targets.push({
        target: "pino/file",
        level: "trace",
        options: { destination: 1 },
      });
    }
  }

  if (config.output === "file" || config.output === "both") {
    targets.push({
      target: "pino-roll",
      level: "trace",
      options: {
        file: config.filePath,
        size: config.maxSize,
        mkdir: true,
        limit: { count: config.maxFiles },
      },
    });
  }

  // Default hot path: stdout + JSON → no transport needed, pino writes
  // synchronously to fd 1.
  if (
    config.output === "stdout" &&
    config.format === "json" &&
    targets.length === 1
  ) {
    return undefined;
  }

  if (targets.length === 0) return undefined;
  return { targets };
}
