// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the component under test
// ---------------------------------------------------------------------------

vi.mock("@neoboard/components", () => ({
  Button: ({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <div role="menuitem" onClick={onClick} className={className}>
      {children}
    </div>
  ),
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
  Plus: () => <span aria-hidden="true">+</span>,
  MoreHorizontal: () => <span aria-hidden="true">...</span>,
  Pencil: () => <span aria-hidden="true">✏</span>,
  Trash2: () => <span aria-hidden="true">🗑</span>,
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import { PageTabs } from "../page-tabs";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TWO_PAGES = [
  { id: "p1", title: "Overview", widgets: [], gridLayout: [] },
  { id: "p2", title: "Details", widgets: [], gridLayout: [] },
];

const ONE_PAGE = [{ id: "p1", title: "Overview", widgets: [], gridLayout: [] }];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PageTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders all page titles as buttons", () => {
    render(<PageTabs pages={TWO_PAGES} activeIndex={0} onSelect={vi.fn()} />);
    expect(screen.getByText("Overview")).toBeTruthy();
    expect(screen.getByText("Details")).toBeTruthy();
  });

  it("calls onSelect with the correct index when a tab is clicked", () => {
    const onSelect = vi.fn();
    render(<PageTabs pages={TWO_PAGES} activeIndex={0} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Details"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("does not render the Add button when editable=false (default)", () => {
    render(<PageTabs pages={TWO_PAGES} activeIndex={0} onSelect={vi.fn()} />);
    expect(screen.queryByLabelText("Add page")).toBeNull();
  });

  it("renders the Add button when editable=true and calls onAdd on click", () => {
    const onAdd = vi.fn();
    render(
      <PageTabs pages={TWO_PAGES} activeIndex={0} editable onSelect={vi.fn()} onAdd={onAdd} />
    );
    const addBtn = screen.getByLabelText("Add page");
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("shows page options buttons for each tab when editable", () => {
    render(<PageTabs pages={TWO_PAGES} activeIndex={0} editable onSelect={vi.fn()} />);
    expect(screen.getAllByLabelText(/Page options for/)).toHaveLength(2);
  });

  it("does not show page options buttons when not editable", () => {
    render(<PageTabs pages={TWO_PAGES} activeIndex={0} onSelect={vi.fn()} />);
    expect(screen.queryAllByLabelText(/Page options for/)).toHaveLength(0);
  });

  it("clicking Rename shows the input pre-filled with the current title", () => {
    render(
      <PageTabs pages={TWO_PAGES} activeIndex={0} editable onSelect={vi.fn()} onRename={vi.fn()} />
    );
    fireEvent.click(screen.getAllByText("Rename")[0]);
    const input = screen.getByDisplayValue("Overview");
    expect(input).toBeTruthy();
  });

  it("pressing Enter in the rename input commits the rename", () => {
    const onRename = vi.fn();
    render(
      <PageTabs pages={TWO_PAGES} activeIndex={0} editable onSelect={vi.fn()} onRename={onRename} />
    );
    fireEvent.click(screen.getAllByText("Rename")[0]);
    const input = screen.getByDisplayValue("Overview");
    fireEvent.change(input, { target: { value: "New Title" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith(0, "New Title");
  });

  it("pressing Escape in the rename input cancels without calling onRename", () => {
    const onRename = vi.fn();
    render(
      <PageTabs pages={TWO_PAGES} activeIndex={0} editable onSelect={vi.fn()} onRename={onRename} />
    );
    fireEvent.click(screen.getAllByText("Rename")[0]);
    fireEvent.keyDown(screen.getByDisplayValue("Overview"), { key: "Escape" });
    expect(screen.queryByDisplayValue("Overview")).toBeNull();
    expect(onRename).not.toHaveBeenCalled();
  });

  it("blurring the rename input commits the rename", () => {
    const onRename = vi.fn();
    render(
      <PageTabs pages={TWO_PAGES} activeIndex={0} editable onSelect={vi.fn()} onRename={onRename} />
    );
    fireEvent.click(screen.getAllByText("Rename")[0]);
    const input = screen.getByDisplayValue("Overview");
    fireEvent.change(input, { target: { value: "Blurred Title" } });
    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledWith(0, "Blurred Title");
  });

  it("shows Delete option for each page when there are multiple pages", () => {
    render(
      <PageTabs pages={TWO_PAGES} activeIndex={0} editable onSelect={vi.fn()} onRemove={vi.fn()} />
    );
    expect(screen.getAllByText("Delete page")).toHaveLength(2);
  });

  it("does not show Delete option when there is only one page", () => {
    render(<PageTabs pages={ONE_PAGE} activeIndex={0} editable onSelect={vi.fn()} />);
    expect(screen.queryByText("Delete page")).toBeNull();
  });

  it("clicking Delete page calls onRemove with the correct index", () => {
    const onRemove = vi.fn();
    render(
      <PageTabs pages={TWO_PAGES} activeIndex={0} editable onSelect={vi.fn()} onRemove={onRemove} />
    );
    fireEvent.click(screen.getAllByText("Delete page")[1]);
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it("commitRename is a no-op when rename value is blank", () => {
    const onRename = vi.fn();
    render(
      <PageTabs pages={TWO_PAGES} activeIndex={0} editable onSelect={vi.fn()} onRename={onRename} />
    );
    fireEvent.click(screen.getAllByText("Rename")[0]);
    const input = screen.getByDisplayValue("Overview");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).not.toHaveBeenCalled();
  });
});
