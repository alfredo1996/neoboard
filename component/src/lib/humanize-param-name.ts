/**
 * Turn a parameter key into a label a reader can use (#2213):
 * `gallery_region` -> "Gallery region", `startDate` -> "Start date",
 * `year2` -> "Year 2". Text that already has spaces is the author's own
 * wording, so only its first letter is capitalised.
 */
export function humanizeParamName(name: string): string {
  const words = /\s/.test(name)
    ? name
    : name
        .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
        .replaceAll(/([A-Za-z])(\d)/g, "$1 $2")
        .replaceAll(/(\d)([A-Za-z])/g, "$1 $2")
        .replaceAll(/_+/g, " ")
        .trim()
        .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
