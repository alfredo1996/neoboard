import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  putPage,
  uid,
} from "./fixtures";

/**
 * A form whose saved query is over 8 KB submits behind a proxy that refuses
 * request bodies over 8 KB: the submit names the saved form and sends no query
 * text (#2486).
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
    const padding = "x".repeat(12_000);
    await putPage(
      page.request,
      id,
      [
        {
          id: "w-form",
          chartType: "form",
          connectionId: "conn-neo4j-001",
          query: `/* ${padding} */ CREATE (n:BodyCap {v: $param_v}) RETURN n.v AS v`,
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
        },
      ],
      [{ i: "w-form", x: 0, y: 0, w: 12, h: 4 }],
    );

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
