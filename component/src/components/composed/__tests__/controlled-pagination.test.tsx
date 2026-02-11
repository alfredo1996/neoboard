import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ControlledPagination } from "../controlled-pagination";

describe("ControlledPagination", () => {
  it("shows current page and total pages", () => {
    render(<ControlledPagination page={1} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByText("Page 1 of 5")).toBeInTheDocument();
  });

  it("calls onPageChange with next page", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<ControlledPagination page={1} totalPages={5} onPageChange={onPageChange} />);
    await user.click(screen.getByLabelText("Next page"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calls onPageChange with previous page", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<ControlledPagination page={3} totalPages={5} onPageChange={onPageChange} />);
    await user.click(screen.getByLabelText("Previous page"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calls onPageChange with first page", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<ControlledPagination page={3} totalPages={5} onPageChange={onPageChange} />);
    await user.click(screen.getByLabelText("First page"));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("calls onPageChange with last page", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<ControlledPagination page={3} totalPages={5} onPageChange={onPageChange} />);
    await user.click(screen.getByLabelText("Last page"));
    expect(onPageChange).toHaveBeenCalledWith(5);
  });

  it("disables previous and first buttons on page 1", () => {
    render(<ControlledPagination page={1} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
    expect(screen.getByLabelText("First page")).toBeDisabled();
  });

  it("disables next and last buttons on last page", () => {
    render(<ControlledPagination page={5} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByLabelText("Next page")).toBeDisabled();
    expect(screen.getByLabelText("Last page")).toBeDisabled();
  });

  it("shows page size selector when showPageSize is true", () => {
    render(
      <ControlledPagination
        page={1}
        totalPages={5}
        onPageChange={() => {}}
        pageSize={10}
        onPageSizeChange={() => {}}
        showPageSize
      />
    );
    expect(screen.getByText("Rows per page")).toBeInTheDocument();
  });

  it("does not show page size selector by default", () => {
    render(<ControlledPagination page={1} totalPages={5} onPageChange={() => {}} />);
    expect(screen.queryByText("Rows per page")).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <ControlledPagination page={1} totalPages={5} onPageChange={() => {}} className="my-pag" />
    );
    expect(container.firstChild).toHaveClass("my-pag");
  });
});
