/**
 * A dashboard "Editor" share grants write access, but a user's global role
 * caps it: a reader can never write, so an Editor share is a silent no-op for
 * them (#1056). The UI annotates this so the grant isn't misleading.
 */
export function isEditorShareNoOp(
  userRole: "admin" | "creator" | "reader",
  shareRole: "viewer" | "editor",
): boolean {
  return shareRole === "editor" && userRole === "reader";
}
