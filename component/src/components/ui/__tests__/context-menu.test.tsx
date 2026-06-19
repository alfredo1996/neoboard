import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "../context-menu";

function openMenu() {
  fireEvent.contextMenu(screen.getByText("Right click"));
}

describe("ContextMenu", () => {
  it("renders every styled content sub-component once opened", async () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger>Right click</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuLabel>Section</ContextMenuLabel>
          <ContextMenuItem>
            Plain item
            <ContextMenuShortcut>⌘K</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem inset>Inset item</ContextMenuItem>
          <ContextMenuCheckboxItem checked>Checkbox</ContextMenuCheckboxItem>
          <ContextMenuRadioGroup value="one">
            <ContextMenuRadioItem value="one">Radio</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>More</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem>Sub item</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenu>,
    );
    openMenu();
    expect(await screen.findByText("Section")).toBeInTheDocument();
    expect(screen.getByText("Plain item")).toBeInTheDocument();
    expect(screen.getByText("Checkbox")).toBeInTheDocument();
    expect(screen.getByText("Radio")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();
  });

  it("promotes the content overlay surface to rounded-lg", async () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger>Right click</ContextMenuTrigger>
        <ContextMenuContent data-testid="cm-content">
          <ContextMenuItem>Item</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );
    openMenu();
    expect(await screen.findByTestId("cm-content")).toHaveClass("rounded-lg");
  });
});
