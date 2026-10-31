import type { Locator, Page } from "@playwright/test";
import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  saveDashboard,
  typeInEditor,
  uid,
  editingCrumb,
} from "./fixtures";

/**
 * #2388 — the widget editor: Data, Style and Behavior in a side nav that never
 * moves, in a dialog of one height, with one scroller, one Run and a query box
 * that wraps. Measurements are exact: the nav and the dialog are where they
 * were, not "about".
 */

const RUN = "Run query (Ctrl+Enter / ⌘+Enter)";

async function openAdd(page: Page) {
  await page
    .getByRole("button", { name: "Add Widget", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Add Widget", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function pickType(page: Page, dialog: Locator, option: string) {
  await dialog
    .getByRole("combobox", { name: "Chart Type", exact: true })
    .click();
  await page.getByRole("option", { name: option }).click();
}

async function pickConnection(page: Page, dialog: Locator) {
  await dialog
    .getByRole("combobox", { name: "Connection", exact: true })
    .click();
  await page.getByRole("option").first().click();
}

const box = async (l: Locator) => (await l.boundingBox())!;

test.describe("Widget editor layout (#2388)", () => {
  let cleanup: (() => Promise<void>) | undefined;
  let dashboardId = "";

  test.beforeEach(async ({ authPage, page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authPage.login(ALICE.email, ALICE.password);
    const made = await createTestDashboard(
      page.request,
      `Editor layout ${uid()}`,
    );
    cleanup = made.cleanup;
    dashboardId = made.id;
    await page.goto(`/${dashboardId}/edit`);
    await expect(editingCrumb(page)).toBeVisible({ timeout: 10_000 });
  });

  test.afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  test("the dialog and the nav keep their box across sections and across bar, table and markdown", async ({
    page,
  }) => {
    const dialog = await openAdd(page);
    const content = dialog;
    const tablist = dialog.getByRole("tablist", {
      name: "Editor sections",
      exact: true,
    });
    const dialogBox = await box(content);
    const first = await box(dialog.getByRole("tab").first());

    for (const name of ["Style", "Behavior", "Data"]) {
      await dialog.getByRole("tab", { name, exact: true }).click();
      expect(await box(content), `dialog on ${name}`).toEqual(dialogBox);
      expect(
        await box(dialog.getByRole("tab").first()),
        `nav on ${name}`,
      ).toEqual(first);
    }
    await expect(tablist.getByRole("tab")).toHaveText([
      "Data",
      "Style",
      "Behavior",
    ]);
    // Positions of the three sections: stacked at a fixed 36px step.
    const tabs = await tablist.getByRole("tab").all();
    const ys = await Promise.all(tabs.map(async (t) => (await box(t)).y));
    await dialog.getByRole("tab", { name: "Behavior", exact: true }).click();
    expect(await Promise.all(tabs.map(async (t) => (await box(t)).y))).toEqual(
      ys,
    );

    await pickType(page, dialog, "Data Table");
    expect(await box(content)).toEqual(dialogBox);
    await pickType(page, dialog, "Markdown");
    expect(await box(content)).toEqual(dialogBox);
    // Markdown has Content and Style: Data and Behavior are empty, so not offered.
    await expect(tablist.getByRole("tab")).toHaveText(["Content", "Style"]);
  });

  test("a jump link brings its group into view, and the pane is the only scroller", async ({
    page,
  }) => {
    const dialog = await openAdd(page);
    await dialog.getByRole("tab", { name: "Style", exact: true }).click();
    const pane = dialog.getByTestId("editor-pane");
    const target = dialog.locator("#group-reference-lines");
    await dialog
      .getByRole("navigation", { name: "Jump to a group", exact: true })
      .getByRole("button", { name: "Reference lines", exact: true })
      .click();
    await expect
      .poll(async () => {
        const [p, t] = [await box(pane), await box(target)];
        return t.y >= p.y - 1 && t.y < p.y + p.height;
      })
      .toBe(true);
    const scrollers = await dialog.evaluate((el) => {
      const scrolls = (n: Element) =>
        n.scrollHeight > n.clientHeight + 1 &&
        /(auto|scroll)/.test(getComputedStyle(n).overflowY);
      return Array.from(el.querySelectorAll("*"))
        .filter(scrolls)
        .map((n) => n.getAttribute("data-testid") ?? n.tagName);
    });
    // The pane, plus the query box when it has a long query; here no query.
    expect(scrollers).toEqual(["editor-pane"]);
  });

  test("Data shows one Run; expanded, the Run moves to the query toolbar", async ({
    page,
  }) => {
    const dialog = await openAdd(page);
    await pickConnection(page, dialog);
    await expect(dialog.getByTitle(RUN)).toHaveCount(1);
    const editorFrame = dialog
      .locator("[data-testid='codemirror-container']")
      .locator("xpath=..");
    await expect(editorFrame.getByTitle(RUN)).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "Run", exact: true }),
    ).toHaveCount(1);

    await dialog
      .getByRole("button", { name: "Expand editor", exact: true })
      .click();
    await expect(dialog.getByTitle(RUN)).toHaveCount(1);
    await expect(editorFrame.getByTitle(RUN)).toHaveCount(1);
    await dialog
      .getByRole("button", { name: "Collapse editor", exact: true })
      .click();
    await expect(editorFrame.getByTitle(RUN)).toHaveCount(0);
    await expect(dialog.getByTitle(RUN)).toHaveCount(1);
  });

  test("a long query wraps with no horizontal scroll", async ({ page }) => {
    const dialog = await openAdd(page);
    await pickConnection(page, dialog);
    const long = `MATCH (m:Movie) WHERE m.title = '${"x".repeat(240)}' RETURN m.title`;
    await typeInEditor(dialog, page, long);
    const scroller = dialog.locator(".cm-scroller").first();
    const { sw, cw } = await scroller.evaluate((el) => ({
      sw: el.scrollWidth,
      cw: el.clientWidth,
    }));
    expect(sw).toBeLessThanOrEqual(cw);
    const pane = dialog.getByTestId("editor-pane");
    expect(await pane.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
  });

  test("a markdown widget's text is edited in Content, saved and read back after a reload", async ({
    page,
  }) => {
    const dialog = await openAdd(page);
    await pickType(page, dialog, "Markdown");
    const text = `# Layout ${uid()}`;
    await dialog.locator("#content").fill(text);
    await dialog
      .getByRole("button", { name: "Add Widget", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await saveDashboard(page);

    await page.reload();
    await expect(editingCrumb(page)).toBeVisible({ timeout: 10_000 });
    const card = page.locator("[data-widget-id]").first();
    await card.hover();
    await card
      .getByRole("button", { name: "Widget actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Edit Widget", exact: true })
      .click();
    const edit = page.getByRole("dialog", { name: "Edit Widget", exact: true });
    await expect(
      edit.getByRole("tab", { name: "Content", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(edit.locator("#content")).toHaveValue(text);
  });

  test("a markdown widget's Large and Center are saved and drawn after a reload (#2392)", async ({
    page,
  }) => {
    const dialog = await openAdd(page);
    await pickType(page, dialog, "Markdown");
    const IMG =
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iNTAiPjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iNTAiIGZpbGw9IiMyNTYzZWIiLz48L3N2Zz4=";
    await dialog
      .locator("#content")
      .fill(
        [
          "# Heading",
          `Body ${uid()}`,
          "- first bullet\n- second bullet",
          "```\ncode line\n```",
          "| Name | Qty |\n| --- | ---: |\n| apple | 3 |",
          `![dot](${IMG})`,
        ].join("\n\n"),
      );
    await dialog.getByRole("tab", { name: "Style", exact: true }).click();
    await dialog.getByRole("radio", { name: "Large", exact: true }).click();
    await dialog.getByRole("radio", { name: "Center", exact: true }).click();
    // The editor's own preview follows the choice before anything is saved.
    await expect(dialog.getByTestId("markdown-widget")).toHaveCSS(
      "text-align",
      "center",
    );
    await dialog
      .getByRole("button", { name: "Add Widget", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await saveDashboard(page);

    await page.reload();
    const md = page.getByTestId("markdown-widget").first();
    await expect(md).toBeVisible({ timeout: 10_000 });
    await expect(md).toHaveCSS("font-size", "18px");
    await expect(md).toHaveCSS("text-align", "center");
    // The rendered elements, not only the wrapper: headings scale, tables and
    // code keep their own alignment, bullets and the image travel with the text.
    await expect(md.locator("h1")).toHaveCSS("font-size", "30.8568px");
    await expect(md.locator("p", { hasText: "Body" })).toHaveCSS(
      "font-size",
      "18px",
    );
    await expect(md.locator("p", { hasText: "Body" })).toHaveCSS(
      "text-align",
      "center",
    );
    await expect(md.locator("pre")).toHaveCSS("text-align", "left");
    await expect(md.locator("td").nth(1)).toHaveCSS("text-align", "right");
    await expect(md.locator("ul")).toHaveCSS("list-style-position", "inside");
    const mdBox = await md.boundingBox();
    const imgBox = await md.locator("img").boundingBox();
    expect(
      Math.abs(mdBox!.x + mdBox!.width / 2 - (imgBox!.x + imgBox!.width / 2)),
    ).toBeLessThan(20);
  });

  test("coming back from Manage Styling Rules lands on Style", async ({
    page,
  }) => {
    const dialog = await openAdd(page);
    await pickType(page, dialog, "Data Table");
    await dialog.getByRole("tab", { name: "Style", exact: true }).click();
    await dialog.getByLabel("Rule-based styling").click();
    await dialog
      .getByRole("button", { name: "Manage Styling Rules", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Styling Rules", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      dialog.getByRole("tab", { name: "Style", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByLabel("Rule-based styling")).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
  });

  test("From Template shows only when adding", async ({ page }) => {
    const dialog = await openAdd(page);
    await expect(
      dialog.getByRole("button", { name: "From Template", exact: true }),
    ).toBeVisible();
    await pickType(page, dialog, "Markdown");
    await dialog
      .getByRole("button", { name: "Add Widget", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();

    const card = page.locator("[data-widget-id]").first();
    await card.hover();
    await card
      .getByRole("button", { name: "Widget actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Edit Widget", exact: true })
      .click();
    const edit = page.getByRole("dialog", { name: "Edit Widget", exact: true });
    await expect(edit).toBeVisible();
    await expect(
      edit.getByRole("button", { name: "From Template", exact: true }),
    ).toHaveCount(0);
  });

  test("at 768x1024 the nav is a rail whose tabs keep their names, with no sideways scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    const dialog = await openAdd(page);
    const tabs = dialog.getByRole("tab");
    await expect(tabs).toHaveCount(3);
    for (const name of ["Data", "Style", "Behavior"]) {
      await expect(
        dialog.getByRole("tab", { name, exact: true }),
      ).toBeVisible();
    }
    expect((await box(dialog.getByRole("tablist"))).width).toBeLessThanOrEqual(
      56,
    );
    await expect(
      dialog.getByRole("navigation", { name: "Jump to a group", exact: true }),
    ).toBeHidden();
    for (const name of ["Data", "Style", "Behavior"]) {
      await dialog.getByRole("tab", { name, exact: true }).click();
      const overflow = await dialog.evaluate((el) => {
        const right = el.getBoundingClientRect().right;
        return Array.from(el.querySelectorAll("*"))
          .filter((n) => n.getBoundingClientRect().right > right + 1)
          .slice(0, 5)
          .map(
            (n) =>
              `${n.tagName}.${String(n.className).slice(0, 60)} ${Math.round(n.getBoundingClientRect().right - right)}`,
          );
      });
      expect(overflow, `elements past the dialog's edge on ${name}`).toEqual(
        [],
      );
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
        `page on ${name}`,
      ).toBe(true);
      const wide = await dialog.getByTestId("editor-pane").evaluate((pane) => {
        const right = pane.getBoundingClientRect().right;
        return Array.from(pane.querySelectorAll("*"))
          .filter((n) => n.getBoundingClientRect().right > right + 1)
          .slice(0, 5)
          .map(
            (n) =>
              `${n.tagName}.${String(n.className).slice(0, 70)} +${Math.round(n.getBoundingClientRect().right - right)}`,
          );
      });
      expect(wide, `elements past the pane's edge on ${name}`).toEqual([]);
    }
  });

  test("Caching is one choice: Off, Timed or Forever", async ({ page }) => {
    const dialog = await openAdd(page);
    await dialog.getByRole("tab", { name: "Behavior", exact: true }).click();
    await expect(dialog.getByLabel("Minutes")).toBeVisible();
    await dialog.getByRole("radio", { name: "Forever", exact: true }).click();
    await expect(dialog.getByTestId("cache-forever-info")).toBeVisible();
    await expect(dialog.getByLabel("Minutes")).toHaveCount(0);
    await dialog.getByRole("radio", { name: "Off", exact: true }).click();
    await expect(dialog.getByTestId("cache-forever-info")).toHaveCount(0);
    await expect(dialog.getByLabel("Minutes")).toHaveCount(0);
  });
});
