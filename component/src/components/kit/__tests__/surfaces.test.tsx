import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SettingsSection } from "../settings-section";
import { Stat } from "../stat";

describe("SettingsSection", () => {
  it("names the section by its title and holds the fields and footer", () => {
    render(
      <SettingsSection
        title="Display name"
        description="How your name appears."
        footer={<button>Save name</button>}
      >
        <input aria-label="Name" />
      </SettingsSection>,
    );
    const section = screen.getByRole("region", { name: "Display name" });
    expect(section).toHaveTextContent("How your name appears.");
    expect(section).toContainElement(screen.getByLabelText("Name"));
    expect(section).toContainElement(
      screen.getByRole("button", { name: "Save name" }),
    );
  });
});

describe("SettingsSection classes", () => {
  it("keeps the body size and the no-hover-darken override as separate classes", () => {
    render(<SettingsSection title="T">x</SettingsSection>);
    const tokens = screen
      .getByRole("region", { name: "T" })
      .className.split(/\s+/);
    expect(tokens).toEqual(
      expect.arrayContaining(["text-sm", "hover:border-card-edge"]),
    );
  });
});

describe("Stat", () => {
  it("pairs a label with its value", () => {
    render(<Stat label="Dashboards" value={8} />);
    expect(screen.getByRole("term")).toHaveTextContent("Dashboards");
    expect(screen.getByRole("definition")).toHaveTextContent("8");
  });
});
