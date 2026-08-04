import { expect } from "storybook/test";

/**
 * #1373 — modal content is centred with `translate(-50%,-50%)`, but
 * tailwindcss-animate's `enter` keyframe is `from`-only and `exit` is `to`-only,
 * so without the `slide-*-1/2` compensation the browser interpolates the whole
 * transform from `translate3d(0,0,0)` and the box flies in from the
 * bottom-right. A class-presence assertion cannot see that (it shipped twice:
 * `d723a127`, then PR #1173), so the stories that use these helpers scrub the
 * real animation in a real browser and assert the box centre never leaves the
 * viewport centre.
 *
 * jsdom cannot host them: no layout engine, no `getAnimations()`.
 *
 * Shared by `dialog.stories.tsx` and `alert-dialog.stories.tsx`: both modals are
 * held to the same rule — scale in place, no travel — so they share one
 * measurement rather than two copies that can drift apart.
 */
const CENTRE_TOLERANCE_PX = 1.5;

/** Freeze every animation so the scrub below is deterministic — no sleeps, no
 * race against the entrance finishing before the assertion runs. */
export function freezeAnimations() {
  const style = document.createElement("style");
  style.textContent =
    "*, *::before, *::after { animation-play-state: paused !important; }";
  document.head.append(style);
  return () => style.remove();
}

/**
 * Scrub the element's animation across its whole active duration and assert its
 * bounding-box centre stays on the viewport centre the entire time. On failure
 * the message carries every sample, so the report says how far it drifted.
 */
export function expectCentredThroughoutAnimation(
  el: HTMLElement,
  label = "The dialog",
) {
  const [anim] = el.getAnimations();
  expect(anim, `${label} should have an animation to scrub`).toBeDefined();
  anim.pause();

  const total = Number(anim.effect?.getComputedTiming().activeDuration ?? 0);
  expect(total, "animation should have a non-zero duration").toBeGreaterThan(0);

  const samples = [0, 0.2, 0.4, 0.6, 0.8, 0.999].map((fraction) => {
    const t = total * fraction;
    anim.currentTime = t;
    const r = el.getBoundingClientRect();
    return {
      t,
      dx: r.left + r.width / 2 - window.innerWidth / 2,
      dy: r.top + r.height / 2 - window.innerHeight / 2,
    };
  });

  const drift = (s: (typeof samples)[number]) =>
    Math.max(Math.abs(s.dx), Math.abs(s.dy));
  const worst = samples.reduce((a, b) => (drift(b) > drift(a) ? b : a));
  const report = samples
    .map(
      (s) =>
        `  t=${s.t.toFixed(0)}ms dx=${s.dx.toFixed(1)}px dy=${s.dy.toFixed(1)}px`,
    )
    .join("\n");

  expect(
    drift(worst),
    `${label} left the viewport centre mid-animation (#1373).\n${report}\n`,
  ).toBeLessThan(CENTRE_TOLERANCE_PX);
}
