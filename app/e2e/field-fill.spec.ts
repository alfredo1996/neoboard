import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";

/**
 * #2367: a filter's field reads as a field. Its trigger is painted with
 * `--field`, which is neither the card's fill nor a button's, and its border is
 * `--input`. Created per run and deleted by id.
 */
for (const theme of ["light", "dark"] as const) {
  test(`a parameter select trigger reads as a field in ${theme}`, async ({
    page,
    authPage,
  }) => {
    test.setTimeout(60_000);
    await page.addInitScript(
      (t) => localStorage.setItem("neoboard-theme", t),
      theme,
    );
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `field-fill ${uid()}`,
    );
    try {
      const put = await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2 as const,
            pages: [
              {
                id: "page-1",
                title: "Main",
                widgets: [
                  {
                    id: "p-actor",
                    chartType: "parameter-select",
                    connectionId: "conn-neo4j-001",
                    query: "",
                    settings: {
                      title: "Actor",
                      chartOptions: {
                        parameterType: "select",
                        parameterName: "actor",
                        seedQuery:
                          "MATCH (p:Person) RETURN p.name AS name ORDER BY name LIMIT 5",
                      },
                    },
                  },
                ],
                gridLayout: [{ i: "p-actor", x: 0, y: 0, w: 4, h: 3 }],
              },
            ],
          },
        },
      });
      expect(put.ok()).toBe(true);

      await page.goto(`/${id}`);
      const trigger = page.getByRole("combobox", {
        name: "Actor",
        exact: true,
      });
      await expect(trigger).toBeVisible({ timeout: 15_000 });
      const share = page.getByRole("button", { name: "Share", exact: true });
      await expect(share).toBeVisible();
      await expect(page.locator("html")).toHaveClass(
        theme === "dark" ? /dark/ : /^((?!dark).)*$/,
      );

      const seen = await page.evaluate(
        ([t, s]) => {
          const bg = (e: Element) => getComputedStyle(e).backgroundColor;
          const tokenColour = (
            prop: "background" | "border-color",
            v: string,
          ) => {
            const probe = document.createElement("div");
            if (prop === "border-color") probe.style.border = "1px solid";
            probe.style.setProperty(prop, `hsl(var(${v}))`);
            document.body.append(probe);
            const out =
              prop === "background"
                ? bg(probe)
                : getComputedStyle(probe).borderTopColor;
            probe.remove();
            return out;
          };
          const trig = document.querySelector(`[aria-label="${t}"]`)!;
          const btn = [...document.querySelectorAll("button")].find(
            (b) => b.textContent?.trim() === s,
          )!;
          return {
            trigger: bg(trig),
            card: bg(trig.closest("[data-title-font]")!),
            share: bg(btn),
            field: tokenColour("background", "--field"),
            border: getComputedStyle(trig).borderTopColor,
            input: tokenColour("border-color", "--input"),
          };
        },
        ["Actor", "Share"],
      );
      expect(seen.trigger).toBe(seen.field);
      expect(seen.trigger).not.toBe(seen.share);
      expect(seen.trigger).not.toBe(seen.card);
      expect(seen.border).toBe(seen.input);
    } finally {
      await cleanup();
    }
  });
}
