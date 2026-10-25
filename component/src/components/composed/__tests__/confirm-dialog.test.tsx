import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect, vi } from "vitest";
import { ConfirmDialog } from "../confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  focusedMenuTrigger,
} from "@/components/ui/dropdown-menu";

describe("ConfirmDialog", () => {
  it("titles itself with the action and the name, and says what goes with it", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        action="Delete"
        object="dashboard"
        name="Movie Highlights"
        consequences="Its 12 widgets go with it."
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("alertdialog", { name: "Delete Movie Highlights?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Its 12 widgets go with it.")).toBeInTheDocument();
  });

  it("repeats the verb and the object on the button", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        action="Delete"
        object="dashboard"
        name="Movie Highlights"
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Delete dashboard" }),
    ).toBeInTheDocument();
  });

  it("falls back to 'this {object}' when it has no name, and to the bare action with no object", () => {
    const { rerender } = render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        action="Remove"
        object="widget"
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("alertdialog", { name: "Remove this widget?" }),
    ).toBeInTheDocument();
    rerender(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        action="Leave without saving"
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("alertdialog", { name: "Leave without saving?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Leave without saving" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["Delete", true],
    ["Remove", true],
    ["Revoke", true],
    ["Disable", true],
    ["Discard", true],
    ["Publish", false],
  ])("styles %s as destructive: %s", (action, destructive) => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        action={action}
        object="thing"
        onConfirm={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: `${action} thing` });
    expect(button.className.includes("bg-destructive")).toBe(destructive);
  });

  it("does not render content when closed", () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        action="Delete"
        object="item"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("renders a custom cancel text and the default Cancel", () => {
    const { rerender } = render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        action="Discard"
        object="changes"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    rerender(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        action="Discard"
        object="changes"
        cancelText="Keep editing"
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Keep editing" }),
    ).toBeInTheDocument();
  });

  it("calls onConfirm and onOpenChange when the confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        action="Delete"
        object="item"
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete item" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onCancel and onOpenChange when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        action="Delete"
        object="item"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("has no description element when it has no consequences", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        action="Delete"
        object="item"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("alertdialog")).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("keeps a node as consequences (the live usage list) outside a <p>", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        action="Delete"
        object="connection"
        consequences={
          <ul>
            <li>Sales</li>
          </ul>
        }
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText("Sales").closest("p")).toBeNull();
  });
});

// The dialog has no Trigger, so Radix hands focus back to nothing when it
// closes and focus fell to <body> (#2055). Asked from a menu item, the item is
// gone by then; the menu's button is where focus belongs.
describe("ConfirmDialog — focus on close (#2055)", () => {
  function AskedFromMenu() {
    const [open, setOpen] = React.useState(false);
    const [back, setBack] = React.useState<HTMLElement | null>(null);
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger>Options</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onClick={() => {
                setBack(focusedMenuTrigger());
                setOpen(true);
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          action="Delete"
          object="item"
          onConfirm={vi.fn()}
          returnFocusTo={back}
        />
      </>
    );
  }

  it("Escape closes it and puts focus back on the menu's button", async () => {
    const user = userEvent.setup();
    render(<AskedFromMenu />);

    await user.click(screen.getByRole("button", { name: "Options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(
      screen.getByRole("alertdialog", { name: "Delete this item?" }),
    ).toBeVisible();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Options" })).toHaveFocus(),
    );
  });

  it("leaves focus alone when the element to go back to is gone", async () => {
    const user = userEvent.setup();
    // Never attached: what a removed widget's menu button looks like.
    const gone = document.createElement("button");
    const focus = vi.spyOn(gone, "focus");
    function Asked() {
      const [open, setOpen] = React.useState(true);
      return (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          action="Remove"
          object="item"
          onConfirm={vi.fn()}
          returnFocusTo={gone}
        />
      );
    }
    render(<Asked />);

    await user.click(screen.getByRole("button", { name: "Remove item" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    // Radix's close autofocus runs a tick after unmount.
    await new Promise((r) => setTimeout(r, 10));
    expect(focus).not.toHaveBeenCalled();
  });
});

// After a confirm the content stays mounted, clickable, for its exit
// animation. A double-click on Delete, or Enter twice, used to confirm twice;
// a caller that deletes by index then deleted the next item unasked (#2055).
describe("ConfirmDialog — confirms once", () => {
  afterEach(() => vi.restoreAllMocks());

  it("ignores a second click while it fades out", () => {
    // What tailwindcss-animate does in a browser: closed plays another
    // animation, so Radix Presence keeps the content until it ends. jsdom
    // plays none and would unmount it at once.
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) => {
      const style = real(el, pseudo);
      return new Proxy(style, {
        get(target, prop) {
          if (prop === "animationName")
            return el.getAttribute("data-state") === "closed" ? "out" : "in";
          const value: unknown = Reflect.get(target, prop);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    });
    const onConfirm = vi.fn();
    function Asked() {
      const [open, setOpen] = React.useState(true);
      return (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          action="Delete"
          object="item"
          onConfirm={onConfirm}
        />
      );
    }
    render(<Asked />);
    const confirm = screen.getByRole("button", { name: "Delete item" });

    fireEvent.click(confirm);
    expect(confirm.isConnected).toBe(true); // still there, fading out
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe("focusedMenuTrigger", () => {
  it("is null when focus is not in a menu", () => {
    render(<button>Plain</button>);
    screen.getByRole("button", { name: "Plain" }).focus();

    expect(focusedMenuTrigger()).toBeNull();
  });
});
