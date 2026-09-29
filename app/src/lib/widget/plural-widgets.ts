/** "1 widget", "3 widgets". */
export function pluralWidgets(count: number): string {
  return count === 1 ? "1 widget" : `${count} widgets`;
}
