import type { APIRequestContext } from "@playwright/test";
import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  putPage,
  uid,
} from "./fixtures";

const formWidget = (note: string) => ({
  id: "w-form",
  chartType: "form",
  connectionId: "conn-neo4j-001",
  query: `/* ${note} ${"x".repeat(12_000)} */ CREATE (n:BodyCap {v: $param_v}) RETURN n.v AS v`,
  settings: {
    title: "Form",
    formFields: [
      {
        id: "f1",
        label: "Value",
        parameterName: "v",
        parameterType: "text",
        required: true,
      },
    ],
  },
});

const saveForm = (request: APIRequestContext, id: string, note: string) =>
  putPage(
    request,
    id,
    [formWidget(note)],
    [{ i: "w-form", x: 0, y: 0, w: 12, h: 4 }],
  );

/**
 * A form whose saved query is over 8 KB submits behind a proxy that refuses
 * request bodies over 8 KB: the submit names the saved form and sends the hash
 * of the query text the page shows, not the text (#2486). A page that is stale
 * because an editor changed the query after it loaded is refused.
 */
test("a form with a 12 KB saved query submits while bodies over 8 KB are refused", async ({
  page,
  authPage,
}) => {
  await authPage.login(ALICE.email, ALICE.password);
  const value = `cap-${uid()}`;
  const { id, cleanup } = await createTestDashboard(
    page.request,
    `Form body cap ${uid()}`,
  );
  try {
    await saveForm(page.request, id, "12 KB");

    // What a WAF's body-size rule does: answers 403 before NeoBoard sees it.
    await page.route("**/api/query/write", (route) =>
      (route.request().postData() ?? "").length > 8192
        ? route.fulfill({ status: 403, body: "Forbidden" })
        : route.continue(),
    );

    await page.goto(`/${id}`);
    await page.waitForLoadState("networkidle");
    const input = page.getByRole("textbox", { name: "Value", exact: true });
    await expect(async () => {
      await input.fill(value);
      // eslint-disable-next-line playwright/no-wait-for-timeout
      await page.waitForTimeout(1_000);
      await expect(input).toHaveValue(value);
    }).toPass({ timeout: 10_000 });
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByText("Form submitted successfully", { exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await page.unroute("**/api/query/write");
    await page.request.post("/api/query/write", {
      data: {
        connectionId: "conn-neo4j-001",
        query: "MATCH (n:BodyCap {v: $v}) DELETE n",
        params: { v: value },
      },
    });
    await cleanup();
  }
});

test("a form submitted from a page whose saved query has since changed is refused", async ({
  page,
  authPage,
}) => {
  await authPage.login(ALICE.email, ALICE.password);
  const { id, cleanup } = await createTestDashboard(
    page.request,
    `Form stale page ${uid()}`,
  );
  try {
    await saveForm(page.request, id, "old");
    await page.goto(`/${id}`);
    await page.waitForLoadState("networkidle");
    const input = page.getByRole("textbox", { name: "Value", exact: true });
    await expect(input).toBeVisible({ timeout: 15_000 });

    // An editor changes the query while this page stays open.
    await saveForm(page.request, id, "new");

    const value = `stale-${uid()}`;
    await expect(async () => {
      await input.fill(value);
      // eslint-disable-next-line playwright/no-wait-for-timeout
      await page.waitForTimeout(1_000);
      await expect(input).toHaveValue(value);
    }).toPass({ timeout: 10_000 });
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/query/write") &&
          r.request().method() === "POST",
        { timeout: 15_000 },
      ),
      page.getByRole("button", { name: "Submit", exact: true }).click(),
    ]);

    expect(response.status()).toBe(404);
    await expect(
      page.getByText("Widget not found", { exact: true }),
    ).toBeVisible();
  } finally {
    await cleanup();
  }
});
