import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { Field } from "../field";
import { Input } from "../input";
import { Textarea } from "../textarea";
import { Select, SelectTrigger, SelectValue } from "../select";
import { Combobox } from "../../composed/combobox";
import { CreatableCombobox } from "../../composed/creatable-combobox";
import { MultiSelect } from "../../composed/multi-select";
import { PasswordInput } from "../../composed/password-input";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

describe("Field (#2217)", () => {
  it("associates the label with the control", () => {
    render(
      <Field label="Name">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Name")).toBeInstanceOf(HTMLInputElement);
  });

  it("keeps an explicit id on the control and the label", () => {
    render(
      <Field label="Email" id="user-email">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Email")).toHaveAttribute("id", "user-email");
  });

  it("points aria-describedby at the help when there is no error", () => {
    render(
      <Field label="Name" help="Shown on your profile.">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText("Name");
    expect(input).not.toHaveAttribute("aria-invalid");
    const help = screen.getByText("Shown on your profile.");
    expect(input.getAttribute("aria-describedby")).toBe(help.id);
  });

  it("points aria-describedby at the error and sets aria-invalid", () => {
    render(
      <Field label="Name" help="Shown on your profile." error="Enter a name.">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("Enter a name.");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
    expect(screen.queryByText("Shown on your profile.")).toBeNull();
  });

  it("marks optional fields", () => {
    render(
      <Field label="Nickname" optional>
        <Input />
      </Field>,
    );
    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("wires Textarea, a Select trigger, Combobox, MultiSelect and PasswordInput", () => {
    render(
      <>
        <Field label="Notes" error="Add a note.">
          <Textarea />
        </Field>
        <Field label="Kind" error="Pick a kind.">
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="pick" />
            </SelectTrigger>
          </Select>
        </Field>
        <Field label="Source" error="Pick a source.">
          <Combobox options={options} />
        </Field>
        <Field label="Many" error="Pick some.">
          <MultiSelect options={options} />
        </Field>
        <Field label="Secret" error="Enter a password.">
          <PasswordInput />
        </Field>
      </>,
    );
    for (const name of ["Notes", "Kind", "Source", "Many", "Secret"]) {
      const control = screen.getByLabelText(name, { exact: true });
      expect(control).toHaveAttribute("aria-invalid", "true");
      const described = control.getAttribute("aria-describedby") ?? "";
      expect(document.getElementById(described)).toHaveTextContent(/\.$/);
    }
  });

  it("wires CreatableCombobox", () => {
    render(
      <Field label="Tag" error="Pick a tag.">
        <CreatableCombobox
          suggestions={["Alpha"]}
          value=""
          onChange={() => {}}
        />
      </Field>,
    );
    expect(screen.getByLabelText("Tag")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("leaves a control outside a Field untouched", () => {
    render(<Input aria-label="Plain" />);
    const input = screen.getByLabelText("Plain");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });
});

describe("Combobox keyboard (#2217)", () => {
  it("opens, filters and selects by keyboard", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Field label="Source">
        <Combobox options={options} onChange={onChange} />
      </Field>,
    );
    screen.getByLabelText("Source").focus();
    await user.keyboard("{Enter}");
    await user.keyboard("bet");
    expect(screen.queryByText("Alpha")).toBeNull();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("underlines the part of an option that matched", async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} />);
    await user.click(screen.getByRole("combobox"));
    await user.keyboard("lph");
    expect(document.querySelector("mark")).toHaveTextContent("lph");
  });
});

describe("Field font size on coarse pointers (#2217)", () => {
  // jsdom does not evaluate media queries, so assert the class that carries
  // the 16px rule rather than a computed style.
  it.each([
    ["Input", <Input key="i" data-testid="c" />],
    ["Textarea", <Textarea key="t" data-testid="c" />],
    [
      "SelectTrigger",
      <Select key="s">
        <SelectTrigger data-testid="c" />
      </Select>,
    ],
  ])("%s goes to 16px under (pointer: coarse)", (_name, el) => {
    render(el);
    const cls = screen.getByTestId("c").className;
    expect(cls).toContain("[@media(pointer:coarse)]:text-base");
    expect(cls).not.toContain("md:text-sm");
  });
});
