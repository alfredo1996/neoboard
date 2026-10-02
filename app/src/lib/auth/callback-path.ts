/**
 * One "/" then no "/" or "\" (a browser reads "//" and "/\" as another host),
 * and no control character (browsers strip a tab or newline, so "/\t/host"
 * becomes "//host").
 */
const SAME_ORIGIN_PATH = /^\/(?![/\\])\P{Cc}*$/u;

/** A same-origin path, else "/": a callbackUrl must not leave the app (#2170). */
export const safeCallbackPath = (value: string | undefined): string =>
  value && SAME_ORIGIN_PATH.test(value) ? value : "/";
