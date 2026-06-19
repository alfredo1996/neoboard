import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from "../breadcrumb";

describe("Breadcrumb", () => {
  it("renders the full breadcrumb trail", () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Current</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );
    expect(
      screen.getByRole("navigation", { name: "breadcrumb" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Current")).toHaveAttribute("aria-current", "page");
  });

  it("renders a link with the citrine focus-ring treatment", () => {
    render(<BreadcrumbLink href="/x">Link</BreadcrumbLink>);
    expect(screen.getByText("Link")).toHaveClass("focus-visible:ring-2");
  });

  it("supports asChild on the link", () => {
    render(
      <BreadcrumbLink asChild>
        <button type="button">As button</button>
      </BreadcrumbLink>,
    );
    expect(
      screen.getByRole("button", { name: "As button" }),
    ).toBeInTheDocument();
  });
});
