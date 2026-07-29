import type { Meta, StoryObj } from "@storybook/react";
import { expect, screen, userEvent } from "storybook/test";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * #1373 — DialogContent is centred with `translate(-50%,-50%)`, but
 * tailwindcss-animate's `enter` keyframe is `from`-only and `exit` is `to`-only,
 * so without the `slide-*-1/2` compensation the browser interpolates the whole
 * transform from `translate3d(0,0,0)` and the dialog flies in from the
 * bottom-right. A class-presence assertion cannot see that (it shipped twice:
 * `d723a127`, then PR #1173), so these stories scrub the real animation in a
 * real browser and assert the box centre never leaves the viewport centre.
 *
 * jsdom cannot host these: no layout engine, no `getAnimations()`.
 */
const CENTRE_TOLERANCE_PX = 1.5;

/** Freeze every animation so the scrub below is deterministic — no sleeps, no
 * race against the 200ms entrance finishing before the assertion runs. */
function freezeAnimations() {
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
function expectCentredThroughoutAnimation(el: HTMLElement) {
  const [anim] = el.getAnimations();
  expect(anim, "DialogContent should have an animation to scrub").toBeDefined();
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
    `DialogContent left the viewport centre mid-animation (#1373).\n${report}\n`,
  ).toBeLessThan(CENTRE_TOLERANCE_PX);
}

const meta = {
  title: "UI/Dialog",
  component: Dialog,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    open: {
      control: "boolean",
      description: "Controlled open state of the dialog",
    },
    modal: {
      control: "boolean",
      description:
        "Whether the dialog is modal (blocks interaction with rest of page)",
    },
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Edit Profile</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Make changes to your profile here. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              defaultValue="Pedro Duarte"
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="username" className="text-right">
              Username
            </Label>
            <Input
              id="username"
              defaultValue="@peduarte"
              className="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="submit">Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const Simple: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open Dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

/** #1373 — the entrance must scale in place, not travel in from a corner. */
export const CentredOnEnter: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open</Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Centred on enter</DialogTitle>
          <DialogDescription>
            Small dialog, entrance scrubbed.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  ),
  play: async () => {
    const unfreeze = freezeAnimations();
    try {
      await userEvent.click(screen.getByRole("button", { name: "Open" }));
      expectCentredThroughoutAnimation(await screen.findByRole("dialog"));
    } finally {
      unfreeze();
    }
  },
};

/** #1373 — the `exit` keyframe is `to`-only, so close is broken the same way. */
export const CentredOnExit: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open</Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Centred on exit</DialogTitle>
          <DialogDescription>Small dialog, exit scrubbed.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Dismiss</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  play: async () => {
    const unfreeze = freezeAnimations();
    try {
      await userEvent.click(screen.getByRole("button", { name: "Open" }));
      const content = await screen.findByRole("dialog");
      await userEvent.click(
        await screen.findByRole("button", { name: "Dismiss" }),
      );
      expect(content).toHaveAttribute("data-state", "closed");
      expectCentredThroughoutAnimation(content);
    } finally {
      unfreeze();
    }
  },
};

/** #1373 — drift is proportional to the box, so the big widget-editor-sized
 * dialog is the worst case: a wide, tall box travels furthest. */
export const CentredWhenLarge: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open</Button>
      </DialogTrigger>
      <DialogContent size="full">
        <DialogHeader>
          <DialogTitle>Centred when large</DialogTitle>
          <DialogDescription>
            Full-width dialog with enough content to fill the viewport height.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {Array.from({ length: 40 }, (_, i) => (
            <p key={i} className="text-sm text-muted-foreground">
              Row {i + 1}
            </p>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  ),
  play: async () => {
    const unfreeze = freezeAnimations();
    try {
      await userEvent.click(screen.getByRole("button", { name: "Open" }));
      expectCentredThroughoutAnimation(await screen.findByRole("dialog"));
    } finally {
      unfreeze();
    }
  },
};
