import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import { InteractionSection } from "../interaction-section";
import { ConceptSelectorStart } from "../concept-selector-start";
import type { Concept } from "@/hooks/use-concepts";
import type { WiringTerm } from "@/lib/ontology/concept-wiring";

const store = () => useWidgetEditorStore.getState();
const PAGES = [{ id: "p1", title: "Overview" }];

const side = (entityKey: string, keyPropertyKey: string) => ({
  connectionId: "pg",
  entityKey,
  keyPropertyKey,
});
const CUSTOMER: Concept = {
  id: "c1",
  name: "Customer",
  parameter: "customer",
  description: "",
  sides: [side("customers", "email"), side("orders", "customer_email")],
};

beforeEach(() => {
  useWidgetEditorStore.setState({
    clickActionEnabled: true,
    actionRules: [],
    title: "",
    paramWidgetName: "",
  });
});

describe("Click action offers concepts (#2485)", () => {
  const open = (
    field: string,
    connectionId = "pg",
    terms: WiringTerm[] = [],
  ) => {
    useWidgetEditorStore.setState({
      chartType: "table",
      connectionId,
      availableFields: [field],
      actionRules: [
        {
          id: "r1",
          type: "set-parameter",
          triggerColumn: field,
          parameterMapping: { parameterName: "", sourceField: field },
        },
      ],
    });
    render(
      <InteractionSection
        clickActionCollisions={[]}
        pages={PAGES}
        concepts={[CUSTOMER]}
        terms={terms}
      />,
    );
  };

  it.each(["email", "customer_email"])(
    "offers Set Customer on %s, a key on the connection, and saves the plain parameter",
    (field) => {
      open(field);
      fireEvent.click(
        screen.getByRole("button", {
          name: `Set Customer ($param_customer) to this ${field}`,
        }),
      );
      expect(store().actionRules[0].parameterMapping).toEqual({
        parameterName: "customer",
        sourceField: field,
      });
      expect(Object.keys(store().actionRules[0])).not.toContain("conceptId");
    },
  );

  it("names the entity on the button when the key's name is on two entities", () => {
    const property = (entity: string): WiringTerm => ({
      kind: "property",
      key: "email",
      parentKey: `entity:${entity}`,
      displayName: "",
      hidden: false,
    });
    open("email", "pg", [
      {
        ...property("customers"),
        kind: "entity",
        key: "customers",
        parentKey: "",
      },
      property("customers"),
      property("staff"),
    ]);
    expect(
      screen.getByRole("button", {
        name: "Set Customer ($param_customer) to this email (customers.email)",
      }),
    ).toBeTruthy();
  });

  it("offers no button for a side whose key the connection no longer has (#2552)", () => {
    open("email", "pg", [
      {
        kind: "entity",
        key: "customers",
        parentKey: "",
        displayName: "",
        hidden: false,
      },
      {
        kind: "property",
        key: "name",
        parentKey: "entity:customers",
        displayName: "",
        hidden: false,
      },
    ]);
    expect(screen.queryByRole("button", { name: /^Set Customer/ })).toBeNull();
  });

  it.each([
    ["a field that is no key", "total", "pg"],
    ["a connection with no side", "email", "other"],
  ])("offers nothing for %s", (_, field, connectionId) => {
    open(field, connectionId);
    expect(screen.queryByRole("button", { name: /^Set Customer/ })).toBeNull();
  });
});

describe("New selector for a concept (#2485)", () => {
  it("names the selector after the concept and sets its plain parameter", () => {
    const onPick = vi.fn();
    render(<ConceptSelectorStart concepts={[CUSTOMER]} onPick={onPick} />);
    fireEvent.click(
      screen.getByRole("button", { name: "New selector for Customer" }),
    );
    expect(onPick).toHaveBeenCalledWith(CUSTOMER);
    expect(store().title).toBe("Customer");
    expect(store().paramWidgetName).toBe("customer");
  });

  it("offers nothing without a concept", () => {
    render(<ConceptSelectorStart concepts={[]} onPick={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
