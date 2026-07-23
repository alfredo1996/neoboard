import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardKpi,
} from "../card";

describe("Card composition", () => {
  it("renders header, title, description, content, and footer", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Desc</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Foot</CardFooter>
      </Card>,
    );
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Desc")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText("Foot")).toBeInTheDocument();
  });

  it("threads density padding through header/content/footer", () => {
    render(
      <Card density="compact" data-testid="card">
        <CardHeader data-testid="h">H</CardHeader>
        <CardContent data-testid="c">C</CardContent>
        <CardFooter data-testid="f">F</CardFooter>
      </Card>,
    );
    // compact = p-4 on each padded slot
    expect(screen.getByTestId("h")).toHaveClass("p-4");
    expect(screen.getByTestId("c")).toHaveClass("p-4");
    expect(screen.getByTestId("f")).toHaveClass("p-4");
  });

  it("adds the hover-lift affordance only when interactive", () => {
    const { rerender } = render(<Card data-testid="card">x</Card>);
    expect(screen.getByTestId("card")).not.toHaveClass("hover:-translate-y-px");
    rerender(
      <Card data-testid="card" interactive>
        x
      </Card>,
    );
    expect(screen.getByTestId("card")).toHaveClass("hover:-translate-y-px");
  });
});

describe("CardKpi", () => {
  it("renders label and value", () => {
    render(<CardKpi label="Revenue" value="$1.2M" />);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("$1.2M")).toBeInTheDocument();
  });

  it("renders a positive trend in the success color", () => {
    const { container } = render(
      <CardKpi label="R" value="1" trend={12.5} trendLabel="vs last week" />,
    );
    const trend = container.querySelector(".text-success");
    expect(trend).not.toBeNull();
    expect(trend).toHaveTextContent("12.5");
    expect(screen.getByText(/vs last week/)).toBeInTheDocument();
  });

  it("renders a negative trend in the destructive color", () => {
    const { container } = render(<CardKpi label="R" value="1" trend={-3} />);
    expect(container.querySelector(".text-destructive")).not.toBeNull();
    // No text-success when the trend is negative.
    expect(container.querySelector(".text-success")).toBeNull();
  });

  it("omits the trend row entirely when trend is undefined", () => {
    const { container } = render(<CardKpi label="R" value="1" />);
    expect(container.querySelector(".text-success")).toBeNull();
    expect(container.querySelector(".text-destructive")).toBeNull();
  });
});
