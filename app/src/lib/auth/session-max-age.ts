/**
 * Session length in seconds from SESSION_MAX_AGE; 8 h when unset or not a
 * number. One reader for the auth config and Settings -> System, so the page
 * shows what sign-in uses. No imports: the settings route stays light.
 */
export function readSessionMaxAge(): {
  seconds: number;
  source: "env" | "default";
} {
  const seconds = Number.parseInt(process.env.SESSION_MAX_AGE ?? "", 10);
  return Number.isFinite(seconds) && seconds > 0
    ? { seconds, source: "env" }
    : { seconds: 28800, source: "default" };
}
