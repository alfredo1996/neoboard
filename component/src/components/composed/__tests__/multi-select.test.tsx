import type { ComponentProps } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import userEvent from "@testing-library/user-event";
import { MultiSelect } from "../multi-select";
import { ParamMultiSelector } from "../parameter-widgets/param-multi-selector";

const options = [
  { value: "react", label: "React" },
  { value: "vue", label: "Vue" },
  { value: "angular", label: "Angular" },
  { value: "svelte", label: "Svelte" },
  { value: "solid", label: "Solid" },
];

describe("MultiSelect", () => {
  it("renders placeholder when no value selected", () => {
    render(<MultiSelect options={options} value={[]} placeholder="Pick..." />);
    expect(screen.getByText("Pick...")).toBeInTheDocument();
  });

  it("renders selected items as badges", () => {
    render(<MultiSelect options={options} value={["react", "vue"]} />);
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Vue")).toBeInTheDocument();
  });

  it("gives each remove control an accessible label (#component-review)", () => {
    render(<MultiSelect options={options} value={["react"]} />);
    // A real button, a sibling of the trigger (#2275).
    expect(
      screen.getByRole("button", { name: "Remove React" }),
    ).toBeInTheDocument();
  });

  it("draws the remove x with the Tag remove styling, 10px (#2220)", () => {
    render(<MultiSelect options={options} value={["react"]} />);
    const remove = screen.getByRole("button", { name: "Remove React" });
    expect(remove).toHaveClass("text-muted-foreground");
    expect(remove).not.toHaveClass("rounded-full");
    expect(remove.querySelector("svg")).toHaveClass("!size-2.5");
  });

  it("hides placeholder when items are selected", () => {
    render(
      <MultiSelect options={options} value={["react"]} placeholder="Pick..." />,
    );
    expect(screen.queryByText("Pick...")).not.toBeInTheDocument();
  });

  it("shows overflow badge when more items than maxDisplay", () => {
    render(
      <MultiSelect
        options={options}
        value={["react", "vue", "angular", "svelte"]}
        maxDisplay={2}
      />,
    );
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Vue")).toBeInTheDocument();
    expect(screen.queryByText("Angular")).not.toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("does not show overflow badge when items fit within maxDisplay", () => {
    render(
      <MultiSelect options={options} value={["react", "vue"]} maxDisplay={3} />,
    );
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it("renders combobox trigger with correct aria attributes", () => {
    render(<MultiSelect options={options} value={[]} />);
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("is disabled when disabled prop is true", () => {
    render(<MultiSelect options={options} value={[]} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("calls onChange with item removed when remove button clicked", async () => {
    const onChange = vi.fn();
    render(
      <MultiSelect
        options={options}
        value={["react", "vue"]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove React" }));
    expect(onChange).toHaveBeenCalledWith(["vue"]);
  });

  it("shows correct overflow count with maxDisplay=1", () => {
    render(
      <MultiSelect
        options={options}
        value={["react", "vue", "angular"]}
        maxDisplay={1}
      />,
    );
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("uses renderOption to draw each row when provided (#902)", async () => {
    // cmdk's Command list calls scrollIntoView on focus — jsdom doesn't
    // implement it. Polyfill for this test only and restore on teardown so
    // we don't leak the stub into sibling tests.
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();
    try {
      const user = (
        await import("@testing-library/user-event")
      ).default.setup();
      const renderOption = vi.fn((opt: { value: string; label: string }) => (
        <span>
          {opt.label}
          <span data-testid={`badge-${opt.value}`}>BADGE</span>
        </span>
      ));
      render(
        <MultiSelect
          options={options.slice(0, 2)}
          value={[]}
          renderOption={renderOption}
        />,
      );
      // Open the popover so the list items render
      await user.click(screen.getByRole("combobox"));
      // renderOption fires for every option in the list (React may re-render)
      expect(renderOption).toHaveBeenCalled();
      expect(screen.getByTestId("badge-react")).toBeInTheDocument();
      expect(screen.getByTestId("badge-vue")).toBeInTheDocument();
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });
});

// #1411: value is a machine id, label is what the user sees and types.
describe("MultiSelect — filters on the visible label (#1411)", () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  const idOptions = [
    { value: "w-1", label: "Revenue by month" },
    { value: "w-2", label: "Top customers" },
  ];

  async function openAndType(
    props: Partial<ComponentProps<typeof MultiSelect>>,
    term: string,
  ) {
    const user = userEvent.setup();
    render(<MultiSelect options={idOptions} value={[]} {...props} />);
    await user.click(screen.getByRole("combobox"));
    const input = screen.getByPlaceholderText("Search...");
    await user.click(input);
    if (term) await user.type(input, term);
    return user;
  }

  it("keeps an option whose label matches although its value does not", async () => {
    await openAndType({}, "Revenue");
    expect(screen.getByText("Revenue by month")).toBeInTheDocument();
    expect(screen.queryByText("Top customers")).not.toBeInTheDocument();
  });

  it("selects the underlying value, not the label", async () => {
    const onChange = vi.fn();
    const user = await openAndType({ onChange }, "Revenue");
    await user.click(screen.getByText("Revenue by month"));
    expect(onChange).toHaveBeenCalledWith(["w-1"]);
  });

  it("keeps options that share a label distinct for keyboard selection", async () => {
    const onChange = vi.fn();
    const user = await openAndType(
      {
        onChange,
        options: [
          { value: "w-1", label: "Untitled" },
          { value: "w-2", label: "Untitled" },
        ],
      },
      "",
    );
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith(["w-2"]);
  });

  it("does not match on the hidden value", async () => {
    await openAndType({}, "w-");
    expect(screen.getByText("No option found.")).toBeInTheDocument();
  });

  it("keeps an option with an empty value findable by its label", async () => {
    await openAndType(
      {
        options: [
          { value: "", label: "(none)" },
          { value: "w-1", label: "Revenue by month" },
        ],
      },
      "none",
    );
    expect(screen.getByRole("option", { name: "(none)" })).toBeInTheDocument();
  });

  it("keeps values that differ only by whitespace distinct for keyboard selection", async () => {
    const onChange = vi.fn();
    const user = await openAndType(
      {
        onChange,
        options: [
          { value: "NY", label: "New York" },
          { value: "NY ", label: "New York (padded)" },
        ],
      },
      "",
    );
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith(["NY "]);
  });
});

// #2275: a remove control inside the trigger <button> is presentational to
// assistive tech, so one value could not be removed. jsdom cannot evaluate that
// ARIA rule: assert the DOM shape it comes from, and exact names.
const regions = [
  { value: "eu", label: "Europe" },
  { value: "na", label: "North America" },
];
describe.each([
  [
    "MultiSelect",
    (onChange: (v: string[]) => void) => (
      <MultiSelect
        options={regions}
        value={["eu", "na"]}
        onChange={onChange}
        placeholder="Pick"
      />
    ),
  ],
  [
    "ParamMultiSelector",
    (onChange: (v: string[]) => void) => (
      <ParamMultiSelector
        parameterName="region"
        options={regions}
        values={["eu", "na"]}
        onChange={onChange}
      />
    ),
  ],
])("#2275 %s remove buttons", (_name, renderField) => {
  it("keeps each remove button outside the trigger, with its own exact name", () => {
    render(renderField(vi.fn()));
    const trigger = screen.getByRole("combobox");
    for (const label of ["Europe", "North America"]) {
      const remove = screen.getByRole("button", {
        name: `Remove ${label}`,
      });
      expect(trigger.contains(remove)).toBe(false);
    }
    expect(trigger.querySelector("button, [role=button]")).toBeNull();
  });

  it("Tab reaches a remove button, and Enter removes only that value", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(renderField(onChange));
    screen.getByRole("combobox").focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Remove Europe" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(["na"]);
  });
});

describe("#2275 trigger name and description", () => {
  it("takes its name from aria-labelledby and says what is selected", () => {
    render(
      <>
        <h4 id="h">After Submit</h4>
        <p id="x">Pick widgets</p>
        <MultiSelect
          aria-labelledby="h"
          aria-describedby="x"
          options={regions}
          value={["eu", "na"]}
          onChange={() => {}}
        />
      </>,
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveAccessibleName("After Submit");
    expect(trigger).toHaveAccessibleDescription(
      "Pick widgets 2 selected: Europe, North America",
    );
  });

  it("takes its name from aria-label", () => {
    render(
      <MultiSelect
        aria-label="Regions"
        options={regions}
        value={[]}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveAccessibleName("Regions");
    expect(trigger).not.toHaveAccessibleDescription();
  });
});

describe("#2275 shell state classes are literal strings", () => {
  it.each([
    "has-[[role=combobox]:focus-visible]:ring-2",
    "has-[[role=combobox]:focus-visible]:ring-ring",
    "has-[[role=combobox]:disabled]:opacity-50",
    "has-[[role=combobox]:disabled]:cursor-not-allowed",
    "has-[[aria-invalid=true]]:border-destructive",
    "has-[[aria-invalid=true]]:has-[[role=combobox]:focus-visible]:border-destructive",
    "[@media(pointer:coarse)]:text-base",
  ])("%s", (cls) => {
    render(<MultiSelect options={regions} value={[]} />);
    const shell = screen.getByRole("combobox").parentElement as HTMLElement;
    expect(shell.className.split(/\s+/)).toContain(cls);
  });
});
