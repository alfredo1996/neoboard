/**
 * The product's name and pitch, in one place (#1905, epic #1893).
 *
 * NeoBoard is one dashboard where any number of systems collaborate. The
 * pitch therefore names none of them: the connectors that ship today are the
 * first ones, not the product, and a sentence that lists them has to be
 * rewritten every time one is added — which it never was.
 *
 * Every user-facing surface that states what NeoBoard is reads from here:
 * the page title and the OpenGraph and Twitter cards in `app/layout.tsx`,
 * the login and signup headers, the onboarding panel, and the OpenAPI
 * description.
 */

export const PRODUCT_NAME = "NeoBoard";

/** What the product does, in one line. Shown on its own on login and signup. */
export const PRODUCT_PITCH = "Make your systems talk, on one dashboard";

/** The pitch with the name in front, for a page title or a social card. */
export const PRODUCT_DESCRIPTION = `${PRODUCT_NAME} — ${PRODUCT_PITCH}`;

/**
 * The onboarding invitation. Deliberately says "a database" rather than
 * listing any: which ones are available is a fact about the installed
 * connectors, and the Add Connection dialog already reads it off the registry.
 */
export const PRODUCT_ONBOARDING_PITCH =
  "Build dashboards on the systems you already run. Get started in three simple steps.";

/** The same invitation, on the "Add a connection" card. */
export const PRODUCT_CONNECTION_PITCH =
  "Connect a database so NeoBoard can query your data.";
