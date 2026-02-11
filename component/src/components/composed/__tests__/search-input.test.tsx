import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SearchInput } from "../search-input";

describe("SearchInput", () => {
  it("renders with placeholder", () => {
    render(<SearchInput placeholder="Search..." />);
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("calls onChange when typing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchInput onChange={onChange} placeholder="Search..." />);

    await user.type(screen.getByPlaceholderText("Search..."), "hello");
    expect(onChange).toHaveBeenCalledTimes(5);
    expect(onChange).toHaveBeenLastCalledWith("hello");
  });

  it("works in uncontrolled mode", async () => {
    const user = userEvent.setup();
    render(<SearchInput placeholder="Search..." />);

    const input = screen.getByPlaceholderText("Search...");
    await user.type(input, "test");
    expect(input).toHaveValue("test");
  });

  it("works in controlled mode", () => {
    render(<SearchInput value="controlled" placeholder="Search..." />);
    expect(screen.getByPlaceholderText("Search...")).toHaveValue("controlled");
  });

  it("shows clear button when there is a value", () => {
    render(<SearchInput value="something" />);
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });

  it("hides clear button when empty", () => {
    render(<SearchInput value="" />);
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("calls onClear and onChange when clear button is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClear = vi.fn();
    render(<SearchInput value="test" onChange={onChange} onClear={onClear} />);

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith("");
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("calls onSearch with value when Enter is pressed", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchInput value="query" onSearch={onSearch} placeholder="Search..." />);

    const input = screen.getByPlaceholderText("Search...");
    await user.click(input);
    await user.keyboard("{Enter}");
    expect(onSearch).toHaveBeenCalledWith("query");
  });

  it("calls onClear when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const onChange = vi.fn();
    render(<SearchInput value="query" onClear={onClear} onChange={onChange} placeholder="Search..." />);

    const input = screen.getByPlaceholderText("Search...");
    await user.click(input);
    await user.keyboard("{Escape}");
    expect(onClear).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("clears internal value in uncontrolled mode on Escape", async () => {
    const user = userEvent.setup();
    render(<SearchInput placeholder="Search..." />);

    const input = screen.getByPlaceholderText("Search...");
    await user.type(input, "test");
    expect(input).toHaveValue("test");

    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
  });
});
