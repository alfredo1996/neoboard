import type { Meta, StoryObj } from "@storybook/react";
import { expect, screen, userEvent } from "storybook/test";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  expectCentredThroughoutAnimation,
  freezeAnimations,
} from "./animation-centring";

const meta = {
  title: "UI/AlertDialog",
  component: AlertDialog,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    open: {
      control: "boolean",
      description: "Controlled open state of the alert dialog",
    },
  },
} satisfies Meta<typeof AlertDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">Show Dialog</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete your
            account and remove your data from our servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
};

export const Destructive: Story = {
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete Account</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Account</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete your account? This action is
            permanent and cannot be reversed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
};

/**
 * #1373 — the entrance must scale in place, not travel in from a corner. Same
 * assertion as `dialog.stories.tsx`: AlertDialog used to carry upstream shadcn's
 * `top-[48%]` instead of `top-1/2`, so it drifted 2% of its height while its
 * sibling Dialog held the centre. Both are held to the same rule now.
 */
export const CentredOnEnter: Story = {
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button>Open</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Centred on enter</AlertDialogTitle>
          <AlertDialogDescription>
            Confirmation dialog, entrance scrubbed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Dismiss</AlertDialogCancel>
          <AlertDialogAction>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
  play: async () => {
    const unfreeze = freezeAnimations();
    try {
      await userEvent.click(screen.getByRole("button", { name: "Open" }));
      expectCentredThroughoutAnimation(
        await screen.findByRole("alertdialog"),
        "AlertDialogContent",
      );
    } finally {
      unfreeze();
    }
  },
};

/** #1373 — the `exit` keyframe is `to`-only, so close is broken the same way. */
export const CentredOnExit: Story = {
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button>Open</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Centred on exit</AlertDialogTitle>
          <AlertDialogDescription>
            Confirmation dialog, exit scrubbed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Dismiss</AlertDialogCancel>
          <AlertDialogAction>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
  play: async () => {
    const unfreeze = freezeAnimations();
    try {
      await userEvent.click(screen.getByRole("button", { name: "Open" }));
      const content = await screen.findByRole("alertdialog");
      await userEvent.click(
        await screen.findByRole("button", { name: "Dismiss" }),
      );
      expect(content).toHaveAttribute("data-state", "closed");
      expectCentredThroughoutAnimation(content, "AlertDialogContent");
    } finally {
      unfreeze();
    }
  },
};
