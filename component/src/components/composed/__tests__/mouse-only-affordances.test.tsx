import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ConnectionCard } from "../connection-card";
import { ConnectionStatus } from "../connection-status";
import { Slider } from "@/components/ui/slider";

describe("#1283 item 1 — a clickable ConnectionCard is keyboard-operable", () => {
  it("exposes the card as a button and fires on Enter and Space", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ConnectionCard
        name="Production DB"
        host="db.example.com"
        status="connected"
        onClick={onClick}
      />,
    );

    const card = screen.getByRole("button", { name: /Production DB/i });
    await user.tab();
    expect(card).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("stays out of the tab order when it is not clickable", () => {
    render(
      <ConnectionCard
        name="Production DB"
        host="db.example.com"
        status="connected"
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Production DB/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the status live region outside the card button", () => {
    // HTML-AAM: button descendants are presentational, so a role="status"
    // live region nested inside a <button> loses its live-region semantics
    // and stops announcing connection-state changes (#1059). Making the card
    // keyboard-operable must not cost that.
    render(
      <ConnectionCard
        name="Production DB"
        host="db.example.com"
        status="error"
        statusText="Connection refused at port 7687"
        onClick={() => {}}
      />,
    );

    const card = screen.getByRole("button", { name: /Production DB/i });
    const status = screen.getByRole("status");
    expect(card).not.toContainElement(status);
  });

  it("still exposes the error text when the card is clickable", () => {
    render(
      <ConnectionCard
        name="Production DB"
        host="db.example.com"
        status="error"
        statusText="Connection refused at port 7687"
        onClick={() => {}}
      />,
    );
    expect(screen.getByRole("status")).toHaveAccessibleName(
      /Connection refused at port 7687/,
    );
  });

  it("keeps the actions menu outside the card button", async () => {
    // Nesting the menu trigger inside the card button would be invalid HTML
    // and ARIA would make it presentational.
    const onClick = vi.fn();
    render(
      <ConnectionCard
        name="Production DB"
        host="db.example.com"
        status="connected"
        onClick={onClick}
        onEdit={() => {}}
      />,
    );

    const card = screen.getByRole("button", { name: /Production DB/i });
    const menu = screen.getByRole("button", { name: /Connection actions/i });
    expect(card).not.toContainElement(menu);
  });
});

/**
 * #1283 — controls or their explanatory content reachable only with a pointer.
 *
 * Items 2 and 5 of the checklist. Both are fixed by putting the information
 * into the accessibility tree rather than adding focus management to elements
 * that cannot take focus.
 */

describe("#1283 item 2 — connection error text is not hover-gated", () => {
  it("folds the error message into the status badge's accessible name", () => {
    render(
      <ConnectionStatus
        status="error"
        errorMessage="Connection refused at port 7687"
      />,
    );

    // No hover: the message must be readable from the a11y tree alone.
    expect(screen.getByRole("status")).toHaveAccessibleName(
      /Connection refused at port 7687/,
    );
  });

  it("keeps the plain status name when there is no error", () => {
    render(<ConnectionStatus status="connected" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAccessibleName(/Connection status/i);
    // No dangling separator from an absent message.
    expect(badge.getAttribute("aria-label")).not.toMatch(/\.\s*$/);
  });
});

describe("#1283 item 5 — slider forwards its label to the thumbs", () => {
  it("labels a single-thumb slider", () => {
    render(<Slider aria-label="Opacity" defaultValue={[50]} max={100} />);
    // Radix puts role="slider" on the THUMB, so a label on Root never reaches it.
    expect(screen.getByRole("slider")).toHaveAccessibleName("Opacity");
  });

  it("qualifies each thumb of a range slider", () => {
    render(<Slider aria-label="Price" defaultValue={[10, 90]} max={100} />);
    const thumbs = screen.getAllByRole("slider");
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]).toHaveAccessibleName(/Price minimum/i);
    expect(thumbs[1]).toHaveAccessibleName(/Price maximum/i);
  });

  it("supports aria-labelledby as well", () => {
    render(
      <>
        <span id="vol-label">Volume</span>
        <Slider aria-labelledby="vol-label" defaultValue={[30]} max={100} />
      </>,
    );
    expect(screen.getByRole("slider")).toHaveAccessibleName("Volume");
  });
});
