/**
 * One "/" then no "/" or "\" (a browser reads "//" and "/\" as another host),
 * and no control character (browsers strip a tab or newline, so "/\t/host"
 * becomes "//host").
 */
const SAME_ORIGIN_PATH = /^\/(?![/\\])\P{Cc}*$/u;

/**
 * A same-origin path, else "/": a callbackUrl must not leave the app (#2170).
 * The regex alone passes dot segments that resolve to "//host" ("/a/..//h",
 * "/.//h", "/%2e%2e//h"), so the path is resolved the way a browser would and
 * returned normalised.
 */
export const safeCallbackPath = (value: string | undefined): string => {
  if (!value || !SAME_ORIGIN_PATH.test(value)) return "/";
  const url = new URL(value, "http://n");
  if (url.origin !== "http://n" || url.pathname.startsWith("//")) return "/";
  return url.pathname + url.search + url.hash;
};
