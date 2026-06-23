import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "../sheet";

describe("Sheet", () => {
  it("renders content, header, footer, title and description when open", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit profile</SheetTitle>
            <SheetDescription>Update your details.</SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <button type="button">Save</button>
          </SheetFooter>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByText("Edit profile")).toBeInTheDocument();
    expect(screen.getByText("Update your details.")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    // Built-in close button is always present in the content
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("supports an explicit side variant", () => {
    render(
      <Sheet open>
        <SheetContent side="left">
          <SheetTitle>Left sheet</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByText("Left sheet")).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    render(
      <Sheet open={false}>
        <SheetContent>
          <SheetTitle>Hidden</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });
});
