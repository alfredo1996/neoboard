/**
 * On-screen narration overlay — injects a semi-transparent banner at
 * the top of the viewport with the current step description.
 *
 * The banner is positioned fixed so it stays visible during scrolls.
 * Call `clearNarration(page)` to remove it.
 */

const BANNER_ID = "__neoboard_narration__";

export async function narrate(page, text) {
  await page.evaluate(
    ({ id, msg }) => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        Object.assign(el.style, {
          position: "fixed",
          top: "0",
          left: "0",
          right: "0",
          zIndex: "99999",
          padding: "10px 20px",
          background: "rgba(15, 23, 42, 0.88)",
          color: "#f8fafc",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          fontSize: "15px",
          fontWeight: "500",
          letterSpacing: "0.01em",
          textAlign: "center",
          backdropFilter: "blur(6px)",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          pointerEvents: "none",
          transition: "opacity 0.3s ease",
        });
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.opacity = "1";
    },
    { id: BANNER_ID, msg: text },
  );
}

export async function clearNarration(page) {
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 300);
    }
  }, BANNER_ID);
}
