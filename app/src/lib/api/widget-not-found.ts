/**
 * The one refusal `/api/query` and `/api/query/write` give for a widget they
 * will not run (#1831). The form widget matches it to tell a stale page from
 * any other NOT_FOUND (#1838); keep it client-safe, with no server imports.
 */
export const WIDGET_NOT_FOUND_MESSAGE = "Widget not found";
