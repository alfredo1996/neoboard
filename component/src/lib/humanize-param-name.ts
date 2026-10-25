/**
 * "Region" -> "Pick region", "KPI filter" -> "Pick KPI filter" (#2232). No
 * article: a/an cannot be told from the spelling ("user", "SKU", "hour"), and a
 * wrong one reads worse than none. Only an ordinary first word (Capital, then
 * lowercase) is lowercased; acronyms, digits and mixed case keep their own.
 */
export function pickPrompt(label: string): string {
  const noun = label.replace(/^\p{Lu}(?=\p{Ll})/u, (c) => c.toLowerCase());
  return `Pick ${noun}`;
}

/**
 * Turn a parameter key into a label a reader can use (#2213):
 * `gallery_region` -> "Gallery region", `startDate` -> "Start date",
 * `HTTPStatus` -> "Http status", `year2` -> "Year 2". Digits stay with the
 * word they sit inside (`n4j_label` -> "N4j label", `q1_2024` -> "Q1 2024")
 * and split off only at the end of the whole key. Text that already has spaces is the author's own
 * wording, so only its first letter is capitalised. A key with no words in it
 * (`___`) comes back unchanged, so a widget never loses its name.
 */
export function humanizeParamName(name: string): string {
  const words = /\s/.test(name)
    ? name
    : name
        // Lookahead, not (\p{Lu}+)(\p{Lu}\p{Ll}): the greedy run backtracks
        // super-linearly on long capital runs (Sonar S8786).
        .replaceAll(/(\p{Lu})(?=\p{Lu}\p{Ll})/gu, "$1 ")
        .replaceAll(/([\p{Ll}\d])(\p{Lu})/gu, "$1 $2")
        .replaceAll(/(\p{L})(\d+)$/gu, "$1 $2")
        .replaceAll(/_+/g, " ")
        .trim()
        .toLowerCase();
  if (!words) return name;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
