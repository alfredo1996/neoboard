/**
 * Shared E2E test infrastructure.
 *
 * Exported so the enterprise package can import fixtures, page objects,
 * and helpers without duplicating them. Enterprise E2E tests should:
 *
 *   import { test, expect, ALICE, typeInEditor } from "../../app/e2e/shared";
 */
export {
  test,
  expect,
  ALICE,
  BOB,
  CAROL,
  DAVE,
  TEST_NEO4J_BOLT_URL,
  TEST_PG_PORT,
  getPreview,
  typeInEditor,
  createTestDashboard,
} from "../fixtures";
export { AuthPage } from "../pages/auth";
export { SidebarPage } from "../pages/sidebar";

/** Re-export test encryption helpers for enterprise global-setup. */
export {
  TEST_ENCRYPTION_KEY,
  TEST_NEXTAUTH_SECRET,
  TEST_API_KEY_HMAC_SECRET,
} from "../global-setup-constants";
